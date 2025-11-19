# FormBot Lambda Deployment Guide

## 🚀 Quick Deploy (Windows)

```bash
cd src/backend
deploy.bat
```

This will:
1. Login to ECR
2. Build Docker image
3. Tag and push to ECR
4. Create/update Lambda function
5. Guide you through API Gateway setup

---

## 📋 Prerequisites

### Install Required Tools:

**1. Docker Desktop:**
- Download: https://www.docker.com/products/docker-desktop/
- Install and start Docker

**2. AWS CLI:**
```bash
# Download installer
https://awscli.amazonaws.com/AWSCLIV2.msi

# Verify
aws --version

# Configure
aws configure
# Enter: Access Key, Secret Key, Region (us-east-1), Format (json)
```

**3. AWS SAM CLI (Optional but recommended):**
```bash
# Download
https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

# Verify
sam --version
```

---

## 🔑 AWS Setup

### 1. Create IAM Role for Lambda

**Go to:** https://console.aws.amazon.com/iam/

```
1. Roles → Create role
2. Trusted entity: Lambda
3. Permissions: Add these policies:
   - AWSLambdaBasicExecutionRole
   - AmazonDynamoDBFullAccess (or create custom with only needed permissions)
4. Name: formbot-lambda-role
5. Create
6. Copy ARN: arn:aws:iam::590183960846:role/formbot-lambda-role
```

### 2. Create ECR Repository (done automatically by deploy.bat)

Already created: `formbot`

### 3. Create DynamoDB Table

**Option A: Automatic (with SAM):**
```bash
sam deploy --template-file template.yaml ...
```

**Option B: Manual:**
```
AWS Console → DynamoDB → Create table
  Table name: form-bot-data
  Partition key: userId (String)
  Sort key: dataType (String)
  
Settings:
  - On-demand billing
  - Encryption: AWS owned key
  
Create
```

---

## 📡 API Gateway Setup

### Option 1: Automatic (SAM - Recommended)

```bash
cd src/backend

sam deploy \
  --template-file template.yaml \
  --stack-name formbot-api \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

This creates everything automatically!

### Option 2: Manual (AWS Console)

**1. Create REST API:**
```
API Gateway → Create API → REST API → Build
Name: FormBotAPI
Create
```

**2. Create Resources:**
```
Root (/)
├── api
│   ├── user
│   │   ├── register
│   │   └── data
│   ├── profiles
│   └── sync
└── health
```

**3. Create Methods for Each:**

For `/api/user/register`:
```
POST method
Integration: Lambda Function
Lambda: formbot-api
Enable Lambda Proxy integration
Save
```

Repeat for all 7 endpoints (see README.md for complete list)

**4. Enable CORS:**
```
Each resource → Actions → Enable CORS
Apply to all methods
```

**5. Deploy:**
```
Actions → Deploy API
Stage: Prod
Deploy

Copy Invoke URL: https://xxxxx.execute-api.us-east-1.amazonaws.com/Prod
```

---

## 🧪 Test Deployment

```bash
# Set your API URL
set API_URL=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/Prod

# Health check
curl %API_URL%/health

# Register test user
curl -X POST %API_URL%/api/user/register ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"test_123\",\"email\":\"test@gmail.com\",\"name\":\"Test User\"}"

# Sync endpoint
curl "%API_URL%/api/sync?userId=test_123&lastSync=0"
```

---

## 🔗 Configure FormBot Extension

**After deployment, update FormBot:**

You'll need to modify the extension to call your Lambda API instead of direct DynamoDB.

**Or** keep using direct DynamoDB (which already works!) and use Lambda only for Zapier data ingestion.

---

**TL;DR:** Run `deploy.bat` and it handles everything except API Gateway setup! 🚀
