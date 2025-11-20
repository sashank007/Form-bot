# Zapier Integration Guide for FormBot

## 🎯 Overview

Send employee/customer data from **any app** (Google Sheets, Airtable, HubSpot, Salesforce, etc.) directly to FormBot via Zapier webhooks. The data automatically becomes a profile that employees can use to auto-fill forms.

## 🌊 Data Flow

```
Google Sheets / CRM / Any App
          ↓
       Zapier Zap
          ↓
  Lambda Webhook Endpoint
          ↓
      DynamoDB
          ↓
   FormBot Extension
          ↓
    User's Browser
```

## 📋 Step-by-Step Setup

### Step 1: Deploy Lambda with Webhook Endpoint

```bash
cd src/backend
./deploy.sh  # or deploy.bat on Windows
```

This deploys Lambda with the `/api/webhook` endpoint.

### Step 2: Get Your Lambda API URL

After deployment, you'll see:
```
API Gateway endpoint URL: https://abc123xyz.execute-api.us-east-1.amazonaws.com/Prod/
```

Your webhook URL will be:
```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/Prod/api/webhook
```

### Step 3: Create a Zap in Zapier

#### 1. **Choose Your Trigger App**

Examples:
- **Google Sheets** → "New or Updated Spreadsheet Row"
- **Airtable** → "New Record"
- **HubSpot** → "New Contact"
- **Salesforce** → "New Lead"
- **Typeform** → "New Entry"
- **Any app with data!**

#### 2. **Add Action: Webhooks by Zapier**

- Choose **"Webhooks by Zapier"**
- Action Event: **"POST"** or **"Custom Request"**

#### 3. **Configure the Webhook**

**Method:** `POST`

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
  "userId": "google_USER_ID_HERE",
  "employeeId": "{{Employee ID}}",
  "firstName": "{{First Name}}",
  "lastName": "{{Last Name}}",
  "email": "{{Email}}",
  "phone": "{{Phone}}",
  "address": "{{Address}}",
  "city": "{{City}}",
  "state": "{{State}}",
  "zipCode": "{{Zip Code}}",
  "department": "{{Department}}",
  "jobTitle": "{{Job Title}}",
  "startDate": "{{Start Date}}",
  "any_custom_field": "{{Any Custom Field}}"
}
```

**Important:** Replace `{{Field Name}}` with actual field mappings from your trigger app.

### Step 4: Map the userId

The `userId` field is **REQUIRED** and tells FormBot which user should receive this profile.

**How to get userId:**

1. Have the employee sign in to FormBot extension
2. Go to **Enterprise Settings**
3. Copy their User ID (shows as: `google_123456789...`)
4. Use this ID in your Zapier payload

**For multiple employees:**

Option 1: **Static Mapping** (Manual)
- Create separate Zaps for each employee
- Each Zap has their specific `userId` hardcoded

Option 2: **Dynamic Mapping** (Recommended)
- Add a `userId` column to your Google Sheet
- Map it dynamically: `"userId": "{{User ID}}"`

Option 3: **Email-based Lookup** (Advanced)
- Add a lookup step in Zapier to find userId by email
- Store userId mapping in another sheet/database

## 📊 Example Configurations

### Example 1: Google Sheets to FormBot

**Trigger:**
- App: Google Sheets
- Event: New or Updated Spreadsheet Row
- Spreadsheet: "Employee Data"
- Worksheet: "Sheet1"

**Action:**
- App: Webhooks by Zapier
- Event: POST
- URL: `https://YOUR-API-URL/Prod/api/webhook`

**Data Payload:**
```json
{
  "userId": "google_USER_ID",
  "employeeId": "{{1. Employee ID}}",
  "firstName": "{{1. First Name}}",
  "lastName": "{{1. Last Name}}",
  "email": "{{1. Email}}",
  "phone": "{{1. Phone}}",
  "address": "{{1. Address}}",
  "city": "{{1. City}}",
  "state": "{{1. State}}",
  "zipCode": "{{1. Zip}}",
  "ssn": "{{1. SSN}}",
  "dateOfBirth": "{{1. DOB}}",
  "emergencyContact": "{{1. Emergency Contact}}",
  "emergencyPhone": "{{1. Emergency Phone}}"
}
```

### Example 2: Airtable to FormBot

**Trigger:**
- App: Airtable
- Event: New Record
- Base: "HR Database"
- Table: "Employees"

**Action:**
- App: Webhooks by Zapier
- Event: POST
- URL: `https://YOUR-API-URL/Prod/api/webhook`

