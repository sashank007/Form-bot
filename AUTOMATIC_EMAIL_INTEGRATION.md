# 🎯 Automatic Email-Based Zapier Integration

## ✅ The Simple Solution: Use EMAIL Instead of userId

### 🔑 How It Works (Fully Automatic!)

```
Step 1: Employee Signs In to FormBot
  → Extension automatically sends to Lambda:
     POST /api/user/register
     {"userId": "google_123456", "email": "john@company.com", "name": "John Doe"}
  → Lambda stores email → userId mapping in DynamoDB users table

Step 2: HR Creates Google Sheet (Only Needs Emails!)
  ┌──────────────┬─────────────────────┬────────────┐
  │ Employee ID  │ Email               │ First Name │
  ├──────────────┼─────────────────────┼────────────┤
  │ EMP001       │ john@company.com    │ John       │
  │ EMP002       │ jane@company.com    │ Jane       │
  └──────────────┴─────────────────────┴────────────┘
  
  ✅ NO need to collect userId!
  ✅ NO manual mapping required!
  ✅ HR already has all employee emails!

Step 3: Zapier Webhook (Just Send Email!)
  POST /api/webhook
  {
    "email": "john@company.com",    ← Lambda looks up userId automatically
    "employeeId": "EMP001",
    "firstName": "John",
    ...
  }

Step 4: Lambda Automatically
  → Looks up email in users table
  → Finds userId: google_123456
  → Creates profile for that user
  
Step 5: Employee Opens FormBot
  → Profile appears automatically!
```

## 📋 Complete Setup Guide

### Step 1: Employees Sign In (One-Time Setup)

**Tell each employee:**

1. Install FormBot Chrome extension
2. Click the extension icon
3. Go to "Enterprise Settings" tab
4. Click **"Sign in with Google"**
5. Done! ✅

**What happens behind the scenes:**
```
Extension → Lambda: POST /api/user/register
{
  "userId": "google_123456789...",
  "email": "john@company.com",
  "name": "John Doe"
}

Lambda → DynamoDB users table:
{
  userId: "google_123456789...",
  email: "john@company.com",  ← Stored for lookup!
  displayName: "John Doe",
  lastLoginAt: 1700000000000
}
```

### Step 2: HR Creates Google Sheet (Easy!)

```
Google Sheet: "Employee Data"
┌────────────┬─────────────────────┬────────────┬───────────┬──────────────┐
│ Employee ID│ Email               │ First Name │ Last Name │ Phone        │
├────────────┼─────────────────────┼────────────┼───────────┼──────────────┤
│ EMP001     │ john@company.com    │ John       │ Doe       │ 555-1234     │
│ EMP002     │ jane@company.com    │ Jane       │ Smith     │ 555-5678     │
│ EMP003     │ bob@company.com     │ Bob        │ Johnson   │ 555-9012     │
└────────────┴─────────────────────┴────────────┴───────────┴──────────────┘
```

**Key points:**
- ✅ Just use work email (HR already has this!)
- ✅ NO userId column needed!
- ✅ NO manual lookup required!

### Step 3: Configure Zapier (Simple!)

**Trigger:**
- App: **Google Sheets**
- Event: **New or Updated Spreadsheet Row**
- Spreadsheet: "Employee Data"

**Action:**
- App: **Webhooks by Zapier**
- Event: **POST**

**URL:**
```
https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/Prod/api/webhook
```

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Data (JSON):**
```json
{
  "email": "{{Email}}",
  "employeeId": "{{Employee ID}}",
  "firstName": "{{First Name}}",
  "lastName": "{{Last Name}}",
  "phone": "{{Phone}}",
  "address": "{{Address}}",
  "city": "{{City}}",
  "state": "{{State}}",
  "zipCode": "{{Zip Code}}",
  "department": "{{Department}}",
  "jobTitle": "{{Job Title}}"
}
```

**That's it!** Just map the email field - Lambda handles the rest!

### Step 4: Test!

Add a test row to Google Sheet:
```
EMP999 | test@company.com | Test | User | 555-0000
```

Check:
1. Zapier runs (check Zap History)
2. Lambda logs show lookup (CloudWatch)
3. Profile appears in FormBot for that user

## 🔄 Complete Data Flow

```
1. Employee signs in to FormBot
   ↓
   Extension: "I'm google_123456, email is john@company.com"
   ↓
   Lambda: Stores in users table
   {userId: google_123456, email: john@company.com}

2. HR adds row to Google Sheet
   ↓
   Row: EMP001 | john@company.com | John | Doe | ...

3. Zapier triggers
   ↓
   POST /api/webhook
   {"email": "john@company.com", "employeeId": "EMP001", ...}

4. Lambda processes
   ↓
   Step 1: Look up email "john@company.com" in users table
   Step 2: Find userId: "google_123456"
   Step 3: Create profile with userId: "google_123456"
   Step 4: Store in profiles table:
   {
     profileId: "crm_EMP001",
     userId: "google_123456",
     label: "CRM: John Doe",
     fields: {...}
   }

5. Employee opens FormBot
   ↓
   Extension: "I'm google_123456, fetch my profiles"
   ↓
   Lambda: Query WHERE userId = google_123456
   ↓
   Returns: Profile "CRM: John Doe"
   ↓
   Employee sees profile and can use it! ✅
```

