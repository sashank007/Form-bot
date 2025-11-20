# Cloud Sync Guide

## Overview

FormBot now supports **bi-directional sync** with DynamoDB, allowing your profiles to be automatically backed up to the cloud and synced across devices.

## How It Works

### 1. **Save to Cloud (Push)**

When you save a profile locally, it automatically syncs to DynamoDB if:
- You're signed in with Google
- Auto-sync is enabled in settings (enabled by default)

**Flow:**
1. User saves a profile (e.g., "Resume Profile")
2. Profile is saved to Chrome local storage
3. If signed in + auto-sync enabled → Profile is pushed to DynamoDB
4. Success confirmation shown in console

**Example:**
```typescript
// In your extension
await saveFormData({
  id: 'my_profile',
  name: 'Work Profile',
  data: { name: 'John Doe', email: 'john@example.com' },
  createdAt: Date.now(),
  updatedAt: Date.now()
});
// ✅ Saved locally AND synced to cloud automatically
```

### 2. **Pull from Cloud (Sync)**

The extension can pull profiles from DynamoDB that were created by:
- Other devices
- CRM/Zapier integrations
- Team members (enterprise feature)

**Flow:**
1. User clicks "Sync from Cloud" in Enterprise Settings
2. Extension calls Lambda API: `/api/sync?userId=xxx&lastSync=xxx`
3. Lambda returns new/updated profiles from DynamoDB
4. Profiles are merged into local storage
5. Success message shows count of new profiles

## Lambda API Endpoints

### POST `/api/profiles`
Create or update a profile in DynamoDB.

**Request:**
```json
{
  "userId": "google_123456",
  "profileId": "work_profile",
  "label": "Work Profile",
  "fields": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "source": "user",
  "isDefault": false
}
```

**Response:**
```json
{
  "success": true,
  "profileId": "work_profile",
  "action": "created"  // or "updated"
}
```

### GET `/api/sync`
Get new/updated profiles since last sync.

**Request:**
```
GET /api/sync?userId=google_123456&lastSync=1699876543000
```

**Response:**
```json
{
  "items": [
    {
      "itemId": "work_profile",
      "name": "Work Profile",
      "data": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "timestamp": 1699876543000,
      "source": "user"
    }
  ],
  "count": 1,
  "timestamp": 1699876600000
}
```

### GET `/api/profiles`
Get all profiles for a user.

**Request:**
```
GET /api/profiles?userId=google_123456&since=1699876543000
```

**Response:**
```json
{
  "profiles": [
    {
      "userId": "google_123456",
      "profileId": "work_profile",
      "label": "Work Profile",
      "fields": { ... },
      "source": "user",
      "isDefault": false,
      "createdAt": 1699876543000,
      "updatedAt": 1699876600000
    }
  ],
  "count": 1,
  "timestamp": 1699876700000
}
```

## DynamoDB Schema

### formbot-profiles Table

**Primary Key:**
- Partition Key: `userId` (String) - Google user ID
- Sort Key: `profileId` (String) - Unique profile identifier

**Attributes:**
```
{
  "userId": "google_123456",           // PK: Google user ID
  "profileId": "work_profile",         // SK: Profile ID
  "label": "Work Profile",             // Display name
  "fields": "{...}",                   // JSON string of form data
  "source": "user",                    // Source: "user", "crm", "zapier"
  "isDefault": false,                  // Is default profile?
  "createdAt": 1699876543000,          // Timestamp in milliseconds
  "updatedAt": 1699876600000           // Timestamp in milliseconds
}
```

## Configuration

### Enable/Disable Auto-Sync

In the extension's **Enterprise Settings** tab:

```typescript
// Enable auto-sync
await saveSettings({ ...settings, autoSyncEnabled: true });

// Disable auto-sync
await saveSettings({ ...settings, autoSyncEnabled: false });
```

When disabled, profiles are only saved locally. You can still manually sync.

## Manual Sync

If you disable auto-sync, you can still manually trigger sync:

```typescript
import { syncFromDynamoDB } from './utils/dynamodbSync';

// Pull profiles from cloud
const newProfiles = await syncFromDynamoDB({});
console.log(`Downloaded ${newProfiles} new profiles`);
```

## Error Handling

The sync system is designed to **never fail the save operation**:

1. Profile is ALWAYS saved to local storage first
2. Cloud sync happens in a try-catch block
3. If sync fails, warning is logged but save succeeds
4. User's data is never lost even if cloud is unreachable

**Example log output:**
```
✅ Profile saved locally
🔄 Auto-syncing profile to DynamoDB...
⚠️ Cloud sync failed (profile saved locally): Network error
```

## Testing

### Test Cloud Connection

```typescript
import { testDynamoDBConnection } from './utils/dynamodbSync';

const result = await testDynamoDBConnection({});
if (result.success) {
  console.log('✓ Connected to Lambda API');
} else {
  console.error('✗ Connection failed:', result.message);
}
```

### Test Profile Push

```typescript
import { pushProfileToDynamoDB } from './utils/dynamodbSync';

const profile = {
  id: 'test_profile',
  name: 'Test Profile',
  data: { test: 'value' },
  createdAt: Date.now(),
  updatedAt: Date.now()
};

await pushProfileToDynamoDB(profile);
```

## Security

- All API calls require Google Sign-In (userId validation)
- CORS enabled for extension origin
- Data encrypted in transit (HTTPS)
- Each user can only access their own profiles (userId partition)

## Deployment

### Deploy Lambda Function

```bash
cd src/backend
./deploy.sh  # Linux/Mac
# or
deploy.bat   # Windows
```

### Create DynamoDB Tables

```bash
python create_tables.py
```

This creates:
- `formbot-users` - User accounts
- `formbot-profiles` - User profiles

## Use Cases

### 1. **Resume Profile**
User pastes resume → AI extracts data → Saved locally → **Auto-synced to cloud**

### 2. **Multi-Device**
- Save profile on laptop → **Syncs to cloud**
- Open extension on desktop → **Pulls from cloud**
- Both devices have same profiles

### 3. **CRM Integration**
- HR uploads employee data via Zapier → **Stored in DynamoDB**
- Employee opens extension → **Pulls employee profile**
- Employee fills job application using pre-filled data

### 4. **Team Collaboration** (Enterprise)
- Admin creates shared profile → **Stored in DynamoDB**
- All team members pull shared profile
- Everyone uses consistent data

## Troubleshooting

### Profiles Not Syncing

1. **Check sign-in status:**
   ```typescript
   const auth = await getAuth();
   console.log('Signed in:', auth ? 'Yes' : 'No');
   ```

2. **Check auto-sync setting:**
   ```typescript
   const settings = await getSettings();
   console.log('Auto-sync enabled:', settings.autoSyncEnabled);
   ```

3. **Test Lambda connection:**
   ```typescript
   const result = await testDynamoDBConnection({});
   console.log(result);
   ```

4. **Check browser console** for error messages

### Sync Timestamp Issues

If sync is not detecting new profiles:

```typescript
import { resetSyncTimestamp } from './utils/dynamodbSync';

resetSyncTimestamp();  // Forces full resync next time
```

## Future Enhancements

- [ ] Conflict resolution (last-write-wins)
- [ ] Profile sharing between users
- [ ] Offline queue for sync retries
- [ ] Real-time sync with WebSockets
- [ ] Profile versioning/history
- [ ] Selective sync (choose which profiles to sync)

