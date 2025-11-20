# 🔍 Auto-Detect Google Sheets User (No Email Column Needed)

## Problem
You want to automatically detect which Google user created/updated a row in Google Sheets, without adding an email column.

## ✅ Solution: Add Zapier Step to Get Google Account Info

### Step-by-Step Setup

#### Step 1: Add "Get User Info" Step in Zapier

In your Zap, add a step **between** Google Sheets trigger and Webhook action:

1. **Trigger:** Google Sheets → New or Updated Spreadsheet Row
2. **NEW STEP:** Google Sheets → **"Get User Info"** (or "Get Account Info")
   - This gets the email of the Google account connected to Zapier
3. **Action:** Webhooks by Zapier → POST

#### Step 2: Map Google Account Email in Webhook

In your webhook JSON body, include the Google account email:

```json
{
  "googleAccountEmail": "{{2. Email}}",
  "col_a": "{{1. col_a}}",
  "col_b": "{{1. col_b}}",
  "row_id": "{{1. row_id}}",
  "row_number": "{{1. row_number}}"
}
```

**Note:** The `{{2. Email}}` refers to step 2 (Get User Info), `{{1. col_a}}` refers to step 1 (Google Sheets trigger).

### Alternative: Use Google Sheets API to Get Editor Email

If Zapier doesn't have "Get User Info", you can use Google Sheets API:

#### Option A: Add Google Sheets "Get Spreadsheet" Step

1. Add step: **Google Sheets → Get Spreadsheet**
2. This might include editor information
3. Map editor email to webhook

#### Option B: Use Revision History (Advanced)

1. Add step: **Google Sheets → Get Revision History**
2. Get the email of who made the last edit
3. Map that email to webhook

### Step 3: Lambda Will Auto-Detect

The Lambda function now checks for these email fields automatically:
- `email`
- `Email`
- `googleAccountEmail`
- `googleEmail`
- `accountEmail`
- `sheetsUserEmail`

So as long as you include one of these in your webhook JSON, Lambda will find the userId!

## 📋 Complete Zap Configuration

**Trigger:**
- Google Sheets → New or Updated Spreadsheet Row

**Step 2 (NEW):**
- Google Sheets → Get User Info
- Or: Google Sheets → Get Account Info

**Step 3:**
- Webhooks by Zapier → POST
- URL: `https://it2kk01dc9.execute-api.us-east-1.amazonaws.com/Prod/api/webhook`
- JSON Body:
```json
{
  "googleAccountEmail": "{{2. Email}}",
  "col_a": "{{1. col_a}}",
  "col_b": "{{1. col_b}}",
  "row_id": "{{1. row_id}}",
  "row_number": "{{1. row_number}}"
}
```

## ⚠️ Important Notes

1. **User Must Sign In First**: The Google account email must be registered in FormBot (user must sign in to extension at least once)

2. **Zapier Account vs Sheet Editor**: 
   - If you use "Get User Info", it gets the Zapier-connected Google account email
   - This might be different from who edited the sheet
   - For actual editor, you'd need revision history

3. **Multiple Users**: If multiple people edit the sheet, each edit will use the Zapier-connected account email (not the actual editor)

## 🎯 Recommended Approach

**For single-user sheets** (one person manages the sheet):
- Use "Get User Info" step
- Works perfectly!

**For multi-user sheets** (multiple people edit):
- Add email column to sheet (simplest)
- Or use revision history to get actual editor

## 🧪 Testing

1. Add a row to your Google Sheet
2. Check Zapier Zap History - should show 3 steps
3. Check Lambda logs - should show email lookup
4. Check FormBot extension - profile should appear!