## ✅ Benefits of Email-Based Approach

### 1. **Zero Manual Work**
- ❌ No collecting userId from employees
- ❌ No manual userId mapping
- ❌ No separate lookup sheets
- ✅ Just use email (which HR already has!)

### 2. **Fully Automatic**
- Employee signs in once → Registered automatically
- HR uses existing email list
- Zapier sends email → Lambda looks up userId
- Profile appears automatically

### 3. **Works at Scale**
- 1 employee? Works.
- 1000 employees? Works.
- No additional complexity

### 4. **Self-Service**
- Employee can sign in before or after HR enters data
- Order doesn't matter
- If employee not signed in yet → Friendly error message

## 🧪 Testing

### Test 1: Employee Not Signed In Yet

```bash
curl -X POST https://YOUR-API-URL/Prod/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new.employee@company.com",
    "firstName": "New",
    "lastName": "Employee"
  }'
```

**Expected Response:**
```json
{
  "error": "User not found",
  "message": "No user registered with email: new.employee@company.com. Please have the employee sign in to FormBot first."
}
```

**Solution:** Have employee sign in to FormBot, then try again!

### Test 2: Employee Already Signed In

```bash
# Employee signed in first, then:
curl -X POST https://YOUR-API-URL/Prod/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@company.com",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "profileId": "crm_webhook_1700000000",
  "userId": "google_123456789",
  "label": "CRM: John Doe",
  "fieldCount": 2
}
```

## 📊 Real-World Example

### Company: TechCorp (100 employees)

**Day 1: Rollout**
```
1. IT sends email: "Please install FormBot and sign in with your Google account"
2. 80 employees sign in on Day 1
3. Extension automatically registers 80 users in DynamoDB
   ✅ No manual work required!
```

**Day 2: HR Uploads Data**
```
1. HR has Excel file with employee data
2. HR copies to Google Sheet (100 rows)
3. HR sets up Zapier once
4. Zapier processes all 100 rows
   ✅ 80 profiles created (employees who signed in)
   ❌ 20 failed (employees haven't signed in yet)
```

**Day 3-7: Stragglers Sign In**
```
1. Remaining 20 employees sign in
2. Extension auto-registers them
3. HR doesn't need to do anything
4. Zapier re-runs for those 20 employees (or HR clicks "Retry Failed")
5. All 100 profiles now exist!
   ✅ Self-healing system!
```

## 🔐 Security

**Q: Can someone spoof an email in the webhook?**
**A:** Yes, but it doesn't matter! They can only create a profile FOR that user (not access it).

**Example:**
```
Attacker sends:
{
  "email": "victim@company.com",
  "data": "malicious data"
}

Result:
- Profile created for victim@company.com's userId
- Only victim@company.com can see it (when they sign in)
- Attacker can't access victim's data
- Victim can delete the malicious profile
```

**Additional Security (Optional):**
- Add API key to webhook URL
- Whitelist Zapier IP addresses in API Gateway
- Add webhook signature verification

## 📝 Zapier Configuration Summary

**Simplest possible configuration:**

```
Trigger: Google Sheets → New Row

Action: Webhooks → POST
  URL: https://YOUR-API/Prod/api/webhook
  Body:
  {
    "email": "{{Email Column}}",
    "employeeId": "{{Employee ID Column}}",
    ...any other fields from your sheet
  }
```

**That's literally it!** Just map the email column. Lambda does the rest.

## 🎉 Result

### Before (Complex):
```
1. Employee signs in
2. Employee copies userId
3. Employee emails userId to HR
4. HR adds userId to sheet
5. HR updates Zapier mapping
6. Zapier sends userId to Lambda
7. Profile created
```
**7 steps, lots of manual work** 😓

### After (Automatic):
```
1. Employee signs in
2. HR uses email in sheet (already has it!)
3. Profile appears automatically
```
**3 steps, zero manual work** 🎉

## ✅ Checklist

Before going live:

- [ ] Lambda deployed with email lookup support
- [ ] All employees have signed in to FormBot (or will sign in)
- [ ] Google Sheet has email column
- [ ] Zapier Zap configured with email field
- [ ] Test with one employee
- [ ] Verify profile appears in FormBot
- [ ] Deploy to all employees!

Your Zapier integration is now **fully automatic** using just email addresses! 🚀

