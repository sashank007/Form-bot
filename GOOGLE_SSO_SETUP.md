# Google SSO Setup Guide for FormBot

## ✅ Already Implemented

Google Sign-In is **already built** into FormBot! You just need to configure OAuth credentials.

---

## 🔧 Setup Steps

### Step 1: Create Google Cloud Project

1. Go to: https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Project name: **FormBot**
4. Click "Create"

### Step 2: Enable Required APIs

1. In your project, go to: **APIs & Services** → **Library**
2. Search for: **Google+ API**
3. Click **Enable**

### Step 3: Create OAuth Consent Screen

1. Go to: **APIs & Services** → **OAuth consent screen**
2. User Type: **External**
3. Click **Create**
4. Fill in:
   - App name: **FormBot**
   - User support email: Your email
   - Developer contact: Your email
5. Scopes: Add `userinfo.email` and `userinfo.profile`
6. Save and Continue

### Step 4: Create OAuth 2.0 Credentials

1. Go to: **APIs & Services** → **Credentials**
2. Click: **+ Create Credentials** → **OAuth client ID**
3. Application type: **Chrome extension**
4. Name: **FormBot Extension**
5. Item ID: (Leave empty for now - we'll get this after first build)
6. Click **Create**
7. Copy the **Client ID**: `xxxxx.apps.googleusercontent.com`

### Step 5: Get Extension ID

1. In Chrome: `chrome://extensions/`
2. Enable **Developer mode**
3. Load unpacked → Select your `dist` folder
4. Copy the **Extension ID**: `abcdefghijklmnop...`

### Step 6: Update OAuth Credentials with Extension ID

1. Back to Google Cloud Console → Credentials
2. Edit your OAuth client ID
3. Add **Item ID**: Paste your extension ID
4. Save

### Step 7: Update manifest.json

Replace in `manifest.json`:

```json
"oauth2": {
  "client_id": "YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ]
},
"key": "YOUR_EXTENSION_KEY"
```

**Get the key:**
The extension ID is derived from the key. For development, you can remove the `"key"` line entirely - Chrome will generate one for you.

### Step 8: Rebuild and Test

```bash
npm run build
```

Then reload extension and test:
```
Settings → Enterprise → Click "Sign in with Google"
```

---

## 🎯 What Happens After Setup

**Sign-In Flow:**
```
1. Click "Sign in with Google"
2. Google popup appears
3. Select your account
4. Grant permissions
5. Returns to FormBot with:
   - userId: google_123456789
   - email: you@gmail.com
   - name: Your Name
   - picture: profile photo URL
```

**Your Enterprise Tab Shows:**
```
✅ Signed in as: you@gmail.com
User ID: google_123456789
[Sign Out]
```

---

## 🏢 DynamoDB Integration

**After signed in, you can:**

1. Configure AWS credentials
2. Test DynamoDB connection
3. Sync employee data
4. Auto-sync every 10 seconds

**Zapier writes to DynamoDB with YOUR userId:**
```json
{
  "userId": "google_123456789",  ← Your Google user ID
  "timestamp": 1699876543000,
  "data": {...employee data...}
}
```

**FormBot syncs only YOUR data** based on userId!

---

## 🔒 Security

- ✅ OAuth tokens stored encrypted
- ✅ AWS credentials stored encrypted (AES-256)
- ✅ userId never exposed
- ✅ Each user sees only their data

---

## ⚠️ Important Notes

**For Production:**
- Verify your app with Google (for public release)
- Add privacy policy URL
- Limit scopes to minimum needed

**For Development:**
- External user type works fine
- Up to 100 test users
- No verification needed

---

## 🐛 Troubleshooting

**"OAuth client not found"**
→ Make sure extension ID matches OAuth client item ID

**"Access blocked"**
→ Add your email as test user in OAuth consent screen

**"Invalid client"**
→ Check client_id in manifest.json matches Google Cloud Console

---

That's it! Google SSO is already built and ready to use once you complete the OAuth setup! 🔐✨

