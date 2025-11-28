#!/usr/bin/env python3
"""
Helper script to find VPC configuration for Lambda
Helps identify VPC ID and Route Tables needed for DynamoDB VPC endpoint
"""

import boto3
import json
import sys

def find_lambda_vpc():
    """Find VPC configuration for Lambda function"""
    lambda_name = 'formbot-lambda'
    region = 'us-east-1'
    
    try:
        lambda_client = boto3.client('lambda', region_name=region)
        ec2_client = boto3.client('ec2', region_name=region)
        
        print(f"🔍 Looking for Lambda: {lambda_name} in {region}...")
        
        # Get Lambda configuration
        try:
            lambda_config = lambda_client.get_function_configuration(FunctionName=lambda_name)
        except lambda_client.exceptions.ResourceNotFoundException:
            print(f"❌ Lambda function '{lambda_name}' not found!")
            print(f"   Check the function name and region.")
            return None
        
        vpc_config = lambda_config.get('VpcConfig', {})
        
        if not vpc_config or not vpc_config.get('VpcId'):
            print("⚠️ Lambda is NOT in a VPC")
            print("   DynamoDB should work without VPC endpoint")
            print("   If you're getting connection errors, check:")
            print("   1. Lambda execution role has DynamoDB permissions")
            print("   2. Network connectivity")
            return None
        
        vpc_id = vpc_config['VpcId']
        subnet_ids = vpc_config.get('SubnetIds', [])
        security_group_ids = vpc_config.get('SecurityGroupIds', [])
        
        print(f"\n✅ Found Lambda VPC Configuration:")
        print(f"   VPC ID: {vpc_id}")
        print(f"   Subnets: {', '.join(subnet_ids)}")
        print(f"   Security Groups: {', '.join(security_group_ids)}")
        
        # Find route tables for these subnets
        print(f"\n🔍 Finding route tables...")
        route_tables = []
        
        for subnet_id in subnet_ids:
            try:
                subnet_info = ec2_client.describe_subnets(SubnetIds=[subnet_id])
                if subnet_info['Subnets']:
                    subnet = subnet_info['Subnets'][0]
                    route_table_id = subnet.get('RouteTableId')
                    if route_table_id:
                        route_tables.append(route_table_id)
                        print(f"   Subnet {subnet_id}: Route Table {route_table_id}")
            except Exception as e:
                print(f"   ⚠️ Could not get route table for subnet {subnet_id}: {e}")
        
        # Also get all route tables for the VPC
        try:
            vpc_route_tables = ec2_client.describe_route_tables(
                Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}]
            )
            all_route_table_ids = [rt['RouteTableId'] for rt in vpc_route_tables['RouteTables']]
            
            print(f"\n📋 All Route Tables in VPC {vpc_id}:")
            for rt_id in all_route_table_ids:
                print(f"   {rt_id}")
            
            # Use all route tables (safer)
            route_tables = list(set(all_route_table_ids))
        except Exception as e:
            print(f"   ⚠️ Could not get all route tables: {e}")
        
        print(f"\n✅ DynamoDB VPC Endpoint Configuration:")
        print(f"   VPC ID: {vpc_id}")
        print(f"   Route Tables: {', '.join(route_tables)}")
        print(f"   Service Name: com.amazonaws.{region}.dynamodb")
        
        print(f"\n📝 AWS CLI Command to create endpoint:")
        print(f"aws ec2 create-vpc-endpoint \\")
        print(f"  --vpc-id {vpc_id} \\")
        print(f"  --service-name com.amazonaws.{region}.dynamodb \\")
        print(f"  --route-table-ids {' '.join(route_tables)} \\")
        print(f"  --region {region}")
        
        print(f"\n📖 For detailed instructions, see: VPC_ENDPOINT_SETUP.md")
        
        return {
            'vpc_id': vpc_id,
            'route_tables': route_tables,
            'subnets': subnet_ids,
            'security_groups': security_group_ids
        }
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == '__main__':
    find_lambda_vpc()


