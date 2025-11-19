"""
Script to create DynamoDB tables for FormBot
Run this once to set up your database
"""

import boto3

dynamodb = boto3.client('dynamodb', region_name='us-east-1')

def create_users_table():
    """Create formbot-users table"""
    try:
        response = dynamodb.create_table(
            TableName='formbot-users',
            KeySchema=[
                {'AttributeName': 'userId', 'KeyType': 'HASH'}  # Partition key
            ],
            AttributeDefinitions=[
                {'AttributeName': 'userId', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST',  # On-demand pricing
            Tags=[
                {'Key': 'Application', 'Value': 'FormBot'},
                {'Key': 'Environment', 'Value': 'Production'}
            ]
        )
        print("✓ Created table: formbot-users")
        return response
    except dynamodb.exceptions.ResourceInUseException:
        print("Table formbot-users already exists")
    except Exception as e:
        print(f"Error creating formbot-users: {e}")

def create_profiles_table():
    """Create formbot-profiles table with profileId as primary key"""
    try:
        response = dynamodb.create_table(
            TableName='formbot-profiles',
            KeySchema=[
                {'AttributeName': 'profileId', 'KeyType': 'HASH'}  # Partition key (unique across all users)
            ],
            AttributeDefinitions=[
                {'AttributeName': 'profileId', 'AttributeType': 'S'},
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'updatedAt', 'AttributeType': 'N'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'userId-index',
                    'KeySchema': [
                        {'AttributeName': 'userId', 'KeyType': 'HASH'},
                        {'AttributeName': 'updatedAt', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'BillingMode': 'PAY_PER_REQUEST'
                }
            ],
            BillingMode='PAY_PER_REQUEST',
            Tags=[
                {'Key': 'Application', 'Value': 'FormBot'},
                {'Key': 'Environment', 'Value': 'Production'}
            ]
        )
        print("✓ Created table: formbot-profiles")
        return response
    except dynamodb.exceptions.ResourceInUseException:
        print("Table formbot-profiles already exists")
    except Exception as e:
        print(f"Error creating formbot-profiles: {e}")

if __name__ == '__main__':
    print("Creating DynamoDB tables for FormBot...")
    print()
    create_users_table()
    create_profiles_table()
    print()
    print("✅ Done! Tables created.")
    print()
    print("Tables:")
    print("  - formbot-users (userId)")
    print("  - formbot-profiles (userId, profileId)")

