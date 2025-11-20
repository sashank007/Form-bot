"""
Add userId-index GSI to existing formbot-profiles table
This script adds the Global Secondary Index without deleting the table
"""

import boto3
import time

dynamodb = boto3.client('dynamodb', region_name='us-east-1')

def add_userid_index():
    """Add userId-index GSI to formbot-profiles table"""
    table_name = 'formbot-profiles'
    
    try:
        # Check if table exists
        try:
            table_desc = dynamodb.describe_table(TableName=table_name)
            print(f"✓ Found table: {table_name}")
            
            # Check if index already exists
            existing_indexes = [idx['IndexName'] for idx in table_desc['Table'].get('GlobalSecondaryIndexes', [])]
            if 'userId-index' in existing_indexes:
                print("✓ Index 'userId-index' already exists!")
                return True
                
        except dynamodb.exceptions.ResourceNotFoundException:
            print(f"❌ Table {table_name} does not exist!")
            print("   Run create_tables.py first to create the table.")
            return False
        
        print(f"\n📦 Adding GSI 'userId-index' to {table_name}...")
        print("   This may take a few minutes...")
        
        # Update table to add GSI
        response = dynamodb.update_table(
            TableName=table_name,
            AttributeDefinitions=[
                {'AttributeName': 'userId', 'AttributeType': 'S'},
                {'AttributeName': 'updatedAt', 'AttributeType': 'N'}
            ],
            GlobalSecondaryIndexUpdates=[
                {
                    'Create': {
                        'IndexName': 'userId-index',
                        'KeySchema': [
                            {'AttributeName': 'userId', 'KeyType': 'HASH'},
                            {'AttributeName': 'updatedAt', 'KeyType': 'RANGE'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'},
                        'BillingMode': 'PAY_PER_REQUEST'
                    }
                }
            ]
        )
        
        print("⏳ Waiting for index creation...")
        print("   (This can take 5-15 minutes depending on table size)")
        
        # Wait for index to be active
        waiter = dynamodb.get_waiter('table_exists')
        max_attempts = 60  # 30 minutes max
        attempt = 0
        
        while attempt < max_attempts:
            table_desc = dynamodb.describe_table(TableName=table_name)
            gsis = table_desc['Table'].get('GlobalSecondaryIndexes', [])
            
            for gsi in gsis:
                if gsi['IndexName'] == 'userId-index':
                    status = gsi['IndexStatus']
                    if status == 'ACTIVE':
                        print("✅ Index 'userId-index' is now ACTIVE!")
                        return True
                    elif status == 'CREATING':
                        print(f"   Status: {status}... ({attempt * 30}s elapsed)")
                        time.sleep(30)
                        attempt += 1
                        break
                    else:
                        print(f"❌ Index status: {status}")
                        return False
            
            time.sleep(30)
            attempt += 1
        
        print("⚠️ Index creation is taking longer than expected.")
        print("   Check AWS Console for status.")
        return False
        
    except dynamodb.exceptions.ResourceInUseException:
        print("⚠️ Table is being modified. Please wait and try again.")
        return False
    except Exception as e:
        print(f"❌ Error adding index: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("🔧 Add userId-index GSI to formbot-profiles")
    print("=" * 60)
    print()
    print("This script will:")
    print("  1. Add Global Secondary Index 'userId-index'")
    print("  2. Index on: userId (HASH) + updatedAt (RANGE)")
    print("  3. Keep all existing data intact")
    print()
    print("⚠️  Note: Index creation can take 5-15 minutes")
    print()
    
    confirm = input("Continue? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("Cancelled.")
        exit(0)
    
    print()
    success = add_userid_index()
    
    if success:
        print()
        print("=" * 60)
        print("✅ Success! Index added successfully.")
        print("=" * 60)
        print()
        print("You can now query profiles by userId:")
        print("  - Lambda function will work correctly")
        print("  - Queries will use the new index")
    else:
        print()
        print("=" * 60)
        print("❌ Failed to add index")
        print("=" * 60)
        print()
        print("Troubleshooting:")
        print("  1. Check AWS Console → DynamoDB → formbot-profiles")
        print("  2. Verify table exists and is not being modified")
        print("  3. Check CloudWatch logs for errors")

