"""
Script to DELETE and RECREATE the formbot-profiles table
⚠️ WARNING: This will DELETE all existing profile data!

Run this to migrate from the old schema to the new one.
"""

import boto3
import time

dynamodb = boto3.client('dynamodb', region_name='us-east-1')

def delete_profiles_table():
    """Delete the old formbot-profiles table"""
    try:
        print("⚠️  Deleting old formbot-profiles table...")
        dynamodb.delete_table(TableName='formbot-profiles')
        
        # Wait for deletion to complete
        print("⏳ Waiting for deletion to complete...")
        waiter = dynamodb.get_waiter('table_not_exists')
        waiter.wait(TableName='formbot-profiles')
        
        print("✓ Table deleted")
        return True
    except dynamodb.exceptions.ResourceNotFoundException:
        print("ℹ️  Table doesn't exist, skipping deletion")
        return True
    except Exception as e:
        print(f"❌ Error deleting table: {e}")
        return False

def create_new_profiles_table():
    """Create the new formbot-profiles table with profileId as primary key"""
    try:
        print("\n📦 Creating new formbot-profiles table...")
        response = dynamodb.create_table(
            TableName='formbot-profiles',
            KeySchema=[
                {'AttributeName': 'profileId', 'KeyType': 'HASH'}  # Partition key
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
                    'Projection': {'ProjectionType': 'ALL'}
                }
            ],
            BillingMode='PAY_PER_REQUEST',
            Tags=[
                {'Key': 'Application', 'Value': 'FormBot'},
                {'Key': 'Environment', 'Value': 'Production'}
            ]
        )
        
        # Wait for table to be created
        print("⏳ Waiting for table creation...")
        waiter = dynamodb.get_waiter('table_exists')
        waiter.wait(TableName='formbot-profiles')
        
        print("✓ Table created successfully!")
        print("\n📊 New Schema:")
        print("   Primary Key: profileId (HASH)")
        print("   GSI: userId-index (userId + updatedAt)")
        print("\n✅ Migration complete!")
        return True
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("🔄 FormBot Profiles Table Migration")
    print("=" * 60)
    print()
    print("⚠️  WARNING: This will DELETE all existing profile data!")
    print("   Make sure you have a backup if needed.")
    print()
    
    confirm = input("Type 'YES' to continue: ")
    
    if confirm != 'YES':
        print("\n❌ Migration cancelled")
        exit(0)
    
    print("\n🚀 Starting migration...\n")
    
    # Step 1: Delete old table
    if not delete_profiles_table():
        print("\n❌ Migration failed at deletion step")
        exit(1)
    
    # Step 2: Wait a bit for AWS to process
    print("\n⏳ Waiting 5 seconds for AWS to process...")
    time.sleep(5)
    
    # Step 3: Create new table
    if not create_new_profiles_table():
        print("\n❌ Migration failed at creation step")
        exit(1)
    
    print("\n" + "=" * 60)
    print("🎉 Migration successful!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Deploy updated Lambda function")
    print("2. Test with: python -c \"import boto3; print(boto3.client('dynamodb').describe_table(TableName='formbot-profiles'))\"")
    print("3. Push all profiles from extension using 'Push All to Cloud' button")
    print()

