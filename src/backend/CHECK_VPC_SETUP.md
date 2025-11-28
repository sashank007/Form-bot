# Check What Changed in VPC Setup

If Lambda was already in VPC and DynamoDB worked before, something changed. Check these:

## Quick Diagnostic Commands

```bash
# 1. Check if DynamoDB VPC endpoint exists
aws ec2 describe-vpc-endpoints \
  --region us-east-1 \
  --filters "Name=service-name,Values=com.amazonaws.us-east-1.dynamodb" \
  --query 'VpcEndpoints[*].[VpcEndpointId,VpcId,State]'

# 2. Check Lambda's VPC and subnets
aws lambda get-function-configuration \
  --function-name formbot-api \
  --region us-east-1 \
  --query 'VpcConfig'

# 3. Check route tables for Lambda's subnets
aws ec2 describe-route-tables \
  --region us-east-1 \
  --filters "Name=vpc-id,Values=vpc-xxxxx" \
  --query 'RouteTables[*].[RouteTableId,Associations[0].SubnetId,Routes]'

# 4. Check if NAT Gateway exists in route tables
aws ec2 describe-route-tables \
  --region us-east-1 \
  --filters "Name=vpc-id,Values=vpc-xxxxx" \
  --query 'RouteTables[*].[RouteTableId,Routes[?GatewayId!=null]]'
```

## Possible Causes

### 1. NAT Gateway Was Removed/Changed
- **Before:** Lambda subnets had route to NAT Gateway → Internet access → DynamoDB worked
- **Now:** Route table changed, NAT Gateway removed, or route deleted
- **Fix:** Restore NAT Gateway route OR add DynamoDB VPC endpoint

### 2. DynamoDB VPC Endpoint Was Deleted
- **Before:** DynamoDB VPC endpoint existed
- **Now:** Endpoint was deleted or route tables changed
- **Fix:** Recreate DynamoDB VPC endpoint (see VPC_ENDPOINT_SETUP.md)

### 3. Lambda Moved to Different Subnets
- **Before:** Lambda in subnets with NAT Gateway/VPC endpoint
- **Now:** Lambda in different subnets without internet access
- **Fix:** Move Lambda back OR add VPC endpoint to new subnets

### 4. Route Tables Changed
- **Before:** Route tables had routes to NAT Gateway or VPC endpoint
- **Now:** Route tables changed, routes removed
- **Fix:** Restore routes OR add VPC endpoint

### 5. Timeout Configuration Too Aggressive
- **Before:** Default boto3 timeouts (longer)
- **Now:** I set 3-second timeouts (may be too short)
- **Fix:** Increased to 10 seconds in latest code

## What to Check First

1. **Run the diagnostic commands above** to see current state
2. **Check CloudWatch VPC Flow Logs** - see if traffic is being blocked
3. **Check if NAT Gateway exists** - if yes, check route tables
4. **Check if DynamoDB VPC endpoint exists** - if yes, check route tables

## Quick Fix Options

### Option A: If NAT Gateway Exists
- Check route tables have route to NAT Gateway
- Ensure Lambda subnets use those route tables
- Increase DynamoDB timeout if NAT Gateway is slow

### Option B: Add DynamoDB VPC Endpoint (Recommended)
- Free, no NAT Gateway needed
- Faster than NAT Gateway
- See VPC_ENDPOINT_SETUP.md

### Option C: Restore Previous Configuration
- If you know what changed, revert it
- Check AWS Config or CloudTrail for changes


