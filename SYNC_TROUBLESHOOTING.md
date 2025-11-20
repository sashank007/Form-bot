# DynamoDB Sync Troubleshooting Guide

## Why You Might Not See Lambda Calls

If you're saving profiles but not seeing Lambda API calls, here are the most common reasons:

### 1. **Not Signed In with Google** ⚠️

The #1 reason sync doesn't happen is because you're not signed in.

**How to check:**
1. Open the extension options page
2. Go to **Enterprise Settings** tab
3. Look for "Google Sign-In" section
4. If you see "Not signed in", click **"Sign in with Google"**

**Console verification:**
```javascript
// Open browser console (F12)
// You should see:
📊 Sync check - Auth: ✗ Not signed in
⏭️ Skipping cloud sync: Not signed in with Google
```

### 2. **Auto-Sync Disabled in Settings**

Auto-sync might be turned off.

**How to check:**
1. Open extension options page
2. Go to **Enterprise Settings** tab
3. Find "Auto-Sync to Cloud" toggle
4. Make sure it's **ON** (blue/purple)

**Console verification:**
```javascript
// Open browser console (F12)
// If disabled, you'll see:
📊 Sync check - Auth: ✓ Signed in as user@gmail.com
📊 Sync check - AutoSync: ✗ Disabled
⏭️ Skipping cloud sync: Auto-sync disabled in settings
```

### 3. **Lambda API URL Not Configured**

The Lambda API endpoint might not be set.

**How to check:**
```typescript
// Check src/config/constants.ts
export const LAMBDA_API_URL = 'https://your-api-url.amazonaws.com';
```

If this is not set or incorrect, the API calls will fail.

## Step-by-Step Verification

### Step 1: Check Console Logs

1. Open the extension options page
2. Press **F12** to open browser DevTools
3. Go to **Console** tab
4. Try to save a profile
5. Look for these messages:

**Expected when sync works:**
```
📊 Sync check - Auth: ✓ Signed in as user@gmail.com
📊 Sync check - AutoSync: ✓ Enabled
🔄 Auto-syncing profile to DynamoDB...
☁️ Pushing profile to DynamoDB: My Profile
📡 Calling Lambda API: https://your-api.amazonaws.com/api/profiles
✅ Profile pushed successfully
✅ Profile synced to cloud
```

**If not signed in:**
```
📊 Sync check - Auth: ✗ Not signed in
⏭️ Skipping cloud sync: Not signed in with Google
```

**If auto-sync disabled:**
```
📊 Sync check - Auth: ✓ Signed in as user@gmail.com
📊 Sync check - AutoSync: ✗ Disabled
⏭️ Skipping cloud sync: Auto-sync disabled in settings
```

### Step 2: Check Network Tab

1. Open DevTools (F12)
2. Go to **Network** tab
3. Filter by "Fetch/XHR"
4. Save a profile
5. Look for API calls to your Lambda endpoint

**Expected:**
- POST to `https://your-api.amazonaws.com/api/profiles`
- Status: 200 OK
- Response: `{"success": true, "profileId": "...", "action": "created"}`

### Step 3: Verify Google Sign-In

1. Open extension options
2. Go to **Enterprise Settings**
3. Click **"Sign in with Google"**
4. Complete the OAuth flow
5. You should see your email displayed
6. Try saving a profile again

### Step 4: Check Storage

Open DevTools console and run:

```javascript
// Check if signed in
chrome.storage.local.get('formbot_user_auth', (result) => {
  console.log('Auth stored:', result.formbot_user_auth ? 'Yes ✓' : 'No ✗');
});

// Check settings
chrome.storage.local.get('formbot_settings', (result) => {
  const settings = result.formbot_settings || {};
  console.log('Auto-sync enabled:', settings.autoSyncEnabled);
});
```

## Common Issues and Solutions

### Issue: "Not signed in" after signing in

**Solution:**
The auth might have failed to save. Try:
1. Sign out
2. Clear extension storage: `chrome.storage.local.clear()`
3. Reload extension
4. Sign in again

### Issue: API calls failing with 401/403

**Solution:**
The userId is not being sent correctly. Check:
1. Console logs for userId value
2. Lambda logs for incoming requests
3. DynamoDB table permissions

### Issue: API calls timing out

**Solution:**
Lambda might not be deployed or API Gateway not configured:
1. Check Lambda function exists in AWS console
2. Verify API Gateway endpoint URL
3. Test health endpoint: `GET /health`

### Issue: Profile saves locally but sync fails

**Solution:**
This is by design! Profiles always save locally first. Check the error message:
```
⚠️ Cloud sync failed (profile saved locally): [error details]
```

Common sync failures:
- Network error (no internet)
- Lambda returned 500 (check Lambda logs)
- Invalid API URL in config
- CORS error (check Lambda CORS settings)

## Manual Testing

You can manually test the sync function in the console:

```javascript
// Test auth
import { getAuth } from './utils/googleAuth';
const auth = await getAuth();
console.log('Auth:', auth);

// Test push
import { pushProfileToDynamoDB } from './utils/dynamodbSync';
const testProfile = {
  id: 'test_123',
  name: 'Test Profile',
  data: { name: 'John Doe' },
  createdAt: Date.now(),
  updatedAt: Date.now()
};
await pushProfileToDynamoDB(testProfile);
```

## Checking DynamoDB

To verify profiles are actually being saved:

1. Open AWS Console
2. Go to DynamoDB
3. Open `formbot-profiles` table
4. Look for items with your `userId`
5. Check `profileId`, `label`, and `fields` attributes

Expected structure:
```json
{
  "userId": "google_123456",
  "profileId": "test_123",
  "label": "Test Profile",
  "fields": "{\"name\":\"John Doe\"}",
  "source": "user",
  "isDefault": false,
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

## Enable Detailed Logging

For more verbose logging, add this to the beginning of `saveFormData`:

```typescript
export async function saveFormData(data: SavedFormData): Promise<void> {
  console.group('💾 Saving Profile');
  console.log('Profile:', data.name, '(', data.id, ')');
  console.log('Fields:', Object.keys(data.data).length);
  
  try {
    // ... existing code ...
  } finally {
    console.groupEnd();
  }
}
```

## Quick Checklist

Before saving a profile, verify:

- [ ] ✓ Signed in with Google (check Enterprise Settings)
- [ ] ✓ Auto-sync enabled (check Enterprise Settings)
- [ ] ✓ Lambda API URL configured in `constants.ts`
- [ ] ✓ Lambda function deployed to AWS
- [ ] ✓ DynamoDB tables created
- [ ] ✓ Browser console open to see logs
- [ ] ✓ Network tab open to see API calls

## Need Help?

If sync still isn't working:

1. Copy all console logs
2. Copy all network errors
3. Share your Lambda API URL (redacted)
4. Share your userId (redacted)
5. Check Lambda CloudWatch logs for errors

## Summary

**The most common issue is: NOT SIGNED IN WITH GOOGLE**

Always check:
1. Enterprise Settings → Google Sign-In section
2. Console logs: Look for "✗ Not signed in"
3. Sign in if needed
4. Try saving profile again

