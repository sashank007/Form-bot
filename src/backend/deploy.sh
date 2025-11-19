#!/bin/bash
# Deploy FormBot Lambda to AWS

set -e

echo "🚀 Deploying FormBot Lambda..."

# Variables
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="formbot-lambda"
IMAGE_TAG="latest"

echo "📍 Region: $AWS_REGION"
echo "🏢 Account: $AWS_ACCOUNT_ID"

# Step 1: Create ECR repository (if doesn't exist)
echo "📦 Creating ECR repository..."
aws ecr create-repository \
  --repository-name $ECR_REPO \
  --region $AWS_REGION 2>/dev/null || echo "Repository already exists"

# Step 2: Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# Step 3: Build Docker image
echo "🏗️ Building Docker image..."
docker build -t $ECR_REPO:$IMAGE_TAG .

# Step 4: Tag image
echo "🏷️ Tagging image..."
docker tag $ECR_REPO:$IMAGE_TAG ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPO:$IMAGE_TAG

# Step 5: Push to ECR
echo "📤 Pushing to ECR..."
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPO:$IMAGE_TAG

# Step 6: Deploy with SAM
echo "☁️ Deploying Lambda and API Gateway..."
sam deploy \
  --template-file template.yaml \
  --stack-name formbot-api \
  --capabilities CAPABILITY_IAM \
  --region $AWS_REGION \
  --image-repository ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPO \
  --parameter-overrides ImageUri=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/$ECR_REPO:$IMAGE_TAG

# Step 7: Get API URL
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Your API URL:"
aws cloudformation describe-stacks \
  --stack-name formbot-api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text

echo ""
echo "🧪 Test with:"
echo "curl \$(aws cloudformation describe-stacks --stack-name formbot-api --query 'Stacks[0].Outputs[?OutputKey==\`ApiUrl\`].OutputValue' --output text)/health"

