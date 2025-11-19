#!/usr/bin/env python3
"""
Test script for FormBot Zapier webhook
Simulates Zapier sending employee data to Lambda
"""

import requests
import json
import sys

# Replace with your actual Lambda API URL
LAMBDA_API_URL = "https://YOUR-API-URL.execute-api.us-east-1.amazonaws.com/Prod"

# Test data - simulates what Zapier would send
test_employee_data = {
    "userId": "google_123456789",  # REPLACE with your actual userId from FormBot extension
    "employeeId": "EMP001",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@company.com",
    "phone": "(555) 123-4567",
    "address": "123 Main Street",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94102",
    "department": "Engineering",
    "jobTitle": "Software Engineer",
    "startDate": "2024-01-15",
    "dateOfBirth": "1990-05-20",
    "ssn": "XXX-XX-1234",
    "emergencyContact": "Jane Doe",
    "emergencyPhone": "(555) 987-6543"
}

def test_webhook():
    """Send test webhook to Lambda"""
    
    webhook_url = f"{LAMBDA_API_URL}/api/webhook"
    
    print("=" * 60)
    print("🧪 Testing FormBot Webhook")
    print("=" * 60)
    print()
    print(f"📡 Webhook URL: {webhook_url}")
    print(f"👤 User ID: {test_employee_data['userId']}")
    print(f"📦 Sending {len(test_employee_data)} fields...")
    print()
    
    try:
        response = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json"},
            json=test_employee_data,
            timeout=10
        )
        
        print(f"📥 Response Status: {response.status_code}")
        print()
        
        if response.status_code == 200:
            data = response.json()
            print("✅ SUCCESS!")
            print()
            print("Response:")
            print(json.dumps(data, indent=2))
            print()
            print("Next steps:")
            print("1. Open FormBot extension")
            print("2. Go to Data Management tab")
            print(f"3. Look for profile: \"{data.get('label', 'CRM profile')}\"")
            print()
            return True
        else:
            print("❌ FAILED!")
            print()
            print("Response:")
            print(response.text)
            print()
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out")
        print("Check if Lambda is deployed and accessible")
        return False
    except requests.exceptions.ConnectionError:
        print("❌ Connection error")
        print("Check if the Lambda API URL is correct")
        return False
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    print()
    print("⚠️  Before running this test:")
    print("   1. Update LAMBDA_API_URL in this script")
    print("   2. Update userId with your actual User ID from FormBot")
    print("   3. Make sure Lambda is deployed")
    print()
    
    input("Press Enter to continue...")
    print()
    
    success = test_webhook()
    
    if success:
        print("=" * 60)
        print("🎉 Webhook test successful!")
        print("=" * 60)
        sys.exit(0)
    else:
        print("=" * 60)
        print("❌ Webhook test failed")
        print("=" * 60)
        sys.exit(1)

