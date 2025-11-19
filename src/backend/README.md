# FormBot Lambda Backend (Python)

Python-based AWS Lambda function for FormBot data processing and DynamoDB integration.

## Features

- Google Sign-In user registration
- Employee data storage from CRM/Zapier
- Profile synchronization
- DynamoDB integration
- RESTful API with CORS

## API Endpoints

### User Registration (after Google Sign-In)
```
POST /api/user/register
Body: {
  "userId": "google_123456789",
  "email": "user@gmail.com",
  "name": "John Doe"
}

Response: {
  "success": true,
  "userId": "google_123456789",
  "message": "User registered successfully"
}
```

### Store Employee Data (from Zapier)
```
POST /api/user/data
Body: {
  "userId": "google_123456789",
  "employeeId": "EMP-001",
  "name": "Jane Smith",
  "email": "jane@company.com",
  "department": "Engineering",
  ...any CRM fields
}

Response: {
  "success": true,
  "itemId": "EMP-001"
}
```

### Sync Profiles (FormBot extension calls this)
```
GET /api/sync?userId=google_123&lastSync=1699876543000

Response: {
  "items": [...new profiles...],
  "count": 3,
  "timestamp": 1699876600000
}
```

### Get User Data
```
GET /api/user/data?userId=google_123

Response: {
  "userId": "google_123",
  "email": "user@gmail.com",
  "name": "John Doe",
  ...
}
```

### Health Check
```
GET /health

Response: {
  "status": "healthy",
  "service": "FormBot Lambda",
  "timestamp": 1699876543000
}
```

## DynamoDB Table Structure

**Table:** `form-bot-data`

**Keys:**
- Partition Key: `userId` (String)
- Sort Key: `dataType` (String)

**Item Types:**

**User:**
```json
{
  "userId": "google_123456789",
  "dataType": "user",
  "timestamp": 1699876543000,
  "email": "user@gmail.com",
  "name": "John Doe",
  "lastActive": 1699876543000
}
```

**Employee (from CRM via Zapier):**
```json
{
  "userId": "google_123456789",
  "dataType": "employee",
  "timestamp": 1699876543000,
  "itemId": "EMP-001",
  "name": "Employee: Jane Smith",
  "data": "{\"firstName\":\"Jane\",\"lastName\":\"Smith\",...}"
}
```

**Profile:**
```json
{
  "userId": "google_123456789",
  "dataType": "profile",
  "timestamp": 1699876543000,
  "itemId": "profile_001",
  "name": "Personal Profile",
  "data": "{\"email\":\"...\",\"phone\":\"...\"}"
}
```

## Build & Deploy

### Local Build
```bash
cd src/backend

# Install dependencies locally (for testing)
pip install -r requirements.txt
```

### Docker Build
```bash
# Build image
docker build -t formbot-lambda .

# Test locally
docker run -p 9000:8080 formbot-lambda

# Test endpoint
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" \
  -d '{"httpMethod":"GET","path":"/health"}'
```

### Deploy to AWS

**1. Create ECR Repository:**
```bash
aws ecr create-repository --repository-name formbot-lambda --region us-east-1
```

**2. Build and Push:**
```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t formbot-lambda .

# Tag
docker tag formbot-lambda:latest YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/formbot-lambda:latest

# Push
docker push YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/formbot-lambda:latest
```

**3. Create Lambda Function:**
```bash
aws lambda create-function \
  --function-name formbot-api \
  --package-type Image \
  --code ImageUri=YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/formbot-lambda:latest \
  --role arn:aws:iam::YOUR_AWS_ACCOUNT:role/formbot-lambda-role \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{DYNAMODB_TABLE=form-bot-data}"
```

**4. Create API Gateway:**
```bash
# Create REST API
aws apigateway create-rest-api --name FormBotAPI --region us-east-1

# Add resources and methods
# Connect to Lambda function
# Deploy to stage (Prod)
```

## IAM Role

Lambda needs this role with permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/form-bot-data"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

## Environment Variables

```
DYNAMODB_TABLE=form-bot-data
AWS_REGION=us-east-1
```

## Zapier Integration

**Zap Example:**
```
Trigger: New Employee in Workday

Action: Webhooks → Custom Request
  Method: POST
  URL: https://YOUR_API.execute-api.us-east-1.amazonaws.com/Prod/api/user/data
  Headers: Content-Type: application/json
  Body: {
    "userId": "google_YOUR_USER_ID",
    "employeeId": "{{employee_id}}",
    "name": "{{first_name}} {{last_name}}",
    "email": "{{work_email}}",
    "department": "{{department}}",
    "jobTitle": "{{job_title}}",
    ...
  }
```

## Testing

```bash
# Health check
curl https://YOUR_API.execute-api.us-east-1.amazonaws.com/Prod/health

# Register user
curl -X POST https://YOUR_API/Prod/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"google_test","email":"test@gmail.com","name":"Test User"}'

# Sync
curl "https://YOUR_API/Prod/api/sync?userId=google_test&lastSync=0"
```

## Security

- CORS configured for extension access
- IAM role with least privilege
- DynamoDB encryption at rest
- API Gateway throttling recommended
- Consider adding API key authentication

## Cost (AWS Free Tier)

- Lambda: 1M requests/month free
- DynamoDB: 25 GB storage + 25 RCU/WCU free
- API Gateway: 1M calls/month free
- **Essentially free for personal/small team use!**
