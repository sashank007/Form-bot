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
from decimal import Decimal

# Initialize DynamoDB with two tables
dynamodb = boto3.resource('dynamodb')
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
        email = body.get('email')
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
        
        # Upsert user to formbot-users table
        users_table.put_item(
            Item={
                'userId': user_id,
                'email': email,
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
        if since > 0:
            response = profiles_table.query(
                IndexName='userId-index',
                KeyConditionExpression=Key('userId').eq(user_id) & Key('updatedAt').gt(since)
            )
        else:
            response = profiles_table.query(
                IndexName='userId-index',
                KeyConditionExpression=Key('userId').eq(user_id)
            )
        
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
        if last_sync > 0:
            response = profiles_table.query(
                IndexName='userId-index',
                KeyConditionExpression=Key('userId').eq(user_id) & Key('updatedAt').gt(last_sync)
            )
        else:
            # First sync - get all profiles
            response = profiles_table.query(
                IndexName='userId-index',
                KeyConditionExpression=Key('userId').eq(user_id)
            )
        
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
        body = json.loads(event.get('body', '{}'))
        
        # Option 1: Direct userId
        user_id = body.get('userId')
        
        # Option 2: Lookup by email
        if not user_id:
            email = body.get('email', '').lower().strip()
            if email:
                print(f"Looking up userId by email: {email}")
                # Query users table by email
                response = users_table.scan(
                    FilterExpression=Attr('email').eq(email)
                )
                items = response.get('Items', [])
                if items:
                    user_id = items[0]['userId']
                    print(f"✓ Found userId: {user_id}")
                else:
                    return create_response(404, {
                        'error': 'User not found',
                        'message': f'No user registered with email: {email}. Please have the employee sign in to FormBot first.'
                    })
        
        if not user_id:
            return create_response(400, {
                'error': 'userId or email is required',
                'message': 'Please include either userId or email in the webhook payload'
            })
        
        print(f"📥 Webhook received for user: {user_id}")
        print(f"📦 Data fields: {list(body.keys())}")
        
        timestamp = int(time.time() * 1000)
        
        # Generate profile ID from employee ID or timestamp
        employee_id = body.get('employeeId') or body.get('id') or f"webhook_{timestamp}"
        profile_id = f"crm_{employee_id}"
        
        # Extract name for profile label
        name = body.get('name')
        if not name:
            first_name = body.get('firstName', '')
            last_name = body.get('lastName', '')
            name = f"{first_name} {last_name}".strip() or 'CRM Data'
        
        # Remove metadata fields - everything else goes to the profile
        metadata_fields = ['userId', 'employeeId', 'id', 'email']
        profile_fields = {k: v for k, v in body.items() if k not in metadata_fields and v}
        
        print(f"✓ Profile name: {name}")
        print(f"✓ Profile ID: {profile_id}")
        print(f"✓ Field count: {len(profile_fields)}")
        
        # Store profile in DynamoDB
        profiles_table.put_item(
            Item={
                'profileId': profile_id,
                'userId': user_id,
                'label': f"CRM: {name}",
                'fields': json.dumps(profile_fields),
                'source': 'zapier',
                'isDefault': False,
                'createdAt': timestamp,
                'updatedAt': timestamp
            }
        )
        
        print(f"✅ Profile created in DynamoDB: {profile_id}")
        
        return create_response(200, {
            'success': True,
            'message': 'Profile created successfully',
            'profileId': profile_id,
            'userId': user_id,
            'label': f"CRM: {name}",
            'fieldCount': len(profile_fields)
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

