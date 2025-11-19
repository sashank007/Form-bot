# DynamoDB Schema Migration Guide

## 🔄 Change Summary

**OLD Schema:**
- Primary Key: `userId` (Partition) + `profileId` (Sort)
- Query: Direct query on userId

**NEW Schema:**
- Primary Key: `profileId` (Partition) - **profileId is now globally unique**
- GSI: `userId-index` (userId + updatedAt) - **Query by userId using GSI**
- Benefit: Simpler structure, easier to understand

## 📊 New Table Structure

```
formbot-profiles
├── Primary Key: profileId (HASH)
├── Attributes:
│   ├── profileId (String) - Unique ID like "resume_1700000000001"
│   ├── userId (String) - Google user ID like "google_123456"
│   ├── label (String) - Display name like "Resume Profile"
│   ├── fields (String) - JSON string of form data
│   ├── source (String) - "user", "crm", "zapier"
│   ├── isDefault (Boolean)
│   ├── createdAt (Number) - Timestamp in ms
│   └── updatedAt (Number) - Timestamp in ms
└── GSI: userId-index
    ├── Partition Key: userId (HASH)
    └── Sort Key: updatedAt (RANGE)
```

## 🚀 Migration Steps

### Step 1: Backup Current Data (Optional)

If you have existing profiles in DynamoDB:

```bash
cd src/backend
python -c "
import boto3
import json
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('formbot-profiles')
response = table.scan()
with open('profiles_backup.json', 'w') as f:
    json.dump(response['Items'], f, indent=2, default=str)
print('Backup saved to profiles_backup.json')
"
```

### Step 2: Delete and Recreate Table

```bash
cd src/backend
python recreate_profiles_table.py
```

When prompted, type `YES` to confirm.

**Output:**
```
============================================================
🔄 FormBot Profiles Table Migration
============================================================

⚠️  WARNING: This will DELETE all existing profile data!
   Make sure you have a backup if needed.

Type 'YES' to continue: YES

🚀 Starting migration...

⚠️  Deleting old formbot-profiles table...
⏳ Waiting for deletion to complete...
✓ Table deleted

⏳ Waiting 5 seconds for AWS to process...

📦 Creating new formbot-profiles table...
⏳ Waiting for table creation...
✓ Table created successfully!

📊 New Schema:
   Primary Key: profileId (HASH)
   GSI: userId-index (userId + updatedAt)

✅ Migration complete!

============================================================
🎉 Migration successful!
============================================================
```

### Step 3: Deploy Updated Lambda Function

```bash
cd src/backend
./deploy.sh  # Linux/Mac
# or
deploy.bat   # Windows
```

This deploys the Lambda with the updated query logic that uses the GSI.

### Step 4: Rebuild Extension

```bash
npm run build
```

### Step 5: Reload Extension in Browser

1. Go to `chrome://extensions/`
2. Click "Reload" on FormBot extension
3. Open extension options

### Step 6: Push All Profiles to Cloud

1. Sign in with Google (if not already)
2. Go to **Enterprise Settings** tab
3. Click **"⬆️ Push All to Cloud"** button
4. Confirm the action

This will re-upload all your local profiles to the new table structure.

## 🔍 Verify Migration

### Check Table Structure

```bash
aws dynamodb describe-table --table-name formbot-profiles --region us-east-1 --query "Table.{KeySchema:KeySchema,GSI:GlobalSecondaryIndexes[0].KeySchema}"
```

Expected output:
```json
{
  "KeySchema": [
    {
      "AttributeName": "profileId",
      "KeyType": "HASH"
    }
  ],
  "GSI": [
    {
      "AttributeName": "userId",
      "KeyType": "HASH"
    },
    {
      "AttributeName": "updatedAt",
      "KeyType": "RANGE"
    }
  ]
}
```

### Check Profiles

```bash
aws dynamodb query \
  --table-name formbot-profiles \
  --index-name userId-index \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"google_YOUR_USER_ID"}}' \
  --region us-east-1
```

## 📖 How Queries Work Now

### Before (Composite Key):

```python
# Direct query on main table
response = profiles_table.query(
    KeyConditionExpression=Key('userId').eq('google_123')
)
```

### After (GSI):

```python
# Query using GSI
response = profiles_table.query(
    IndexName='userId-index',
    KeyConditionExpression=Key('userId').eq('google_123')
)
```

### Get Single Profile:

```python
# Before: Needed both keys
response = profiles_table.get_item(
    Key={
        'userId': 'google_123',
        'profileId': 'resume_111'
    }
)

# After: Only need profileId
response = profiles_table.get_item(
    Key={
        'profileId': 'resume_111'
    }
)
```

## 🎯 Benefits of New Schema

1. **Simpler Primary Key**: Just profileId, no composite key
2. **Globally Unique Profiles**: Each profileId is unique across all users
3. **Easier to Understand**: Single partition key is more intuitive
4. **Same Query Performance**: GSI provides efficient userId queries
5. **Simpler Get Operations**: Get profile by ID without needing userId

## ⚠️ Important Notes

1. **ProfileId Must Be Unique**: The extension already generates unique IDs like `resume_1700000000001_0.123`, so this is fine
2. **GSI Queries Are Eventually Consistent**: There's a slight delay (usually <1 second) after writes before GSI reflects changes
3. **No Data Loss**: Your local profiles are safe. Just push them after migration
4. **Backup Recommended**: If you have CRM data in DynamoDB, back it up first

## 🆘 Troubleshooting

### Error: "Table already exists"

The old table wasn't deleted. Manually delete it:

```bash
aws dynamodb delete-table --table-name formbot-profiles --region us-east-1
```

Wait 30 seconds, then run `recreate_profiles_table.py` again.

### Error: "ResourceNotFoundException" when querying

Make sure you're using the GSI name: `userId-index`

```python
response = profiles_table.query(
    IndexName='userId-index',  # Don't forget this!
    KeyConditionExpression=Key('userId').eq(user_id)
)
```

### Profiles Not Showing After Migration

1. Check you've deployed the Lambda
2. Check GSI is active: `aws dynamodb describe-table --table-name formbot-profiles`
3. Push all profiles again from extension

### Extension Shows "Sync Failed"

1. Open browser console (F12)
2. Check error message
3. Verify Lambda is deployed with new code
4. Test Lambda health: `curl https://YOUR_API_URL/health`

## 📞 Summary Commands

```bash
# 1. Backup (optional)
python backup_profiles.py

# 2. Recreate table
python recreate_profiles_table.py

# 3. Deploy Lambda
./deploy.sh

# 4. Rebuild extension
cd ../..
npm run build

# 5. Push profiles from extension
# Use "Push All to Cloud" button in Enterprise Settings
```

## ✅ Migration Complete!

After following these steps:
- ✅ Table uses simpler schema (profileId as primary key)
- ✅ Queries use GSI for userId lookups
- ✅ Lambda code updated to use GSI
- ✅ Extension can push/pull profiles
- ✅ All profiles synced to cloud

Your FormBot is now using the new simplified schema! 🎉