**Data Payload:**
```json
{
  "userId": "{{Employee User ID}}",
  "employeeId": "{{ID}}",
  "name": "{{Full Name}}",
  "email": "{{Email}}",
  "phone": "{{Phone Number}}",
  "department": "{{Department}}",
  "role": "{{Role}}",
  "hireDate": "{{Hire Date}}",
  "manager": "{{Manager}}",
  "location": "{{Office Location}}"
}
```

### Example 3: HubSpot to FormBot

**Trigger:**
- App: HubSpot
- Event: New Contact

**Action:**
- App: Webhooks by Zapier
- Event: POST
- URL: `https://YOUR-API-URL/Prod/api/webhook`

**Data Payload:**
```json
{
  "userId": "google_SALES_REP_ID",
  "employeeId": "{{Contact ID}}",
  "firstName": "{{First Name}}",
  "lastName": "{{Last Name}}",
  "email": "{{Email}}",
  "phone": "{{Phone Number}}",
  "company": "{{Company Name}}",
  "jobTitle": "{{Job Title}}",
  "website": "{{Website}}",
  "linkedin": "{{LinkedIn URL}}"
}
```

## 🧪 Testing Your Integration

### ⚠️ Important: Chrome Extension URLs Don't Work with Zapier

**Chrome extension URLs (`chrome-extension://...`) cannot be reached by Zapier or any external service.** They only work within the browser context.

**✅ Use your Lambda API webhook URL instead:**
```
https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/Prod/api/webhook
```

**❌ Don't use:**
```
chrome-extension://abc123.../webhook-receiver.html  ← This won't work!
```

The webhook test in Zapier may show a connection error if you try to use a Chrome extension URL. That's expected - use the Lambda URL instead.

### 1. Test in Zapier

Click **"Test & Continue"** in Zapier. You should see:

**Success Response:**
```json
{
  "success": true,
  "message": "Profile created successfully",
  "profileId": "crm_EMP001",
  "userId": "google_123456",
  "label": "CRM: John Doe",
  "fieldCount": 12
}
```

**Error Response:**
```json
{
  "error": "userId is required",
  "message": "Please include userId in the webhook payload to identify the target user"
}
```

### 2. Check Lambda Logs

```bash
# View Lambda logs in CloudWatch
aws logs tail /aws/lambda/FormBotLambda --follow
```

You should see:
```
📥 Webhook received for user: google_123456
📦 Data fields: ['userId', 'employeeId', 'firstName', 'lastName', 'email', 'phone']
✓ Profile name: John Doe
✓ Profile ID: crm_EMP001
✓ Field count: 10
✅ Profile created in DynamoDB: crm_EMP001
```

### 3. Check DynamoDB

```bash
aws dynamodb query \
  --table-name formbot-profiles \
  --index-name userId-index \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"google_123456"}}' \
  --region us-east-1
```

### 4. Check FormBot Extension

1. Open FormBot extension
2. Go to **Data Management** tab
3. You should see: **"CRM: John Doe"** profile
4. Click to view fields

## 🔄 Automatic Sync Workflow

### For Employees:

```
1. HR adds employee data to Google Sheets
   ↓
2. Zapier triggers automatically
   ↓
3. Data sent to Lambda webhook
   ↓
4. Profile created in DynamoDB
   ↓
5. Employee opens FormBot
   ↓
6. Extension fetches from DynamoDB
   ↓
7. Profile appears automatically!
```

### For Bulk Import:

```
1. HR uploads CSV to Google Sheets (100 employees)
   ↓
2. Zapier processes each row
   ↓
3. 100 webhooks sent to Lambda
   ↓
4. 100 profiles created in DynamoDB
   ↓
5. All employees see their profiles instantly
```

## 🛠️ Advanced Configuration

### Dynamic userId Lookup

If you don't want to hardcode userIds, create a lookup:

**Step 1:** Create a mapping sheet

| Email                | User ID              |
|----------------------|----------------------|
| john@company.com     | google_123456        |
| jane@company.com     | google_789012        |

**Step 2:** Add Lookup Step in Zapier

- **App:** Google Sheets
- **Action:** Lookup Spreadsheet Row
- **Lookup Column:** Email
- **Lookup Value:** `{{Trigger Email}}`
- **Return:** User ID

**Step 3:** Use looked-up value

```json
{
  "userId": "{{2. User ID}}",
  ...
}
```

### Conditional Webhooks

Only send data for specific conditions:

