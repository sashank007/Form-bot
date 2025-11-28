# DynamoDB VPC Endpoint Setup Guide

## Problem
Lambda is in a VPC (needed for Redis) but cannot access DynamoDB, causing connection timeouts:
```
ConnectTimeoutError: Connect timeout on endpoint URL: "https://dynamodb.us-east-1.amazonaws.com/"
```

## Solution: Add DynamoDB VPC Gateway Endpoint

A VPC Gateway Endpoint allows Lambda to access DynamoDB without internet access (free, no NAT Gateway needed).

## Steps to Fix

### Option 1: AWS Console (Easiest)

1. **Go to VPC Console:**
   - https://console.aws.amazon.com/vpc/
   - Region: `us-east-1` (or your region)

2. **Create VPC Endpoint:**
   - Click "Endpoints" → "Create endpoint"
   - **Name:** `formbot-dynamodb-endpoint`
   - **Service category:** AWS services
   - **Service name:** `com.amazonaws.us-east-1.dynamodb` (or your region)
   - **VPC:** Select the VPC where your Lambda is deployed
   - **Route tables:** Select ALL route tables used by Lambda subnets
   - **Policy:** Full access (or custom if needed)
   - Click "Create endpoint"

3. **Wait for creation** (~2-5 minutes)

4. **Verify:**
   - Endpoint status should be "Available"
   - Check Lambda logs - DynamoDB calls should work now

### Option 2: AWS CLI

```bash
# Get your VPC ID and Route Table IDs first
aws ec2 describe-vpcs --region us-east-1
aws ec2 describe-route-tables --region us-east-1 --filters "Name=vpc-id,Values=vpc-xxxxx"

# Create DynamoDB VPC endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-xxxxx \
  --service-name com.amazonaws.us-east-1.dynamodb \
  --route-table-ids rtb-xxxxx rtb-yyyyy \
  --region us-east-1
```

### Option 3: CloudFormation Template

Add this to your `template.yaml`:

```yaml
  DynamoDBVPCEndpoint:
    Type: AWS::EC2::VPCEndpoint
    Properties:
      VpcId: !Ref YourVPC  # Or use parameter
      ServiceName: !Sub 'com.amazonaws.${AWS::Region}.dynamodb'
      RouteTableIds:
        - !Ref YourRouteTable  # Or use parameter
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal: '*'
            Action:
              - dynamodb:*
            Resource: '*'
```

## How to Find Your VPC Configuration

### Find Lambda's VPC:
```bash
aws lambda get-function-configuration \
  --function-name formbot-lambda \
  --region us-east-1 \
  --query 'VpcConfig.VpcId'
```

### Find Route Tables:
```bash
aws ec2 describe-route-tables \
  --region us-east-1 \
  --filters "Name=vpc-id,Values=vpc-xxxxx" \
  --query 'RouteTables[*].[RouteTableId,SubnetId]'
```

## Verification

After creating the endpoint:

1. **Check endpoint status:**
   ```bash
   aws ec2 describe-vpc-endpoints \
     --region us-east-1 \
     --filters "Name=service-name,Values=com.amazonaws.us-east-1.dynamodb"
   ```

2. **Test Lambda:**
   - Invoke Lambda function
   - Check CloudWatch logs - should see successful DynamoDB queries
   - No more `ConnectTimeoutError`

## Important Notes

- **Gateway endpoints are FREE** - no data transfer costs
- **Only works for DynamoDB** - other AWS services need Interface endpoints (costs money)
- **Must be in same region** - endpoint region must match DynamoDB region
- **Route tables** - Must include all route tables used by Lambda subnets

## Troubleshooting

### Endpoint created but still timing out?
- Check route tables are correct
- Verify endpoint is in "Available" state
- Check Lambda subnet is using correct route table
- Wait 2-3 minutes for propagation

### Can't find VPC?
- Lambda might not be in VPC (check Lambda configuration)
- If Lambda is NOT in VPC, DynamoDB should work without endpoint
- Check Lambda → Configuration → VPC settings

### Still having issues?
- Check CloudWatch VPC Flow Logs
- Verify security groups allow outbound HTTPS (443)
- Check Lambda execution role has DynamoDB permissions


