"""
FormBot Lambda Backend
Handles user authentication, data storage, and CRM synchronization
"""

import json
import os
import time
from typing import Dict, Any, Optional
import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError, ConnectTimeoutError, ReadTimeoutError
from botocore.config import Config
from decimal import Decimal
import urllib.request
import urllib.parse
import base64
import uuid

# Redis client (lazy initialization)
redis_client = None
REDIS_TTL = 365 * 24 * 60 * 60  # 365 days in seconds

# Initialize DynamoDB with two tables (with timeout config)
# Note: If Lambda is in VPC with NAT Gateway, these timeouts may need to be higher
dynamodb_config = Config(
    connect_timeout=10,
    read_timeout=10,
    retries={'max_attempts': 2, 'mode': 'standard'}
)
dynamodb = boto3.resource('dynamodb', config=dynamodb_config)
dynamodb_client = boto3.client('dynamodb', config=dynamodb_config)
users_table_name = os.environ.get('USERS_TABLE', 'formbot-users')
profiles_table_name = os.environ.get('PROFILES_TABLE', 'formbot-profiles')

users_table = dynamodb.Table(users_table_name)
profiles_table = dynamodb.Table(profiles_table_name)
documents_table_name = os.environ.get('DOCUMENTS_TABLE', 'formbot-documents')
documents_table = dynamodb.Table(documents_table_name)