**Filter in Zapier:**
- **Only continue if:** Department equals "Sales"
- **Only continue if:** Status equals "Active"

### Update Existing Profiles

Send the same `employeeId` to update:

```json
{
  "userId": "google_123456",
  "employeeId": "EMP001",  // Same ID = Update
  "firstName": "John",
  "lastName": "Doe-Updated"
}
```

The profile `crm_EMP001` will be updated with new data.

## 🔐 Security

### Webhook URL Protection

Your webhook URL is public but requires valid `userId`. Consider:

1. **API Key** (Optional - add to Lambda):
```json
{
  "headers": {
    "Content-Type": "application/json",
    "X-API-Key": "your_secret_key_here"
  }
}
```

2. **IP Whitelist** (API Gateway):
- Configure API Gateway to only accept requests from Zapier IPs

3. **Signature Verification** (Advanced):
- Use Zapier webhook signatures to verify authenticity

## 📊 Supported Field Types

The webhook accepts **any JSON-serializable data**:

✅ **Strings:** `"John Doe"`
✅ **Numbers:** `42`, `3.14`
✅ **Booleans:** `true`, `false`
✅ **Dates:** `"2024-01-15"`, `"01/15/2024"`
✅ **Arrays:** `["skill1", "skill2"]` (stored as JSON string)
✅ **Objects:** `{"address": {"street": "123 Main"}}` (stored as JSON string)

## 🎯 Use Cases

### 1. Employee Onboarding

**Scenario:** HR fills employee data in Google Sheets
**Result:** Employee gets pre-filled I-9, W-4, benefits forms

### 2. Sales Lead Management

**Scenario:** New lead in HubSpot
**Result:** Sales rep gets pre-filled client info for contracts

### 3. Customer Service

**Scenario:** Customer record in Zendesk
**Result:** Support agent has customer details for tickets

### 4. Event Registration

**Scenario:** Attendee registers in Typeform
**Result:** Attendee profile created for badge printing forms

## 🆘 Troubleshooting

### Error: "userId is required"

**Cause:** Missing or empty `userId` in payload

**Fix:** Add `userId` field:
```json
{
  "userId": "google_123456",
  ...
}
```

### Error: "Invalid JSON"

**Cause:** Malformed JSON in payload

**Fix:** Validate JSON structure in Zapier formatter

### Profile Not Appearing in Extension

**Possible causes:**
1. Not signed in with correct Google account
2. Wrong `userId` in webhook payload
3. Extension not fetching from cloud

**Fix:**
1. Check User ID in Enterprise Settings
2. Manually click "⬇️ Pull from Cloud"
3. Check browser console for errors

### Webhook Timing Out

**Cause:** Lambda cold start or DynamoDB throttling

**Fix:**
- Lambda automatically retries
- Check CloudWatch logs for actual error
- Consider provisioned concurrency for Lambda

## 📝 Complete Example

### Google Sheets Setup:

| A: Employee ID | B: First Name | C: Last Name | D: Email           | E: Phone       | F: User ID         |
|----------------|---------------|--------------|-------------------|----------------|--------------------|
| EMP001         | John          | Doe          | john@company.com  | 555-1234       | google_123456      |
| EMP002         | Jane          | Smith        | jane@company.com  | 555-5678       | google_789012      |

### Zapier Configuration:

**Trigger:** Google Sheets → New or Updated Row

**Action:** Webhooks by Zapier → POST

**URL:** `https://your-api.amazonaws.com/Prod/api/webhook`

**Payload:**
```json
{
  "userId": "{{F: User ID}}",
  "employeeId": "{{A: Employee ID}}",
  "firstName": "{{B: First Name}}",
  "lastName": "{{C: Last Name}}",
  "email": "{{D: Email}}",
  "phone": "{{E: Phone}}"
}
```

**Result:** Both employees get profiles in their FormBot extensions!

## ✅ Checklist

Before going live:

- [ ] Lambda deployed with webhook endpoint
- [ ] DynamoDB profiles table created
- [ ] Zapier Zap configured and tested
- [ ] userId mapping established
- [ ] Test profile received in extension
- [ ] Employees signed in to FormBot
- [ ] Auto-sync enabled in extension settings

## 🎉 Success!

Once configured, your Zapier integration will:
- ✅ Automatically send employee/customer data to FormBot
- ✅ Create profiles in DynamoDB
- ✅ Make data available to users instantly
- ✅ Keep profiles synced across devices
- ✅ Enable one-click form filling

Your FormBot is now fully integrated with your CRM/HR system! 🚀

