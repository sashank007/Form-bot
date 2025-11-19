@echo off
REM FormBot Lambda Deployment Script for Windows
REM Deploy to AWS Lambda with API Gateway

echo.
echo ========================================
echo   FormBot Lambda Deployment
echo ========================================
echo.

REM Configuration
set AWS_REGION=us-east-1
set AWS_ACCOUNT_ID=590183960846
set ECR_REPO=formbot
set IMAGE_TAG=latest
set LAMBDA_NAME=formbot-api
set API_NAME=FormBotAPI

echo Region: %AWS_REGION%
echo Account: %AWS_ACCOUNT_ID%
echo ECR Repo: %ECR_REPO%
echo.

REM Step 1: Login to ECR
echo [1/6] Logging in to ECR...
aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com
if %ERRORLEVEL% neq 0 (
    echo ERROR: ECR login failed
    exit /b 1
)
echo ✓ Logged in to ECR
echo.

REM Step 2: Build Docker image
echo [2/6] Building Docker image...
docker build -t %ECR_REPO% .
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed
    exit /b 1
)
echo ✓ Docker image built
echo.

REM Step 3: Tag image
echo [3/6] Tagging image...
docker tag %ECR_REPO%:%IMAGE_TAG% %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%ECR_REPO%:%IMAGE_TAG%
echo ✓ Image tagged
echo.

REM Step 4: Push to ECR
echo [4/6] Pushing to ECR...
docker push %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%ECR_REPO%:%IMAGE_TAG%
if %ERRORLEVEL% neq 0 (
    echo ERROR: Push to ECR failed
    exit /b 1
)
echo ✓ Pushed to ECR
echo.

REM Step 5: Update Lambda function (or create if doesn't exist)
echo [5/6] Updating Lambda function...

REM Check if Lambda exists
aws lambda get-function --function-name %LAMBDA_NAME% --region %AWS_REGION% >nul 2>&1

if %ERRORLEVEL% equ 0 (
    REM Lambda exists - update it
    echo Updating existing Lambda function...
    aws lambda update-function-code ^
        --function-name %LAMBDA_NAME% ^
        --image-uri %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%ECR_REPO%:%IMAGE_TAG% ^
        --region %AWS_REGION%
    
    REM Wait for update to complete
    timeout /t 5 /nobreak >nul
    
    REM Update environment variables
    aws lambda update-function-configuration ^
        --function-name %LAMBDA_NAME% ^
        --environment "Variables={DYNAMODB_TABLE=form-bot-data}" ^
        --timeout 30 ^
        --memory-size 512 ^
        --region %AWS_REGION%
) else (
    REM Lambda doesn't exist - create it
    echo Creating new Lambda function...
    echo.
    echo NOTE: You need to create an IAM role first!
    echo Go to: https://console.aws.amazon.com/iam/
    echo Create role for Lambda with DynamoDB permissions
    echo.
    set /p LAMBDA_ROLE="Enter Lambda execution role ARN: "
    
    aws lambda create-function ^
        --function-name %LAMBDA_NAME% ^
        --package-type Image ^
        --code ImageUri=%AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%ECR_REPO%:%IMAGE_TAG% ^
        --role %LAMBDA_ROLE% ^
        --timeout 30 ^
        --memory-size 512 ^
        --environment "Variables={DYNAMODB_TABLE=form-bot-data}" ^
        --region %AWS_REGION%
)

if %ERRORLEVEL% neq 0 (
    echo ERROR: Lambda update/create failed
    exit /b 1
)
echo ✓ Lambda function updated
echo.

REM Step 6: Deploy API Gateway (using SAM if available, otherwise manual)
echo [6/6] Setting up API Gateway...
echo.
echo If you have AWS SAM installed, run:
echo   sam deploy --template-file template.yaml --stack-name formbot-api --capabilities CAPABILITY_IAM --region %AWS_REGION%
echo.
echo Otherwise, create API Gateway manually:
echo   1. Go to: https://console.aws.amazon.com/apigateway/
echo   2. Create REST API: %API_NAME%
echo   3. Add resources: /api/user/register, /api/sync, etc.
echo   4. Connect to Lambda: %LAMBDA_NAME%
echo   5. Deploy to stage: Prod
echo.

echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo Lambda Function: %LAMBDA_NAME%
echo ECR Image: %AWS_ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%ECR_REPO%:%IMAGE_TAG%
echo.
echo Next steps:
echo 1. Set up API Gateway (see above)
echo 2. Test endpoint: curl YOUR_API_URL/health
echo 3. Update FormBot extension with API URL
echo.

pause