s3_client = boto3.client('s3')
s3_bucket_name = os.environ.get('S3_BUCKET', 'formbot-documents')


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for FormBot that handles user data and CRM sync
    through API Gateway.
    """
    try:
        print(f"🔵 [LAMBDA] Received event: {json.dumps(event, default=str)}")
        
        # Handle OPTIONS requests for CORS
        if event.get('httpMethod') == 'OPTIONS':
            print("✅ [LAMBDA] Handling OPTIONS request")
            return create_response(200, {})
        
        # Get HTTP method and path
        http_method = event.get('httpMethod', 'POST')
        raw_path = event.get('path', '/')
        
        # Remove API Gateway stage from path
        if raw_path.startswith('/Prod/'):
            path = raw_path[5:]
        elif raw_path.startswith('/Stage/'):
            path = raw_path[7:]
        elif raw_path.startswith('/Dev/'):
            path = raw_path[5:]
        else:
            path = raw_path
        
        print(f"🔵 [LAMBDA] Method: {http_method}, Path: {path}, Raw path: {raw_path}")
        
        # Route to appropriate handler
        if path == '/api/user/register' and http_method == 'POST':
            return handle_user_register(event, context)
        
        elif path == '/api/user/data' and http_method == 'POST':
            return handle_store_employee_data(event, context)
        
        elif path == '/api/user/data' and http_method == 'GET':
            return handle_get_user_data(event, context)
        
        elif path == '/api/profiles' and http_method == 'GET':
            return handle_get_profiles(event, context)
        
        elif path == '/api/profiles' and http_method == 'POST':
            return handle_create_profile(event, context)
        
        elif path == '/api/profiles' and http_method == 'PUT':
            return handle_update_profile(event, context)
        
        elif path == '/api/sync' and http_method == 'GET':
            return handle_sync(event, context)
        
        elif path == '/api/webhook' and http_method == 'POST':
            return handle_zapier_webhook(event, context)
        
        elif path == '/api/user/register-by-email' and http_method == 'POST':
            return handle_email_registration(event, context)
        
        elif path == '/api/field-mapping' and http_method == 'POST':
            # Single POST endpoint handles both get and store operations
            # Check body to determine action
            try:
                body_str = event.get('body', '{}')
                print(f"🔵 [LAMBDA] Field mapping request body: {body_str}")
                
                if not body_str:
                    body_str = '{}'
                
                body = json.loads(body_str)
                action = body.get('action', 'get')
                
                print(f"🔵 [LAMBDA] Field mapping action: {action}")
                
                if action == 'store' and body.get('matchedKey'):
                    print("🔵 [LAMBDA] Routing to store handler")
                    return handle_post_field_mapping(event, context)
                else:
                    print("🔵 [LAMBDA] Routing to get handler")
                    return handle_get_field_mapping(event, context)
            except json.JSONDecodeError as e:
                print(f"❌ [LAMBDA] JSON decode error: {str(e)}, body: {event.get('body', '')}")
                return create_response(400, {'error': 'Invalid JSON body', 'details': str(e)})
            except Exception as e:
                print(f"❌ [LAMBDA] Error in field-mapping routing: {str(e)}")
                import traceback
                traceback.print_exc()
                return create_response(500, {'error': 'Internal routing error', 'details': str(e)})
        
        elif path == '/api/batch-field-mapping' and http_method == 'POST':
            return handle_batch_field_mapping(event, context)
        
        elif path == '/api/documents/upload' and http_method == 'POST':
            return handle_document_upload(event, context)
        
        elif path == '/api/documents' and http_method == 'POST':
            return handle_save_document(event, context)
        
        elif path == '/api/documents' and http_method == 'GET':
            return handle_get_documents(event, context)
        
        elif path.startswith('/api/documents/') and http_method == 'GET':
            document_id = path.split('/')[-1]
            if document_id == 'presigned-url':
                return handle_get_presigned_url(event, context)
            else:
                return handle_get_document(event, context)
        
        elif path.startswith('/api/documents/') and http_method == 'DELETE':
            return handle_delete_document(event, context)
        
        elif path == '/health':
            return health_check()
        
        else:
            return create_response(404, {'error': 'Endpoint not found'})
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def handle_user_register(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Register/update user after Google Sign-In
    POST /api/user/register
    Body: {"userId": "google_123", "email": "user@gmail.com", "name": "John Doe"}
    """
    try:
        body = json.loads(event.get('body', '{}'))
        
        user_id = body.get('userId')
        email = body.get('email', '').lower().strip()  # Normalize email to lowercase
        display_name = body.get('name')
        picture = body.get('picture', '')
        
        if not user_id or not email:
            return create_response(400, {'error': 'userId and email are required'})
        
        print(f"Registering user: {user_id} ({email})")
        
        # Check if user exists
        existing_user = None
        try:
            response = users_table.get_item(Key={'userId': user_id})
            existing_user = response.get('Item')
        except:
            pass
        
        timestamp = int(time.time() * 1000)
        is_new_user = existing_user is None
        
        # Upsert user to formbot-users table (email stored in lowercase)
        users_table.put_item(
            Item={
                'userId': user_id,
                'email': email,  # Always stored in lowercase
                'displayName': display_name,
                'profilePicture': picture,
                'createdAt': existing_user.get('createdAt', timestamp) if existing_user else timestamp,
                'lastLoginAt': timestamp,
                'orgId': existing_user.get('orgId') if existing_user else None,
                'settings': existing_user.get('settings', '{}') if existing_user else '{}'
            }
        )
        
        print(f"✓ User {'created' if is_new_user else 'updated'}: {user_id}")
        
        # Create default profile if new user
        if is_new_user:
            profiles_table.put_item(
                Item={
                    'userId': user_id,
                    'profileId': 'default',
                    'label': 'Default Profile',
                    'fields': '{}',
                    'source': 'user',
                    'isDefault': True,
                    'createdAt': timestamp,
                    'updatedAt': timestamp
                }
            )
            print(f"✓ Created default profile for user: {user_id}")
        
        return create_response(200, {
            'success': True,
            'userId': user_id,
            'isNewUser': is_new_user,
            'message': f"User {'registered' if is_new_user else 'updated'} successfully"
        })
    
    except Exception as e:
        print(f"User registration error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(400, {'error': f'Registration failed: {str(e)}'})


def handle_store_employee_data(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Store employee data from Zapier/CRM as a profile
    POST /api/user/data
    Body: {"userId": "google_123", "employeeId": "EMP-001", "firstName": "Jane", ...}
    """
    try:
        body = json.loads(event.get('body', '{}'))
        
        user_id = body.get('userId')
        if not user_id:
            return create_response(400, {'error': 'userId is required'})
        
        print(f"Storing employee data for user: {user_id}")
        
        timestamp = int(time.time() * 1000)
        employee_id = body.get('employeeId', f"emp_{timestamp}")
        
        # Extract employee name
        name = body.get('name') or f"{body.get('firstName', '')} {body.get('lastName', '')}".strip() or 'Employee Data'
        
        # Remove metadata fields from data
        fields_data = {k: v for k, v in body.items() if k not in ['userId', 'employeeId']}
        
        # Store as profile in formbot-profiles table
        profiles_table.put_item(
            Item={
                'userId': user_id,
                'profileId': f'crm_{employee_id}',
                'label': f'Employee: {name}',
                'fields': json.dumps(fields_data),
                'source': 'crm',
                'isDefault': False,
                'createdAt': timestamp,
                'updatedAt': timestamp
            }
        )
        
        print(f"✓ Employee profile created: crm_{employee_id}")
        
        return create_response(200, {
            'success': True,
            'message': 'Employee profile created successfully',
            'profileId': f'crm_{employee_id}'
        })
    
    except Exception as e:
        print(f"Store data error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(400, {'error': f'Failed to store data: {str(e)}'})


def handle_get_user_data(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get user data from formbot-users table
    GET /api/user/data?userId=google_123
    """
    try:
        params = event.get('queryStringParameters', {}) or {}
        user_id = params.get('userId')
        
        if not user_id:
            return create_response(400, {'error': 'userId parameter required'})
        
        # Query users table
        response = users_table.get_item(Key={'userId': user_id})
        
        item = response.get('Item')
        if not item:
            return create_response(404, {'error': 'User not found'})
        
        # Convert Decimal to int/float for JSON
        item = json.loads(json.dumps(item, default=decimal_default))
        
        return create_response(200, item)
    
    except Exception as e:
        print(f"Get user error: {str(e)}")
        return create_response(400, {'error': str(e)})


def handle_get_profiles(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get all profiles for user from formbot-profiles table
    GET /api/profiles?userId=google_123&since=1699876543
    Uses GSI to query by userId
    """
    try:
        params = event.get('queryStringParameters', {}) or {}
        user_id = params.get('userId')
        since = int(params.get('since', '0'))
        
        if not user_id:
            return create_response(400, {'error': 'userId parameter required'})
        
        print(f"Fetching profiles for user: {user_id} since: {since}")
        
        # Query using GSI on userId
        query_start = time.time()
        try:
            if since > 0:
                # Try query with both userId and updatedAt
                try:
                    response = profiles_table.query(
                        IndexName='userId-index',
                        KeyConditionExpression=Key('userId').eq(user_id) & Key('updatedAt').gt(since)
                    )
                except ClientError as e:
                    if 'ValidationException' in str(e) and ('key attributes' in str(e).lower() or 'exceeds' in str(e).lower()):
                        # Index doesn't have updatedAt as sort key - query all and filter
                        print("⚠️ Index doesn't support updatedAt filter, querying all and filtering")
                        response = profiles_table.query(
                            IndexName='userId-index',
                            KeyConditionExpression=Key('userId').eq(user_id)
                        )
                        # Filter by updatedAt in Python
                        items = response.get('Items', [])
                        response['Items'] = [item for item in items if item.get('updatedAt', 0) > since]
                    else:
                        raise
            else:
                response = profiles_table.query(
                    IndexName='userId-index',
                    KeyConditionExpression=Key('userId').eq(user_id)
                )
            query_latency = (time.time() - query_start) * 1000
            print(f"⏱️ [DynamoDB] Query completed in {query_latency:.2f}ms")
        except (ConnectTimeoutError, ReadTimeoutError) as timeout_error:
            query_latency = (time.time() - query_start) * 1000
            print(f"❌ [DynamoDB] Connection timeout after {query_latency:.2f}ms: {str(timeout_error)}")
            print(f"❌ [DynamoDB] This usually means Lambda is in VPC without DynamoDB VPC endpoint")
            print(f"❌ [DynamoDB] Solution: Add DynamoDB VPC endpoint (see VPC_ENDPOINT_SETUP.md)")
            print(f"❌ [DynamoDB] Quick fix: Run 'python find_vpc_config.py' to get VPC details")
            return create_response(503, {
                'error': 'DynamoDB connection timeout',
                'message': 'Unable to connect to DynamoDB. Check VPC configuration.',
                'details': 'Lambda may need DynamoDB VPC endpoint or NAT Gateway'
            })
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_msg = str(e)
            print(f"❌ [DynamoDB] ClientError: {error_code} - {error_msg}")
            if 'ValidationException' in str(e) and ('index' in str(e).lower() or 'does not exist' in str(e).lower()):
                # Index doesn't exist - fallback to scan (slower but works)
                print("⚠️ userId-index not found, using scan fallback")
                print("   Run add_userid_index.py to add the index for better performance")
                try:
                    scan_start = time.time()
                    response = profiles_table.scan(
                        FilterExpression=Attr('userId').eq(user_id)
                    )
                    scan_latency = (time.time() - scan_start) * 1000
                    print(f"⏱️ [DynamoDB] Scan completed in {scan_latency:.2f}ms")
                    # Filter by updatedAt if needed
                    if since > 0:
                        items = response.get('Items', [])
                        response['Items'] = [item for item in items if item.get('updatedAt', 0) > since]
                except (ConnectTimeoutError, ReadTimeoutError) as scan_timeout:
                    scan_latency = (time.time() - scan_start) * 1000 if 'scan_start' in locals() else 0
                    print(f"❌ [DynamoDB] Scan timeout after {scan_latency:.2f}ms")
                    return create_response(503, {
                        'error': 'DynamoDB connection timeout',
                        'message': 'Unable to connect to DynamoDB. Check VPC configuration.'
                    })
            else:
                raise
        
        items = response.get('Items', [])
        
        # Convert items
        profiles = []
        for item in items:
            profile = json.loads(json.dumps(item, default=decimal_default))
            # Parse fields JSON if it's a string
            if 'fields' in profile and isinstance(profile['fields'], str):
                try:
                    profile['fields'] = json.loads(profile['fields'])
                except:
                    pass
            profiles.append(profile)
        
        print(f"✓ Found {len(profiles)} profile(s)")
        
        return create_response(200, {
            'profiles': profiles,
            'count': len(profiles),
            'timestamp': int(time.time() * 1000)
        })
    
    except Exception as e:
        print(f"Get profiles error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(400, {'error': str(e)})


def handle_create_profile(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Create or update profile in formbot-profiles table
    POST /api/profiles
    Body: {"userId": "google_123", "profileId": "work", "label": "Work", "fields": {...}}
    """
    try:
        body = json.loads(event.get('body', '{}'))
        user_id = body.get('userId')
        
        if not user_id:
            return create_response(400, {'error': 'userId required'})
        
        timestamp = int(time.time() * 1000)
        profile_id = body.get('profileId', f"profile_{timestamp}")
        
        # Check if profile exists to preserve createdAt (using profileId as primary key)
        existing_profile = None
        try:
            response = profiles_table.get_item(
                Key={
                    'profileId': profile_id
                }
            )
            existing_profile = response.get('Item')
        except:
            pass
        
        profiles_table.put_item(
            Item={
                'profileId': profile_id,
                'userId': user_id,
                'label': body.get('label', 'New Profile'),
                'fields': json.dumps(body.get('fields', {})),
                'source': body.get('source', 'user'),
                'sourceId': body.get('sourceId'),  # Store sourceId for matching updates
                'profileType': body.get('profileType'),  # Store profileType (google-sheets, zapier, etc.)
                'isDefault': body.get('isDefault', False),
                'createdAt': existing_profile.get('createdAt', timestamp) if existing_profile else timestamp,
                'updatedAt': timestamp
            }
        )
        
        action = 'updated' if existing_profile else 'created'
        print(f"✓ Profile {action}: {profile_id} for user: {user_id}")
        
        return create_response(200, {
            'success': True,
            'profileId': profile_id,
            'action': action
        })
    
    except Exception as e:
        print(f"Create profile error: {str(e)}")
        return create_response(400, {'error': str(e)})


def handle_update_profile(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Update existing profile in formbot-profiles table
    PUT /api/profiles
    Body: {"userId": "google_123", "profileId": "work", "label": "Work", "fields": {...}}
    """
    return handle_create_profile(event, context)  # PUT uses same logic as POST


def handle_sync(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Sync endpoint - Get new/updated profiles for extension
    GET /api/sync?userId=google_123&lastSync=1699876543
    
    Returns profiles in the format expected by the extension
    Uses GSI to query by userId
    """
    try:
        params = event.get('queryStringParameters', {}) or {}
        user_id = params.get('userId')
        last_sync = int(params.get('lastSync', '0'))
        
        if not user_id:
            return create_response(400, {'error': 'userId required'})
        
        print(f"Syncing profiles for user: {user_id} since: {last_sync}")
        
        # Query using GSI on userId
        try:
            if last_sync > 0:
                # Try query with both userId and updatedAt
                try:
                    response = profiles_table.query(
                        IndexName='userId-index',
                        KeyConditionExpression=Key('userId').eq(user_id) & Key('updatedAt').gt(last_sync)
                    )
                except ClientError as e:
                    if 'ValidationException' in str(e) and ('key attributes' in str(e).lower() or 'exceeds' in str(e).lower()):
                        # Index doesn't have updatedAt as sort key - query all and filter
                        print("⚠️ Index doesn't support updatedAt filter, querying all and filtering")
                        response = profiles_table.query(
                            IndexName='userId-index',
                            KeyConditionExpression=Key('userId').eq(user_id)
                        )
                        # Filter by updatedAt in Python
                        items = response.get('Items', [])
                        response['Items'] = [item for item in items if item.get('updatedAt', 0) > last_sync]
                    else:
                        raise
            else:
                # First sync - get all profiles
                response = profiles_table.query(
                    IndexName='userId-index',
                    KeyConditionExpression=Key('userId').eq(user_id)
                )
        except ClientError as e:
            if 'ValidationException' in str(e) and ('index' in str(e).lower() or 'does not exist' in str(e).lower()):
                # Index doesn't exist - fallback to scan (slower but works)
                print("⚠️ userId-index not found, using scan fallback")
                print("   Run add_userid_index.py to add the index for better performance")
                response = profiles_table.scan(
                    FilterExpression=Attr('userId').eq(user_id)
                )
                # Filter by updatedAt if needed
                if last_sync > 0:
                    items = response.get('Items', [])
                    response['Items'] = [item for item in items if item.get('updatedAt', 0) > last_sync]
            else:
                raise
        
        items = response.get('Items', [])
        
        # Convert and parse to match extension's SavedFormData format
        sync_items = []
        for item in items:
            profile = json.loads(json.dumps(item, default=decimal_default))
            
            # Parse fields JSON
            fields_data = {}
            if 'fields' in profile and isinstance(profile['fields'], str):
                try:
                    fields_data = json.loads(profile['fields'])
                except:
                    pass
            else:
                fields_data = profile.get('fields', {})
            
            # Convert to extension format
            sync_item = {
                'itemId': profile.get('profileId'),
                'name': profile.get('label', 'Untitled Profile'),
                'data': fields_data,
                'timestamp': profile.get('updatedAt', profile.get('createdAt', int(time.time() * 1000))),
                'source': profile.get('source', 'user')
            }
            
            sync_items.append(sync_item)
        
        print(f"✓ Syncing {len(sync_items)} profile(s)")
        
        return create_response(200, {
            'items': sync_items,
            'count': len(sync_items),
            'timestamp': int(time.time() * 1000)
        })
    
    except Exception as e:
        print(f"Sync error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(400, {'error': str(e)})


def health_check() -> Dict[str, Any]:
    """Health check endpoint"""
    return create_response(200, {
        'status': 'healthy',
        'service': 'FormBot Lambda',
        'timestamp': int(time.time() * 1000)
    })


def handle_email_registration(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Register employee email → userId mapping
    POST /api/user/register-by-email
    Body: {"userId": "google_123", "email": "john@company.com"}
    
    This allows Zapier to lookup userId by email
    """
    try:
        body = json.loads(event.get('body', '{}'))
        
        user_id = body.get('userId')
        email = body.get('email', '').lower().strip()
        
        if not user_id or not email:
            return create_response(400, {
                'error': 'userId and email are required'
            })
        
        print(f"Registering email mapping: {email} → {user_id}")
        
        timestamp = int(time.time() * 1000)
        
        # Store email → userId mapping in users table
        users_table.update_item(
            Key={'userId': user_id},
            UpdateExpression='SET email = :email, registeredEmail = :email, updatedAt = :timestamp',
            ExpressionAttributeValues={
                ':email': email,
                ':timestamp': timestamp
            }
        )
        
        print(f"✓ Email registered: {email}")
        
        return create_response(200, {
            'success': True,
            'message': 'Email registered successfully',
            'email': email,
            'userId': user_id
        })
    
    except Exception as e:
        print(f"Email registration error: {str(e)}")
        return create_response(400, {'error': str(e)})


def handle_zapier_webhook(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle incoming webhook from Zapier/CRM
    POST /api/webhook
    Body: {
        "userId": "google_123",      # Option 1: Direct userId
        OR
        "email": "john@company.com", # Option 2: Lookup by email
        
        "employeeId": "EMP001",
        "firstName": "John",
        "lastName": "Doe",
        ... (any other fields from Zapier)
    }
    
    Creates a profile in DynamoDB from the webhook data
    """
    try:
        # Parse body
        body_str = event.get('body', '{}')
        if not body_str or body_str.strip() == '':
            body_str = '{}'
        
        try:
            body = json.loads(body_str)
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON in body: {body_str[:200]}")
            return create_response(400, {
                'error': 'Invalid JSON',
                'message': f'Request body must be valid JSON. Error: {str(e)}',
                'received_body': body_str[:200] if len(body_str) > 0 else '(empty)'
            })
        
        # Check if body is empty
        if not body or len(body) == 0:
            print("⚠️ Empty body received from webhook")
            return create_response(400, {
                'error': 'Empty request body',
                'message': 'The webhook payload is empty. Please configure your Zapier Zap to send data in the JSON body.',
                'help': 'In Zapier, make sure you map fields in the "Data (JSON)" section of the Webhooks action.'
            })
        
        print(f"📥 Webhook received with {len(body)} fields: {list(body.keys())}")
        
        # Check headers for Zapier metadata
        headers = event.get('headers', {}) or {}
        zap_id = headers.get('X-Zapier-Zap-Id') or headers.get('X-Zap-Id') or headers.get('X-Zapier-Webhook-Id')
        trigger_id = headers.get('X-Zapier-Trigger-Id') or headers.get('X-Trigger-Id')
        
        print(f"📋 Zapier metadata:")
        print(f"   Zap ID: {zap_id}")
        print(f"   Trigger ID: {trigger_id}")
        print(f"   Available headers: {list(headers.keys())}")
        
        # Option 1: Direct userId
        user_id = body.get('userId')
        
        # Option 2: Lookup by email (from sheet row or Zapier user)
        if not user_id:
            # Try multiple email field names
            email = (body.get('email') or 
                    body.get('Email') or 
                    body.get('userEmail') or 
                    body.get('googleUserEmail') or 
                    body.get('zapierUserEmail') or
                    body.get('sheetUserEmail') or
                    '').lower().strip()
            
            if email:
                print(f"Looking up userId by email: {email}")
                # Query users table by email (case-insensitive)
                # First try exact match (lowercase)
                response = users_table.scan(
                    FilterExpression=Attr('email').eq(email)
                )
                items = response.get('Items', [])
                
                # If not found, try case-insensitive search (scan all and filter)
                if not items:
                    print(f"⚠️ Exact match not found, trying case-insensitive search...")
                    all_users = users_table.scan()
                    all_items = all_users.get('Items', [])
                    # Filter case-insensitively
                    items = [item for item in all_items 
                            if item.get('email', '').lower().strip() == email]
                    if items:
                        print(f"✓ Found user with case-insensitive match")
                
                if items:
                    user_id = items[0]['userId']
                    found_email = items[0].get('email', 'N/A')
                    print(f"✓ Found userId: {user_id} (stored email: {found_email})")
                else:
                    # Debug: List some emails in the database to help troubleshoot
                    print(f"❌ Email not found: {email}")
                    print(f"   Checking database contents...")
                    sample_scan = users_table.scan(Limit=5)
                    sample_items = sample_scan.get('Items', [])
                    sample_emails = [item.get('email', 'N/A') for item in sample_items]
                    print(f"   Sample emails in database: {sample_emails}")
                    
                    return create_response(404, {
                        'error': 'User not found',
                        'message': f'No user registered with email: {email}. Please have the employee sign in to FormBot first.',
                        'help': 'The user needs to sign in to FormBot extension at least once before profiles can be created for them.',
                        'received_email': email,
                        'debug_info': f'Searched for: "{email}" (normalized). Sample emails in DB: {sample_emails[:3]}'
                    })
        
        # Option 3: Try to get email from Zapier headers/metadata (if available)
        if not user_id:
            # Check if Zapier includes user info in headers (some Zapier versions do this)
            headers = event.get('headers', {}) or {}
            zapier_user_email = (headers.get('X-Zapier-User-Email') or 
                                headers.get('X-User-Email') or 
                                headers.get('X-Google-User-Email') or
                                '').lower().strip()
            
            if zapier_user_email:
                print(f"Found email in Zapier headers: {zapier_user_email}")
                response = users_table.scan(
                    FilterExpression=Attr('email').eq(zapier_user_email)
                )
                items = response.get('Items', [])
                if items:
                    user_id = items[0]['userId']
                    print(f"✓ Found userId from Zapier headers: {user_id}")
        
        # Option 4: Check if Google Sheets user info is in the body (from Zapier step)
        if not user_id:
            # Zapier might include Google account info if you add a "Get User Info" step
            google_email = (body.get('googleAccountEmail') or 
                           body.get('googleEmail') or 
                           body.get('accountEmail') or
                           body.get('sheetsUserEmail') or
                           '').lower().strip()
            
            if google_email:
                print(f"Found Google account email in body: {google_email}")
                response = users_table.scan(
                    FilterExpression=Attr('email').eq(google_email)
                )
                items = response.get('Items', [])
                if items:
                    user_id = items[0]['userId']
                    print(f"✓ Found userId from Google account email: {user_id}")
        
        if not user_id:
            return create_response(400, {
                'error': 'userId or email is required',
                'message': 'Please include either userId or email in the webhook payload',
                'help': 'Add "email" field to your Zapier webhook JSON body, or add a step to get the Google user email. Example: {"email": "user@company.com", "col_a": "value", ...}',
                'received_fields': list(body.keys()),
                'suggestion': 'In Zapier, add a "Get User Info" step or map the email column from your Google Sheet'
            })
        
        print(f"📥 Webhook received for user: {user_id}")
        print(f"📦 Data fields: {list(body.keys())}")
        print(f"📦 Field values sample: {dict(list(body.items())[:5])}")
        
        timestamp = int(time.time() * 1000)
        
        # Detect if this is Google Sheets data - check for common Google Sheets indicators
        body_keys_lower = [k.lower() for k in body.keys()]
        body_keys_original = list(body.keys())
        
        # Check for row indicators (Zapier sends these from Google Sheets)
        has_row_number = any(key in ['rownumber', 'row_number', 'row', 'rowid', 'row_id', 'rowid', 'rownum'] for key in body_keys_lower)
        # Check for sheet/spreadsheet identifiers
        has_sheet_indicators = any(key in ['spreadsheetid', 'sheetid', 'sheet_id', 'spreadsheet_id', 'googlesheets', 'sheetname', 'spreadsheet', 'worksheet', 'sheetname'] 
                                   for key in body_keys_lower)
        # Check if source field indicates Google Sheets
        source_field = body.get('source', '').lower()
        has_source_indicator = source_field in ['google-sheets', 'googlesheets', 'sheets']
        
        # Also check for Zapier's Google Sheets column naming patterns (e.g., "1. Column Name")
        has_zapier_column_pattern = any(key.startswith(('1.', '2.', '3.')) or key.startswith('col_') for key in body_keys_original)
        
        is_google_sheets = has_row_number or has_sheet_indicators or has_source_indicator or has_zapier_column_pattern
        
        print(f"🔍 Google Sheets detection:")
        print(f"   Body keys: {body_keys_original}")
        print(f"   Has row_number: {has_row_number}")
        print(f"   Has sheet indicators: {has_sheet_indicators}")
        print(f"   Has source indicator: {has_source_indicator}")
        print(f"   Has Zapier column pattern: {has_zapier_column_pattern}")
        print(f"   Is Google Sheets: {is_google_sheets}")
        
        # Generate profile ID - ALWAYS use consistent ID
        employee_id = body.get('employeeId') or body.get('id')
        
        if is_google_sheets or not employee_id:
            # Treat as Google Sheets - use consistent profile ID per user
            is_google_sheets = True  # Force to True
            
            # Priority 1: Try to get spreadsheet/sheet identifier from body
            spreadsheet_id = (body.get('spreadsheetId') or body.get('spreadsheet_id') or 
                            body.get('sheetId') or body.get('sheet_id') or
                            body.get('spreadsheet') or body.get('worksheet'))
            
            # Priority 2: Use Zap ID from headers (consistent per Zap)
            if spreadsheet_id:
                # All rows from same sheet go to same profile
                profile_id = f"googlesheets_{spreadsheet_id}"
                print(f"✓ Using spreadsheetId for profile: {spreadsheet_id}")
            elif zap_id:
                # Use Zap ID - all rows from same Zap go to same profile
                profile_id = f"googlesheets_zap_{zap_id}"
                print(f"✓ Using Zap ID for profile: {zap_id}")
            else:
                # Fallback: ALWAYS use userId-based profile for Google Sheets (one profile per user)
                # This ensures all rows from any sheet for this user go to same profile
                profile_id = f"googlesheets_{user_id}"
                print(f"⚠️ No spreadsheetId or Zap ID found, using userId-based profile: {profile_id}")
        else:
            # For CRM: ALWAYS use ONE profile per user labeled "CRM Data"
            # All CRM webhook data goes into the same profile, regardless of employeeId
            profile_id = f"crm_{user_id}"
            print(f"✓ Using single CRM profile per user: {profile_id}")
        
        # Ensure source and profileType are set correctly
        if is_google_sheets:
            source = 'google-sheets'
            profile_type = 'google-sheets'
            # Use spreadsheetId, Zap ID, or userId as sourceId for grouping all rows
            source_id = (body.get('spreadsheetId') or body.get('spreadsheet_id') or 
                        body.get('sheetId') or zap_id or f"sheet_{user_id}")
            # Extract name for Google Sheets profile
            name = body.get('name')
            if not name:
                first_name = body.get('firstName', '')
                last_name = body.get('lastName', '')
                name = f"{first_name} {last_name}".strip() or 'Google Sheets Data'
        else:
            # For CRM: Always use "CRM Data" as the label
            source = 'zapier'
            profile_type = body.get('profileType', 'zapier')
            source_id = f"crm_{user_id}"  # Consistent sourceId for CRM
            name = 'CRM Data'  # Always use "CRM Data" as label
        
        # Remove metadata fields - everything else goes to the profile
        metadata_fields = ['userId', 'employeeId', 'id', 'email', 'spreadsheetId', 'sheetId', 'rowNumber', 'row', 'row_id']
        profile_fields = {k: v for k, v in body.items() if k not in metadata_fields and v}
        
        print(f"✓ Profile name: {name}")
        print(f"✓ Profile ID: {profile_id}")
        print(f"✓ Profile type: {profile_type}")
        print(f"✓ Source: {source}")
        print(f"✓ Source ID: {source_id}")
        print(f"✓ Field count: {len(profile_fields)}")
        print(f"✓ Is Google Sheets: {is_google_sheets}")
        
        # Check if profile exists (for updates) - for Google Sheets, always update same profile
        existing_profile = None
        try:
            # Try to find existing profile by profileId (for Google Sheets, this will be consistent)
            response = profiles_table.get_item(
                Key={'profileId': profile_id}
            )
            existing_profile = response.get('Item')
            if existing_profile and existing_profile.get('userId') == user_id:
                print(f"✓ Found existing profile: {profile_id}")
            else:
                existing_profile = None  # Wrong user, don't use it
        except:
            pass
        
        # If not found by profileId, try by sourceId (for non-Google Sheets)
        if not existing_profile and source_id and not is_google_sheets:
            try:
                response = profiles_table.scan(
                    FilterExpression=Attr('userId').eq(user_id) & Attr('sourceId').eq(source_id)
                )
                items = response.get('Items', [])
                if items:
                    existing_profile = items[0]
                    profile_id = existing_profile['profileId']
                    print(f"✓ Found existing profile by sourceId: {profile_id}")
            except:
                pass
        
        # Update label for Google Sheets
        if is_google_sheets:
            label = f"Google Sheets: {name}"
        else:
            label = f"CRM: {name}"
        
        # Preserve createdAt if updating existing profile
        created_at = timestamp
        if existing_profile:
            created_at = existing_profile.get('createdAt', timestamp)
        
        # Store each row as a separate object in an array
        # Format: {"rows": [{"col_a": "value1", "col_b": "value2", "row": "1"}, ...]}
        if existing_profile:
            # Parse existing fields - should be {"rows": [...]}
            try:
                existing_fields = json.loads(existing_profile.get('fields', '{}'))
            except:
                existing_fields = {}
            
            # Get existing rows array, or initialize if doesn't exist
            if 'rows' in existing_fields and isinstance(existing_fields['rows'], list):
                rows_array = existing_fields['rows']
            else:
                # Migrate old format: if fields are flat, convert to rows array
                rows_array = []
                if existing_fields and 'rows' not in existing_fields:
                    # Old format - convert existing flat fields to first row
                    first_row = {k: v for k, v in existing_fields.items() if k != 'rows'}
                    if first_row:
                        rows_array.append(first_row)
            
            # Get row number from current data
            row_number = (body.get('rowNumber') or body.get('row_number') or 
                         body.get('row') or body.get('row_id') or 
                         str(len(rows_array) + 1))
            
            # Create new row object with all fields + row number
            new_row = profile_fields.copy()
            new_row['row'] = str(row_number)
            
            # Add new row to array
            rows_array.append(new_row)
            
            # Store as {"rows": [...]}
            profile_fields = {'rows': rows_array}
            print(f"✓ Added row {row_number} to array. Total rows: {len(rows_array)}")
        else:
            # First row - create array with single row
            row_number = (body.get('rowNumber') or body.get('row_number') or 
                         body.get('row') or body.get('row_id') or '1')
            new_row = profile_fields.copy()
            new_row['row'] = str(row_number)
            profile_fields = {'rows': [new_row]}
            print(f"✓ Created new rows array with row {row_number}")
        
        # Store profile in DynamoDB
        profiles_table.put_item(
            Item={
                'profileId': profile_id,
                'userId': user_id,
                'label': label,
                'fields': json.dumps(profile_fields),
                'source': source,
                'sourceId': source_id,
                'profileType': profile_type,
                'isDefault': False,
                'createdAt': created_at,
                'updatedAt': timestamp
            }
        )
        
        action = 'updated' if existing_profile else 'created'
        print(f"✅ Profile {action} in DynamoDB: {profile_id} (source: {source}, type: {profile_type})")
        
        return create_response(200, {
            'success': True,
            'message': f'Profile {action} successfully',
            'profileId': profile_id,
            'userId': user_id,
            'label': label,
            'fieldCount': len(profile_fields),
            'source': source,
            'profileType': profile_type,
            'action': action
        })
    
    except json.JSONDecodeError:
        return create_response(400, {
            'error': 'Invalid JSON',
            'message': 'Request body must be valid JSON'
        })
    except Exception as e:
        print(f"Webhook error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {
            'error': 'Internal server error',
            'message': str(e)
        })


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Create API Gateway response with CORS headers"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        'body': json.dumps(body)
    }


def get_redis_client():
    """Get or create Redis client with connection pooling"""
    global redis_client
    
    if redis_client is not None:
        try:
            # Test existing connection
            redis_client.ping()
            return redis_client
        except Exception as e:
            print(f"⚠️ [REDIS] Existing connection failed, reconnecting: {str(e)}")
            redis_client = None
    
    # Try to use valkey library first (optimized for Valkey), fallback to redis
    valkey_client = None
    redis_client_lib = None
    
    try:
        import valkey
        valkey_client = valkey
        print("✅ [REDIS] Using valkey-py library (optimized for Valkey)")
    except ImportError:
        try:
            import redis
            redis_client_lib = redis
            print("✅ [REDIS] Using redis library (Valkey-compatible)")
        except ImportError as e:
            print(f"❌ [REDIS] Neither valkey nor redis library installed: {str(e)}")
            print("❌ [REDIS] Install with: pip install valkey OR pip install redis>=5.0.0")
            return None
    
    # Use valkey if available, otherwise use redis
    client_lib = valkey_client if valkey_client else redis_client_lib
    
    try:
        # Get Redis endpoint from environment variables
        # Default to Valkey serverless cache endpoint (can be overridden via env vars)
        redis_host = os.environ.get('REDIS_HOST', 'formbot-redis-gz9sjn.serverless.use1.cache.amazonaws.com')
        redis_port = int(os.environ.get('REDIS_PORT', 6379))
        redis_password = os.environ.get('REDIS_PASSWORD', '')
        # SSL enabled by default for AWS ElastiCache/Valkey serverless cache
        redis_ssl = os.environ.get('REDIS_SSL', 'true').lower() == 'true'
        
        print(f"🔌 [REDIS] Attempting connection to {redis_host}:{redis_port} (SSL: {redis_ssl})...")
        
        # Configure SSL for AWS ElastiCache/Valkey serverless cache
        # AWS ElastiCache uses self-signed certificates, so we disable verification
        # This is safe because we're connecting within AWS VPC
        ssl_cert_reqs = None
        if redis_ssl:
            try:
                import ssl
                # Disable certificate verification for AWS ElastiCache self-signed certs
                ssl_cert_reqs = ssl.CERT_NONE
                print("🔒 [REDIS] SSL enabled with certificate verification disabled (AWS ElastiCache)")
            except Exception as ssl_error:
                print(f"⚠️ [REDIS] SSL configuration failed: {str(ssl_error)}, using basic SSL")
                ssl_cert_reqs = None
        
        # Create client (Valkey or Redis) with connection pooling and shorter timeouts
        if valkey_client:
            # Use Valkey client
            redis_client = valkey.Valkey(
                host=redis_host,
                port=redis_port,
                password=redis_password if redis_password else None,
                ssl=redis_ssl,
                ssl_cert_reqs=ssl_cert_reqs,
                ssl_ca_certs=None,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
                socket_keepalive=True,
                socket_keepalive_options={}
            )
        else:
            # Use Redis client (Valkey-compatible)
            redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password if redis_password else None,
                ssl=redis_ssl,
                ssl_cert_reqs=ssl_cert_reqs,
                ssl_ca_certs=None,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
                socket_keepalive=True,
                socket_keepalive_options={}
            )
        
        # Test connection with thread-based timeout to prevent hanging
        print(f"🔌 [REDIS] Testing connection (timeout: 5s)...")
        connect_start = time.time()
        
        # Use threading to enforce timeout
        import threading
        connection_result = {'success': False, 'error': None, 'exception': None, 'completed': False}
        
        def attempt_connection():
            try:
                redis_client.ping()
                connection_result['success'] = True
                connection_result['completed'] = True
            except Exception as e:
                connection_result['error'] = str(e)
                connection_result['exception'] = e
                connection_result['completed'] = True
        
        # Start connection attempt in thread
        thread = threading.Thread(target=attempt_connection)
        thread.daemon = True
        thread.start()
        
        # Wait with timeout
        thread.join(timeout=5.0)
        
        connect_latency = (time.time() - connect_start) * 1000
        
        # Force flush stdout to ensure logs are written
        import sys
        sys.stdout.flush()
        
        if thread.is_alive():
            # Thread still running = timeout
            print(f"❌ [REDIS] Connection timeout after {connect_latency:.2f}ms - thread still running")
            print(f"❌ [REDIS] Connection is hanging - this indicates a network/VPC issue")
            print(f"❌ [REDIS] Troubleshooting:")
            print(f"   1. Lambda MUST be in same VPC as Redis serverless cache")
            print(f"   2. Lambda security group must allow outbound on port 6379")
            print(f"   3. Redis security group must allow inbound from Lambda SG")
            print(f"   4. Check VPC configuration: Lambda → Configuration → VPC")
            print(f"   5. Redis endpoint: {redis_host}:{redis_port}")
            print(f"   6. Verify Lambda has VPC configuration set")
            print(f"   7. Check CloudWatch VPC logs for connection attempts")
            sys.stdout.flush()
            redis_client = None
            return None
        
        # Check if connection attempt completed
        if not connection_result['completed']:
            print(f"❌ [REDIS] Connection attempt did not complete (latency: {connect_latency:.2f}ms)")
            print(f"❌ [REDIS] This may indicate a VPC/network configuration issue")
            sys.stdout.flush()
            redis_client = None
            return None
        
        # Check result
        if connection_result['success']:
            print(f"✅ [REDIS] Connected successfully (latency: {connect_latency:.2f}ms) - {redis_host}:{redis_port}")
            sys.stdout.flush()
            return redis_client
        else:
            # Connection failed with error
            error = connection_result['exception']
            error_type = type(error).__name__ if error else 'Unknown'
            error_msg = connection_result['error'] or 'Unknown error'
            
            print(f"❌ [REDIS] Connection failed after {connect_latency:.2f}ms: {error_msg}")
            print(f"❌ [REDIS] Error type: {error_type}")
            
            # Check for specific error types
            if error:
                if 'ConnectionError' in error_type or 'Connection' in str(type(error)):
                    print(f"❌ [REDIS] ConnectionError - network/VPC issue likely")
                elif 'Timeout' in error_type or 'timeout' in str(error).lower():
                    print(f"❌ [REDIS] TimeoutError - connection timed out")
                else:
                    print(f"❌ [REDIS] Unexpected error type: {error_type}")
            
            print(f"❌ [REDIS] Troubleshooting:")
            print(f"   1. Lambda MUST be in same VPC as Redis serverless cache")
            print(f"   2. Verify security groups allow traffic on port 6379")
            print(f"   3. Check Redis endpoint: {redis_host}:{redis_port}")
            print(f"   4. Verify Redis serverless cache is active")
            print(f"   5. Check Lambda VPC configuration in AWS Console")
            sys.stdout.flush()
            
            redis_client = None
            return None
            
    except Exception as redis_error:
        # Handle both redis.RedisError and other exceptions
        error_type = type(redis_error).__name__
        error_msg = str(redis_error)
        
        print(f"❌ [REDIS] Error creating Redis client: {error_msg}")
        print(f"❌ [REDIS] Error type: {error_type}")
        
        # Check if it's a connection-related error
        if 'Connection' in error_type or 'connection' in error_msg.lower():
            print(f"❌ [REDIS] Connection error - likely VPC/network issue")
            print(f"❌ [REDIS] Lambda MUST be in same VPC as Redis serverless cache")
        
        import traceback
        traceback.print_exc()
        
        # Force flush to ensure logs are written before Lambda times out
        import sys
        sys.stdout.flush()
        
        redis_client = None
        return None
        print(f"❌ [REDIS] Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        redis_client = None
        return None


def handle_get_field_mapping(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get field mapping from Redis cache
    POST /api/field-mapping
    Body: {"fieldSignature": "abc123", "action": "get"}
    """
    try:
        body_str = event.get('body', '{}')
        print(f"🔍 [API] GET handler - Raw body: {body_str}")
        
        if not body_str:
            body_str = '{}'
        
        body = json.loads(body_str)
        field_signature = body.get('fieldSignature')
        
        print(f"🔍 [API] POST /api/field-mapping (action: get) - fieldSignature: {field_signature}")
        
        if not field_signature:
            print("❌ [API] POST /api/field-mapping - Missing fieldSignature in body")
            return create_response(400, {
                'error': 'fieldSignature required in body',
                'received_body': body
            })
        
        redis_cli = get_redis_client()
        if not redis_cli:
            error_msg = 'Redis connection failed - check CloudWatch logs for details'
            print(f"❌ [API] POST /api/field-mapping - Redis not available: {error_msg}")
            return create_response(503, {
                'error': 'Redis cache unavailable',
                'message': error_msg,
                'details': 'Check Lambda CloudWatch logs for Redis connection errors'
            })
        
        # Get from Redis
        key = f'field_mapping:{field_signature}'
        print(f"📥 [REDIS] GET {key}")
        start_time = time.time()
        cached_value = redis_cli.get(key)
        redis_latency = (time.time() - start_time) * 1000
        
        if not cached_value:
            print(f"❌ [REDIS] Cache MISS for {key} (latency: {redis_latency:.2f}ms)")
            
            # If field info is provided, try AI matching and store result
            field_label = body.get('fieldLabel', '')
            field_name = body.get('fieldName', '')
            available_keys = body.get('availableKeys', [])
            openai_key = body.get('openAIKey', '')
            section_header = body.get('sectionHeader', '')
            nearby_fields = body.get('nearbyFields', [])
            form_purpose = body.get('formPurpose', '')
            
            # Only attempt AI matching if we have the required info
            if field_label and available_keys and openai_key:
                # Check remaining Lambda time to avoid timeout
                if context and hasattr(context, 'get_remaining_time_in_millis'):
                    remaining_ms = context.get_remaining_time_in_millis()
                    if remaining_ms < 5000:
                        print(f"⏱️ [AI] Skipping AI matching - only {remaining_ms}ms remaining (need ~8s)")
                        return create_response(504, {'error': 'Insufficient time remaining for AI matching'})
                    print(f"⏱️ [AI] Lambda has {remaining_ms}ms remaining")
                
                print(f"🤖 [AI] Cache miss - attempting AI matching for field: {field_label}")
                print(f"🤖 [AI] Available keys: {available_keys[:10]}... ({len(available_keys)} total)")
                if section_header:
                    print(f"🤖 [AI] Section context: {section_header}")
                if nearby_fields:
                    print(f"🤖 [AI] Nearby fields: {len(nearby_fields)} fields")
                
                matching_start = time.time()
                ai_match = match_field_with_ai_backend(
                    field_label, field_name, available_keys, openai_key,
                    section_header, nearby_fields, form_purpose, context
                )
                matching_latency = (time.time() - matching_start) * 1000
                print(f"⏱️ [AI] AI matching completed in {matching_latency:.2f}ms")
                
                if ai_match and ai_match.get('matchedKey'):
                    matched_key = ai_match['matchedKey']
                    confidence = ai_match.get('confidence', 0)
                    
                    print(f"✅ [AI] AI match found: {field_signature} → {matched_key} (confidence: {confidence})")
                    
                    # Store ALL AI matches in cache (even if confidence < 80)
                    # Lower confidence matches are still useful for future reference
                    print(f"💾 [AI] Storing AI match in cache: {field_signature} → {matched_key} (confidence: {confidence})")
                    
                    mapping_data = {
                        'matchedKey': matched_key,
                        'confidence': confidence,
                        'usageCount': 0,
                        'createdAt': int(time.time()),
                        'updatedAt': int(time.time()),
                        'fieldLabel': field_label,
                        'fieldName': field_name,
                        'source': 'ai'
                    }
                    
                    # Store in Redis
                    try:
                        redis_cli.set(key, json.dumps(mapping_data), ex=REDIS_TTL)
                        print(f"✅ [AI] Successfully stored AI match in Redis cache: {field_signature} → {matched_key}")
                    except Exception as store_error:
                        print(f"❌ [AI] Failed to store in Redis: {str(store_error)}")
                        import traceback
                        traceback.print_exc()
                    
                    return create_response(200, {
                        'matchedKey': matched_key,
                        'confidence': confidence,
                        'usageCount': 0,
                        'source': 'ai',
                        'cached': True
                    })
                else:
                    if ai_match is None:
                        print(f"❌ [AI] AI matching returned None for {field_signature}")
                    elif not ai_match.get('matchedKey'):
                        print(f"❌ [AI] AI matching found no matchedKey for {field_signature}")
                    else:
                        print(f"❌ [AI] AI matching failed for {field_signature}: {ai_match}")
            else:
                missing = []
                if not field_label:
                    missing.append('fieldLabel')
                if not available_keys:
                    missing.append('availableKeys')
                if not openai_key:
                    missing.append('openAIKey')
                print(f"⏭️ [AI] Skipping AI matching - missing: {', '.join(missing)}")
            
            return create_response(404, {'error': 'Mapping not found'})
        
        print(f"✅ [REDIS] Cache HIT for {key} (latency: {redis_latency:.2f}ms)")
        
        # Parse JSON value
        mapping_data = json.loads(cached_value)
        
        # Increment usage count
        usage_key = f'field_mapping_usage:{field_signature}'
        usage_count = redis_cli.incr(usage_key)
        
        # Update usage count in the mapping data
        mapping_data['usageCount'] = usage_count
        mapping_data['updatedAt'] = int(time.time())
        
        # Update Redis with new usage count
        redis_cli.set(key, json.dumps(mapping_data), ex=REDIS_TTL)
        
        print(f"✅ [API] POST /api/field-mapping (get) - Success: matchedKey={mapping_data['matchedKey']}, confidence={mapping_data['confidence']}, usageCount={usage_count}")
        
        return create_response(200, {
            'matchedKey': mapping_data['matchedKey'],
            'confidence': mapping_data['confidence'],
            'usageCount': usage_count
        })
    
    except json.JSONDecodeError:
        return create_response(500, {'error': 'Invalid JSON body or cached data format'})
    except Exception as e:
        print(f"Get field mapping error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def match_field_with_ai_backend(
    field_label: str,
    field_name: str,
    available_keys: list,
    openai_key: str,
    section_header: str = '',
    nearby_fields: list = None,
    form_purpose: str = '',
    context: Any = None
) -> Optional[Dict[str, Any]]:
    """
    Match a field using OpenAI API (backend version)
    """
    try:
        # Build prompt similar to frontend
        field_info_parts = []
        if field_label:
            field_info_parts.append(f'Label: "{field_label}"')
        if field_name:
            field_info_parts.append(f'Name: "{field_name}"')
        
        field_info = '\n'.join(field_info_parts) if field_info_parts else 'Unknown field'
        
        context_parts = []
        if section_header:
            context_parts.append(f'Section: "{section_header}"')
        if nearby_fields:
            nearby_labels = [f.get('label', '') for f in nearby_fields if isinstance(f, dict)]
            nearby_labels = [l for l in nearby_labels if l]
            if nearby_labels:
                context_parts.append(f'Nearby fields: {", ".join(nearby_labels)}')
        if form_purpose:
            context_parts.append(f'Form purpose: {form_purpose}')
        
        context_section = '\n\nCONTEXT (use this to disambiguate the field):\n' + '\n'.join(context_parts) if context_parts else ''
        
        prompt = f"""Form field to match:
{field_info}{context_section}

Available data keys (you MUST return one of these EXACTLY as written):
{chr(10).join(f'{i+1}. "{k}"' for i, k in enumerate(available_keys))}

Which data key semantically matches this field? Use CONTEXT to disambiguate ambiguous fields.

CONTEXT RULES:
- If section is "Pet Information" and nearby fields include "Breed" or "Age", "Name" likely means petName
- If section is "Personal Information" and nearby fields include "Email" or "Phone", "Name" likely means fullName or firstName
- If form purpose is "Pet Registration", fields in pet-related sections should match pet-related profile keys
- Use nearby fields to understand field grouping and purpose

Return the EXACT key name from the list above.
- Match semantically: "personal projects" can match "projects"
- Match semantically: "email address" can match "email"  
- Match semantically: "phone number" can match "phone"
- Match semantically: "credit card" can match "card" or "creditCard" if available

IMPORTANT: Return the key EXACTLY as it appears in the list above. Do not modify it.
If no good match exists, return null for matchedKey.

Respond ONLY with valid JSON: {{"matchedKey": "exact_key_from_list" or null, "confidence": 0-100}}"""

        # Call OpenAI API
        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {openai_key}'
        }
        
        payload = {
            'model': 'gpt-4o-mini',
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are a form field matching expert. Match form fields to data keys based on semantic meaning and CONTEXT.\n\nCRITICAL: You MUST return the EXACT key name from the available keys list. Do not modify, normalize, or change the key name.\n\nCONTEXT IS KEY: Use section headers, nearby fields, and form purpose to disambiguate ambiguous fields.\n\nExamples:\n- Field "Name" in "Pet Information" section with nearby ["Breed", "Age"] → petName (NOT fullName)\n- Field "Name" in "Personal Information" section with nearby ["Email"] → fullName or firstName\n- Field: "personal projects", Available: ["projects", "personalProjects"] → Return: "projects" (exact match)\n- Field: "email address", Available: ["email", "emailAddress"] → Return: "email" (exact match)\n\nIf no good match exists, return null for matchedKey.\n\nRespond ONLY with valid JSON: {"matchedKey": "exact_key_from_list" or null, "confidence": 0-100}'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'temperature': 0.1,
            'max_tokens': 150,
            'response_format': {'type': 'json_object'}
        }
        
        req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
        
        # Log request details BEFORE making the call
        print(f"🤖 [AI] Calling OpenAI API (timeout: 8s)...")
        print(f"📤 [AI] Request URL: {url}")
        print(f"📤 [AI] Request payload size: {len(json.dumps(payload))} bytes")
        print(f"📤 [AI] Prompt length: {len(prompt)} chars")
        print(f"📤 [AI] Available keys count: {len(available_keys)}")
        
        ai_start_time = time.time()
        try:
            print(f"⏰ [AI] Starting OpenAI API call at {ai_start_time}")
            with urllib.request.urlopen(req, timeout=8) as response:
                read_start = time.time()
                raw_response = response.read().decode('utf-8')
                read_latency = (time.time() - read_start) * 1000
                print(f"📥 [AI] Response read completed in {read_latency:.2f}ms")
                
                response_data = json.loads(raw_response)
                
                ai_latency = (time.time() - ai_start_time) * 1000
                
                # Log full OpenAI API response for debugging
                print(f"📥 [AI] OpenAI API response received (total latency: {ai_latency:.2f}ms)")
                print(f"📥 [AI] Full OpenAI response_data: {json.dumps(response_data, indent=2)}")
                
                content = response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not content:
                    print(f"⚠️ [AI] OpenAI API returned empty content")
                    return None
                
                print(f"📥 [AI] OpenAI content (length: {len(content)} chars):")
                print(f"📥 [AI] {content}")
                
                try:
                    result = json.loads(content)
                    matched_key = result.get('matchedKey')
                    confidence = result.get('confidence', 0)
                    
                    print(f"🔍 [AI] OpenAI response parsed successfully:")
                    print(f"🔍 [AI] Full parsed result: {json.dumps(result, indent=2)}")
                    print(f"🔍 [AI] matchedKey={matched_key}, confidence={confidence}")
                except json.JSONDecodeError as json_error:
                    print(f"❌ [AI] Failed to parse OpenAI response as JSON: {str(json_error)}")
                    print(f"❌ [AI] Raw content that failed to parse: {content}")
                    return None
                
                if matched_key:
                    if matched_key in available_keys:
                        confidence = max(0, min(95, confidence))
                        print(f"✅ [AI] Valid match found: {field_label} → {matched_key} (confidence: {confidence})")
                        return {
                            'matchedKey': matched_key,
                            'confidence': confidence
                        }
                    
                    normalized_matched = matched_key.lower().strip().replace(' ', '').replace('_', '').replace('-', '')
                    for key in available_keys:
                        normalized_key = key.lower().strip().replace(' ', '').replace('_', '').replace('-', '')
                        if normalized_key == normalized_matched:
                            confidence = max(0, min(95, confidence))
                            print(f"✅ [AI] Valid match found (normalized): {field_label} → {key} (AI returned: {matched_key}, confidence: {confidence})")
                            return {
                                'matchedKey': key,
                                'confidence': confidence
                            }
                    
                    print(f"⚠️ [AI] Matched key '{matched_key}' not in available keys list")
                    print(f"⚠️ [AI] Available keys (first 20): {available_keys[:20]}")
                    print(f"⚠️ [AI] Normalized AI key: '{normalized_matched}'")
                
                print(f"❌ [AI] No valid match found for {field_label}")
                return None
        except urllib.error.URLError as url_error:
            ai_latency = (time.time() - ai_start_time) * 1000
            error_str = str(url_error).lower()
            print(f"❌ [AI] OpenAI API error after {ai_latency:.2f}ms")
            print(f"❌ [AI] Error type: {type(url_error).__name__}")
            print(f"❌ [AI] Error message: {str(url_error)}")
            
            if 'timeout' in error_str or 'timed out' in error_str:
                print(f"⏱️ [AI] TIMEOUT detected - OpenAI API call exceeded timeout")
                print(f"⏱️ [AI] Expected timeout: 8s, Actual wait time: {ai_latency/1000:.2f}s")
                print(f"⚠️ [AI] urllib timeout parameter not being respected in Lambda/VPC environment")
                print(f"⚠️ [AI] This suggests network/VPC connectivity issues")
                print(f"⚠️ [AI] Lambda in VPC needs NAT Gateway or proper routing to access OpenAI API")
                # Check if Lambda is also timing out
                if context and hasattr(context, 'get_remaining_time_in_millis'):
                    remaining_ms = context.get_remaining_time_in_millis()
                    print(f"⏱️ [AI] Lambda remaining time at error: {remaining_ms}ms")
                    if remaining_ms < 1000:
                        print(f"⚠️ [AI] Lambda is also timing out! (remaining: {remaining_ms}ms)")
                return None
            else:
                print(f"❌ [AI] Connection error (not timeout): {str(url_error)}")
                return None
        except Exception as api_error:
            ai_latency = (time.time() - ai_start_time) * 1000
            print(f"❌ [AI] OpenAI API error after {ai_latency:.2f}ms: {str(api_error)}")
            import traceback
            traceback.print_exc()
            return None
            
    except Exception as e:
        print(f"❌ [AI] AI matching failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return None


def handle_post_field_mapping(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Store field mapping in Redis cache
    POST /api/field-mapping
    Body: {
        "action": "store",
        "fieldSignature": "abc123",
        "matchedKey": "projects",
        "confidence": 92,
        "fieldLabel": "personal projects",
        "fieldName": "projects"
    }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        field_signature = body.get('fieldSignature')
        matched_key = body.get('matchedKey')
        confidence = body.get('confidence', 0)
        field_label = body.get('fieldLabel', '')
        field_name = body.get('fieldName', '')
        
        print(f"💾 [API] POST /api/field-mapping (action: store) - fieldSignature: {field_signature}, matchedKey: {matched_key}, confidence: {confidence}")
        
        redis_cli = get_redis_client()
        if not redis_cli:
            error_msg = 'Redis connection failed - check CloudWatch logs for details'
            print(f"❌ [API] POST /api/field-mapping (store) - Redis not available: {error_msg}")
            return create_response(503, {
                'error': 'Redis cache unavailable',
                'message': error_msg,
                'details': 'Check Lambda CloudWatch logs for Redis connection errors'
            })
        
        if not field_signature or not matched_key:
            print("❌ [API] POST /api/field-mapping - Missing required fields")
            return create_response(400, {'error': 'fieldSignature and matchedKey required'})
        
        # Only store high-confidence matches (>= 80)
        if confidence < 80:
            print(f"⏭️ [API] POST /api/field-mapping - Low confidence ({confidence}) match not stored")
            return create_response(200, {'message': 'Low confidence match not stored'})
        
        # Rate limiting: Check user write count (using IP or user agent as identifier)
        user_id = event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown')
        rate_limit_key = f'field_mapping_rate_limit:{user_id}'
        daily_writes = redis_cli.incr(rate_limit_key)
        
        # Set expiration for rate limit counter (24 hours)
        if daily_writes == 1:
            redis_cli.expire(rate_limit_key, 24 * 60 * 60)
        
        # Rate limit: max 100 writes per user per day
        if daily_writes > 100:
            return create_response(429, {'error': 'Rate limit exceeded'})
        
        # Check if mapping already exists
        key = f'field_mapping:{field_signature}'
        print(f"📥 [REDIS] GET {key} (checking if exists)")
        start_time = time.time()
        existing = redis_cli.get(key)
        redis_latency = (time.time() - start_time) * 1000
        
        if existing:
            print(f"🔄 [REDIS] Updating existing mapping for {key} (latency: {redis_latency:.2f}ms)")
            # Update existing mapping
            existing_data = json.loads(existing)
            existing_data['matchedKey'] = matched_key
            existing_data['confidence'] = confidence
            existing_data['updatedAt'] = int(time.time())
            existing_data['fieldLabel'] = field_label
            existing_data['fieldName'] = field_name
            
            # Preserve usage count
            usage_key = f'field_mapping_usage:{field_signature}'
            usage_count = redis_cli.get(usage_key)
            if usage_count:
                existing_data['usageCount'] = int(usage_count)
            
            set_start = time.time()
            redis_cli.set(key, json.dumps(existing_data), ex=REDIS_TTL)
            set_latency = (time.time() - set_start) * 1000
            print(f"✅ [REDIS] SET {key} - Updated (latency: {set_latency:.2f}ms)")
        else:
            print(f"✨ [REDIS] Creating new mapping for {key} (latency: {redis_latency:.2f}ms)")
            # Create new mapping
            mapping_data = {
                'matchedKey': matched_key,
                'confidence': confidence,
                'usageCount': 0,
                'createdAt': int(time.time()),
                'updatedAt': int(time.time()),
                'fieldLabel': field_label,
                'fieldName': field_name
            }
            
            set_start = time.time()
            redis_cli.set(key, json.dumps(mapping_data), ex=REDIS_TTL)
            set_latency = (time.time() - set_start) * 1000
            print(f"✅ [REDIS] SET {key} - Created (latency: {set_latency:.2f}ms)")
        
        print(f"✅ [API] POST /api/field-mapping - Success: stored mapping for {field_signature}")
        
        return create_response(200, {
            'success': True,
            'message': 'Mapping stored',
            'fieldSignature': field_signature
        })
    
    except json.JSONDecodeError:
        return create_response(400, {'error': 'Invalid JSON'})
    except Exception as e:
        print(f"Post field mapping error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def handle_batch_field_mapping(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Batch match multiple form fields using AI
    POST /api/batch-field-mapping
    Body: {
        "fields": [
            {
                "index": 0,
                "label": "Email",
                "name": "email",
                "placeholder": "Enter email",
                "ariaLabel": "",
                "type": "email",
                "sectionHeader": "Contact Information",
                "nearbyFields": [{"label": "Name", "name": "name"}],
                "formPurpose": "Contact Form"
            },
            ...
        ],
        "availableKeys": ["email", "firstName", "lastName", ...],
        "openAIKey": "sk-..."
    }
    """
    try:
        body_str = event.get('body', '{}')
        if not body_str:
            body_str = '{}'
        
        body = json.loads(body_str)
        fields = body.get('fields', [])
        available_keys = body.get('availableKeys', [])
        openai_key = body.get('openAIKey', '')
        
        if not fields or not available_keys or not openai_key:
            return create_response(400, {
                'error': 'Missing required fields',
                'details': 'fields, availableKeys, and openAIKey are required'
            })
        
        print(f"🤖 [BATCH] Processing {len(fields)} fields with {len(available_keys)} available keys")
        print(f"📋 [BATCH] Fields received:")
        for i, field in enumerate(fields):
            label = field.get('label', '')
            name = field.get('name', '')
            field_type = field.get('type', '')
            section = field.get('sectionHeader', '')
            print(f"  Field {i}: label=\"{label}\", name=\"{name}\", type=\"{field_type}\", section=\"{section}\"")
        print(f"📋 [BATCH] Available keys ({len(available_keys)}): {', '.join(available_keys[:10])}{'...' if len(available_keys) > 10 else ''}")
        
        if context and hasattr(context, 'get_remaining_time_in_millis'):
            remaining_ms = context.get_remaining_time_in_millis()
            print(f"⏱️ [BATCH] Lambda remaining time at start: {remaining_ms}ms")
            if remaining_ms < 10000:  # Need at least 10 seconds (8s for OpenAI + 2s buffer)
                print(f"⏱️ [BATCH] Skipping batch matching - only {remaining_ms}ms remaining (need ~10s)")
                return create_response(504, {
                    'error': 'Insufficient time remaining for batch matching',
                    'remaining_ms': remaining_ms,
                    'required_ms': 10000
                })
        
        batch_start = time.time()
        batch_result = match_fields_batch_backend(fields, available_keys, openai_key, context)
        batch_latency = (time.time() - batch_start) * 1000
        
        print(f"✅ [BATCH] Batch matching completed in {batch_latency:.2f}ms - {len(batch_result.get('mappings', []))} matches")
        
        return create_response(200, batch_result)
        
    except json.JSONDecodeError as e:
        return create_response(400, {'error': 'Invalid JSON body', 'details': str(e)})
    except Exception as e:
        print(f"❌ [BATCH] Batch matching error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Internal server error: {str(e)}'})


def match_fields_batch_backend(
    fields: list,
    available_keys: list,
    openai_key: str,
    context: Any = None
) -> Dict[str, Any]:
    """
    Match multiple fields using OpenAI API in a single batch call
    """
    try:
        print(f"🔍 [BATCH] Building prompt for {len(fields)} fields...")
        fields_info = []
        for field in fields:
            field_index = field.get('index', -1)
            field_label = field.get('label', '')
            field_name = field.get('name', '')
            field_type = field.get('type', '')
            print(f"  Processing field {field_index}: label=\"{field_label}\", name=\"{field_name}\", type=\"{field_type}\"")
            
            field_info_parts = []
            if field.get('label'):
                field_info_parts.append(f'Label: "{field["label"]}"')
            if field.get('name'):
                field_info_parts.append(f'Name: "{field["name"]}"')
            if field.get('placeholder'):
                field_info_parts.append(f'Placeholder: "{field["placeholder"]}"')
            
            field_info = '\n'.join(field_info_parts) if field_info_parts else 'Unknown field'
            
            context_parts = []
            if field.get('sectionHeader'):
                context_parts.append(f'Section: "{field["sectionHeader"]}"')
            if field.get('nearbyFields'):
                nearby_labels = [f.get('label', '') for f in field['nearbyFields'] if isinstance(f, dict)]
                nearby_labels = [l for l in nearby_labels if l]
                if nearby_labels:
                    context_parts.append(f'Nearby fields: {", ".join(nearby_labels)}')
            if field.get('formPurpose'):
                context_parts.append(f'Form purpose: {field["formPurpose"]}')
            
            context_section = '\n\nCONTEXT:\n' + '\n'.join(context_parts) if context_parts else ''
            
            fields_info.append(f'Field {field["index"]}:\n{field_info}{context_section}')
        
        prompt = f"""Match these form fields to available data keys:

{chr(10).join(fields_info)}

Available data keys (you MUST return keys EXACTLY as written):
{chr(10).join(f'{i+1}. "{k}"' for i, k in enumerate(available_keys))}

For each field, determine the best matching data key based on semantic meaning and CONTEXT.
Use CONTEXT (section headers, nearby fields, form purpose) to disambiguate ambiguous fields.

CONTEXT RULES:
- If section is "Pet Information" and nearby fields include "Breed" or "Age", "Name" likely means petName
- If section is "Personal Information" and nearby fields include "Email" or "Phone", "Name" likely means fullName or firstName
- If form purpose is "Pet Registration", fields in pet-related sections should match pet-related profile keys
- Use nearby fields to understand field grouping and purpose

Return JSON:
{{
  "mappings": [
    {{
      "fieldIndex": 0,
      "matchedKey": "exact_key_from_list" or null,
      "confidence": 0-100,
      "possibleMatches": [
        {{"key": "exact_key", "confidence": 0-100, "reasoning": "brief explanation"}}
      ]
    }}
  ]
}}

IMPORTANT:
- Return keys EXACTLY as they appear in the available keys list
- Include ALL reasonable matches in possibleMatches (confidence > 50)
- Order possibleMatches by confidence (highest first)
- If no good match exists, return null for matchedKey and empty array for possibleMatches"""

        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {openai_key}'
        }
        
        payload = {
            'model': 'gpt-4o-mini',
            'messages': [
                {
                    'role': 'system',
                    'content': 'You are a form field matching expert. Match form fields to data keys based on semantic meaning and CONTEXT.\n\nCRITICAL: You MUST return the EXACT key name(s) from the available keys list. Do not modify, normalize, or change the key names.\n\nCONTEXT IS KEY: Use section headers, nearby fields, and form purpose to disambiguate ambiguous fields.\n\nRespond ONLY with valid JSON object.'
                },
                {
                    'role': 'user',
                    'content': prompt
                }
            ],
            'temperature': 0.1,
            'max_tokens': 2000,
            'response_format': {'type': 'json_object'}
        }
        
        # Log prompt size for debugging
        prompt_size = len(prompt)
        payload_size = len(json.dumps(payload))
        print(f"🤖 [BATCH] Calling OpenAI API (timeout: 8s)...")
        print(f"📊 [BATCH] Prompt size: {prompt_size} chars, Payload size: {payload_size} bytes, Fields: {len(fields)}, Keys: {len(available_keys)}")
        print(f"📤 [BATCH] Request URL: {url}")
        
        # Check Lambda remaining time before making API call
        if context and hasattr(context, 'get_remaining_time_in_millis'):
            remaining_ms = context.get_remaining_time_in_millis()
            print(f"⏱️ [BATCH] Lambda remaining time: {remaining_ms}ms before OpenAI call")
            if remaining_ms < 10000:  # Less than 10 seconds remaining
                print(f"⚠️ [BATCH] Low remaining time ({remaining_ms}ms), OpenAI call may timeout")
        
        ai_start_time = time.time()
        print(f"⏰ [BATCH] Starting OpenAI API call at {ai_start_time}")
        try:
            # Create request with explicit timeout
            request_obj = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST')
            print(f"📤 [BATCH] Request created, opening connection with timeout=8s...")
            
            with urllib.request.urlopen(request_obj, timeout=8) as response:
                read_start = time.time()
                print(f"📥 [BATCH] Connection opened, reading response...")
                raw_response = response.read().decode('utf-8')
                read_latency = (time.time() - read_start) * 1000
                print(f"📥 [BATCH] Response read completed in {read_latency:.2f}ms")
                
                response_data = json.loads(raw_response)
                
                ai_latency = (time.time() - ai_start_time) * 1000
                
                # Log full OpenAI API response for debugging
                print(f"📥 [BATCH] OpenAI API response received (total latency: {ai_latency:.2f}ms)")
                print(f"📥 [BATCH] Full OpenAI response_data: {json.dumps(response_data, indent=2)}")
                
                content = response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                
                if not content:
                    print(f"⚠️ [BATCH] OpenAI API returned empty content")
                    return {'mappings': []}
                
                print(f"📥 [BATCH] OpenAI content (length: {len(content)} chars):")
                print(f"📥 [BATCH] {content}")
                
                try:
                    result = json.loads(content)
                    mappings = result.get('mappings', [])
                    
                    print(f"✅ [BATCH] OpenAI API response parsed successfully - {len(mappings)} mappings")
                    print(f"📋 [BATCH] Full parsed result: {json.dumps(result, indent=2)}")
                    
                    # Log each mapping for debugging
                    for i, mapping in enumerate(mappings):
                        print(f"📋 [BATCH] Mapping {i}: fieldIndex={mapping.get('fieldIndex')}, matchedKey={mapping.get('matchedKey')}, confidence={mapping.get('confidence')}, possibleMatches={len(mapping.get('possibleMatches', []))}")
                except json.JSONDecodeError as json_error:
                    print(f"❌ [BATCH] Failed to parse OpenAI response as JSON: {str(json_error)}")
                    print(f"❌ [BATCH] Raw content that failed to parse: {content}")
                    return {'mappings': []}
                
                validated_mappings = []
                for mapping in mappings:
                    field_index = mapping.get('fieldIndex')
                    matched_key = mapping.get('matchedKey')
                    confidence = mapping.get('confidence', 0)
                    possible_matches = mapping.get('possibleMatches', [])
                    
                    if field_index is None or field_index < 0 or field_index >= len(fields):
                        continue
                    
                    validated_possible = []
                    for pm in possible_matches:
                        pm_key = pm.get('key')
                        if pm_key and pm_key in available_keys:
                            validated_possible.append({
                                'key': pm_key,
                                'confidence': min(max(pm.get('confidence', 70), 0), 95),
                                'reasoning': pm.get('reasoning', '')
                            })
                    
                    if matched_key and matched_key in available_keys:
                        validated_mappings.append({
                            'fieldIndex': field_index,
                            'matchedKey': matched_key,
                            'confidence': min(max(confidence, 0), 100),
                            'possibleMatches': validated_possible
                        })
                    elif confidence > 0:
                        validated_mappings.append({
                            'fieldIndex': field_index,
                            'matchedKey': None,
                            'confidence': min(max(confidence, 0), 100),
                            'possibleMatches': validated_possible
                        })
                    else:
                        validated_mappings.append({
                            'fieldIndex': field_index,
                            'matchedKey': None,
                            'confidence': 0,
                            'possibleMatches': []
                        })
                
                # Ensure all fields are included in response (even if no match)
                field_indices_in_response = {m['fieldIndex'] for m in validated_mappings}
                for i in range(len(fields)):
                    if i not in field_indices_in_response:
                        validated_mappings.append({
                            'fieldIndex': i,
                            'matchedKey': None,
                            'confidence': 0,
                            'possibleMatches': []
                        })
                
                # Sort by fieldIndex to maintain order
                validated_mappings.sort(key=lambda x: x['fieldIndex'])
                
                redis_cli = get_redis_client()
                if redis_cli:
                    for mapping in validated_mappings:
                        field = fields[mapping['fieldIndex']]
                        field_signature = generate_field_signature_from_dict(field)
                        if mapping.get('matchedKey'):
                            key = f'field_mapping:{field_signature}'
                            mapping_data = {
                                'matchedKey': mapping['matchedKey'],
                                'confidence': mapping['confidence'],
                                'usageCount': 0,
                                'createdAt': int(time.time()),
                                'updatedAt': int(time.time()),
                                'fieldLabel': field.get('label', ''),
                                'fieldName': field.get('name', ''),
                                'source': 'ai'
                            }
                            try:
                                redis_cli.set(key, json.dumps(mapping_data), ex=REDIS_TTL)
                            except Exception as e:
                                print(f"⚠️ [BATCH] Failed to cache field {field_index}: {str(e)}")
                
                return {'mappings': validated_mappings}
                
        except urllib.error.URLError as url_error:
            ai_latency = (time.time() - ai_start_time) * 1000
            error_str = str(url_error).lower()
            print(f"❌ [BATCH] OpenAI API error after {ai_latency:.2f}ms")
            print(f"❌ [BATCH] Error type: {type(url_error).__name__}")
            print(f"❌ [BATCH] Error message: {str(url_error)}")
            
            if 'timeout' in error_str or 'timed out' in error_str:
                print(f"⏱️ [BATCH] TIMEOUT detected - OpenAI API call exceeded timeout")
                print(f"⏱️ [BATCH] Expected timeout: 8s, Actual wait time: {ai_latency/1000:.2f}s")
                if context and hasattr(context, 'get_remaining_time_in_millis'):
                    remaining_ms = context.get_remaining_time_in_millis()
                    print(f"⏱️ [BATCH] Lambda remaining time at error: {remaining_ms}ms")
                    if remaining_ms < 1000:
                        print(f"⚠️ [BATCH] Lambda is also timing out! (remaining: {remaining_ms}ms)")
                print(f"📊 [BATCH] Timeout details - Fields: {len(fields)}, Keys: {len(available_keys)}, Prompt size: {len(prompt)} chars")
                return {'mappings': []}
            else:
                print(f"❌ [BATCH] Connection error (not timeout): {str(url_error)}")
                return {'mappings': []}
        except Exception as api_error:
            ai_latency = (time.time() - ai_start_time) * 1000
            print(f"❌ [BATCH] OpenAI API error after {ai_latency:.2f}ms: {str(api_error)}")
            import traceback
            traceback.print_exc()
            return {'mappings': []}
            
    except Exception as e:
        print(f"❌ [BATCH] Batch matching failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {'mappings': []}


def generate_field_signature_from_dict(field: Dict[str, Any]) -> str:
    """Generate field signature from field dictionary"""
    normalized = f"{field.get('label', '')}|{field.get('name', '')}|{field.get('placeholder', '')}|{field.get('ariaLabel', '')}"
    normalized = normalized.lower().strip()
    
    hash_val = 0
    for char in normalized:
        hash_val = ((hash_val << 5) - hash_val) + ord(char)
        hash_val = hash_val & hash_val
    
    return str(abs(hash_val))[:8]


def handle_document_upload(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Upload document to S3
    POST /api/documents/upload
    Body: multipart/form-data with file, documentType, userId
    """
    try:
        body = event.get('body', '')
        is_base64 = event.get('isBase64Encoded', False)
        
        if is_base64:
            body_bytes = base64.b64decode(body)
        else:
            body_bytes = body.encode('utf-8') if isinstance(body, str) else body
        
        headers = event.get('headers', {}) or {}
        content_type = headers.get('content-type', headers.get('Content-Type', ''))
        
        user_id = None
        file_data = None
        file_name = None
        document_type = 'other'
        
        if 'multipart/form-data' in content_type:
            boundary = content_type.split('boundary=')[-1]
            parts = body_bytes.split(f'--{boundary}'.encode())
            
            for part in parts:
                if b'name="file"' in part:
                    header_end = part.find(b'\r\n\r\n')
                    if header_end > 0:
                        file_data = part[header_end + 4:]
                        filename_match = part.find(b'filename="')
                        if filename_match > 0:
                            filename_start = filename_match + 10
                            filename_end = part.find(b'"', filename_start)
                            file_name = part[filename_start:filename_end].decode('utf-8')
                elif b'name="userId"' in part:
                    header_end = part.find(b'\r\n\r\n')
                    if header_end > 0:
                        user_id = part[header_end + 4:].strip().decode('utf-8')
                elif b'name="documentType"' in part:
                    header_end = part.find(b'\r\n\r\n')
                    if header_end > 0:
                        document_type = part[header_end + 4:].strip().decode('utf-8')
        
        if not file_data:
            return create_response(400, {'error': 'No file data provided'})
        
        if not user_id:
            return create_response(400, {'error': 'userId is required'})
        
        if not file_name:
            file_name = f"document_{uuid.uuid4().hex[:8]}_{int(time.time())}"
        
        s3_key = f"documents/{user_id}/{uuid.uuid4().hex[:8]}_{int(time.time())}_{file_name}"
        
        try:
            s3_client.put_object(
                Bucket=s3_bucket_name,
                Key=s3_key,
                Body=file_data,
                ContentType='application/octet-stream'
            )
            
            s3_url = f"https://{s3_bucket_name}.s3.amazonaws.com/{s3_key}"
            
            return create_response(200, {
                's3Url': s3_url,
                's3Key': s3_key,
                'fileName': file_name
            })
        except Exception as s3_error:
            print(f"❌ S3 upload error: {str(s3_error)}")
            return create_response(500, {'error': f'S3 upload failed: {str(s3_error)}'})
            
    except Exception as e:
        print(f"❌ Document upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Upload failed: {str(e)}'})


def handle_save_document(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Save document metadata to DynamoDB
    POST /api/documents
    Body: SubmittedDocument JSON
    """
    try:
        body = json.loads(event.get('body', '{}'))
        
        document_id = body.get('id')
        user_id = body.get('userId')
        
        if not document_id or not user_id:
            return create_response(400, {'error': 'id and userId are required'})
        
        document_item = {
            'documentId': document_id,
            'userId': user_id,
            's3Url': body.get('s3Url', ''),
            's3Key': body.get('s3Key', ''),
            'fileName': body.get('fileName', ''),
            'fileType': body.get('fileType', ''),
            'fileSize': Decimal(str(body.get('fileSize', 0))),
            'documentType': body.get('documentType', 'other'),
            'formUrl': body.get('formUrl', ''),
            'formFieldName': body.get('formFieldName', ''),
            'formFieldLabel': body.get('formFieldLabel', ''),
            'submittedAt': Decimal(str(body.get('submittedAt', int(time.time())))),
            'profileId': body.get('profileId', ''),
            'timestamp': Decimal(str(int(time.time())))
        }
        
        documents_table.put_item(Item=document_item)
        
        return create_response(200, {'success': True, 'documentId': document_id})
        
    except Exception as e:
        print(f"❌ Save document error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Save failed: {str(e)}'})


def handle_get_documents(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get all documents for a user
    GET /api/documents?userId=xxx
    """
    try:
        query_params = event.get('queryStringParameters') or {}
        user_id = query_params.get('userId')
        
        if not user_id:
            return create_response(400, {'error': 'userId is required'})
        
        try:
            response = documents_table.query(
                KeyConditionExpression=Key('userId').eq(user_id),
                IndexName='submittedAt-index'
            )
        except:
            response = documents_table.query(
                KeyConditionExpression=Key('userId').eq(user_id)
            )
        
        documents = []
        for item in response.get('Items', []):
            documents.append({
                'id': item.get('documentId'),
                'userId': item.get('userId'),
                's3Url': item.get('s3Url'),
                's3Key': item.get('s3Key'),
                'fileName': item.get('fileName'),
                'fileType': item.get('fileType'),
                'fileSize': int(item.get('fileSize', 0)),
                'documentType': item.get('documentType'),
                'formUrl': item.get('formUrl'),
                'formFieldName': item.get('formFieldName'),
                'formFieldLabel': item.get('formFieldLabel'),
                'submittedAt': int(item.get('submittedAt', 0)),
                'profileId': item.get('profileId', '')
            })
        
        documents.sort(key=lambda x: x['submittedAt'], reverse=True)
        
        return create_response(200, {'documents': documents})
        
    except Exception as e:
        print(f"❌ Get documents error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Get failed: {str(e)}'})


def handle_get_presigned_url(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get presigned URL for document download
    GET /api/documents/presigned-url?s3Key=xxx
    """
    try:
        query_params = event.get('queryStringParameters') or {}
        s3_key = query_params.get('s3Key')
        
        if not s3_key:
            return create_response(400, {'error': 's3Key is required'})
        
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': s3_bucket_name, 'Key': s3_key},
            ExpiresIn=3600
        )
        
        return create_response(200, {'presignedUrl': presigned_url})
        
    except Exception as e:
        print(f"❌ Presigned URL error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Presigned URL failed: {str(e)}'})


def handle_get_document(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get specific document by ID
    GET /api/documents/{documentId}
    """
    try:
        document_id = event.get('path', '').split('/')[-1]
        query_params = event.get('queryStringParameters') or {}
        user_id = query_params.get('userId')
        
        if not document_id or not user_id:
            return create_response(400, {'error': 'documentId and userId are required'})
        
        response = documents_table.get_item(
            Key={'userId': user_id, 'documentId': document_id}
        )
        
        if 'Item' not in response:
            return create_response(404, {'error': 'Document not found'})
        
        item = response['Item']
        document = {
            'id': item.get('documentId'),
            'userId': item.get('userId'),
            's3Url': item.get('s3Url'),
            's3Key': item.get('s3Key'),
            'fileName': item.get('fileName'),
            'fileType': item.get('fileType'),
            'fileSize': int(item.get('fileSize', 0)),
            'documentType': item.get('documentType'),
            'formUrl': item.get('formUrl'),
            'formFieldName': item.get('formFieldName'),
            'formFieldLabel': item.get('formFieldLabel'),
            'submittedAt': int(item.get('submittedAt', 0)),
            'profileId': item.get('profileId', '')
        }
        
        return create_response(200, {'document': document})
        
    except Exception as e:
        print(f"❌ Get document error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Get failed: {str(e)}'})


def handle_delete_document(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Delete document from S3 and DynamoDB
    DELETE /api/documents/{documentId}?userId=xxx
    """
    try:
        document_id = event.get('path', '').split('/')[-1]
        query_params = event.get('queryStringParameters') or {}
        user_id = query_params.get('userId')
        
        if not document_id or not user_id:
            return create_response(400, {'error': 'documentId and userId are required'})
        
        response = documents_table.get_item(
            Key={'userId': user_id, 'documentId': document_id}
        )
        
        if 'Item' not in response:
            return create_response(404, {'error': 'Document not found'})
        
        item = response['Item']
        s3_key = item.get('s3Key')
        
        if s3_key:
            try:
                s3_client.delete_object(Bucket=s3_bucket_name, Key=s3_key)
            except Exception as s3_error:
                print(f"⚠️ S3 delete error (continuing): {str(s3_error)}")
        
        documents_table.delete_item(
            Key={'userId': user_id, 'documentId': document_id}
        )
        
        return create_response(200, {'success': True})
        
    except Exception as e:
        print(f"❌ Delete document error: {str(e)}")
        import traceback
        traceback.print_exc()
        return create_response(500, {'error': f'Delete failed: {str(e)}'})


def decimal_default(obj):
    """JSON encoder for Decimal types"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

