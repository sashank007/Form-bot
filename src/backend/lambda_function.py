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
from botocore.exceptions import ClientError
from decimal import Decimal

# Initialize DynamoDB with two tables
dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')
users_table_name = os.environ.get('USERS_TABLE', 'formbot-users')
profiles_table_name = os.environ.get('PROFILES_TABLE', 'formbot-profiles')

users_table = dynamodb.Table(users_table_name)
profiles_table = dynamodb.Table(profiles_table_name)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for FormBot that handles user data and CRM sync
    through API Gateway.
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Handle OPTIONS requests for CORS
        if event.get('httpMethod') == 'OPTIONS':
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
        
        print(f"Method: {http_method}, Path: {path}")
        
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
        except ClientError as e:
            if 'ValidationException' in str(e) and ('index' in str(e).lower() or 'does not exist' in str(e).lower()):
                # Index doesn't exist - fallback to scan (slower but works)
                print("⚠️ userId-index not found, using scan fallback")
                print("   Run add_userid_index.py to add the index for better performance")
                response = profiles_table.scan(
                    FilterExpression=Attr('userId').eq(user_id)
                )
                # Filter by updatedAt if needed
                if since > 0:
                    items = response.get('Items', [])
                    response['Items'] = [item for item in items if item.get('updatedAt', 0) > since]
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


def decimal_default(obj):
    """JSON encoder for Decimal types"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

