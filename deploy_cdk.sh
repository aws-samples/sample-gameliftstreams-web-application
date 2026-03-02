#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

# Run the deploy script with your stream group identifier
#
# Usage: ./deploy_cdk.sh <stream-group-id>
# Example: ./deploy_cdk.sh sg-000000000
#
if [ $# -ne 1 ]; then
    echo "Usage: $0 <stream-group-id>"
    echo "Example: $0 sg-000000000"
    exit 1
fi

# Validate StreamGroup ID format
if ! [[ $1 =~ ^sg-[a-zA-Z0-9]{9}$ ]]; then
    echo "Error: Stream Group ID must match pattern sg-XXXXXXXXX"
    echo "Where X is 9 alphanumeric characters"
    echo "Example valid ID: sg-000000000"
    exit 1
fi

# Store the StreamGroup ID
export STREAM_GROUP_ID="$1"
echo "Using Stream Group ID: $STREAM_GROUP_ID"

# Function to check minimum version requirements
check_node_version() {
    local required_major=14
    local node_version=$(node -v | cut -d 'v' -f2)
    local major_version=${node_version%%.*}
    
    if [[ $major_version -lt $required_major ]]; then
        echo "Node.js version $required_major or higher is required (current: $node_version)"
        return 1
    fi
    return 0
}

# Function to check AWS CLI version
check_aws_version() {
    local aws_version=$(aws --version 2>&1 | cut -d/ -f2 | cut -d. -f1)
    if [[ $aws_version -lt 2 ]]; then
        echo "AWS CLI version 2 or higher is required (current: $aws_version)"
        return 1
    fi
    return 0
}

# Get the directory where the script is located
SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
cd "$SCRIPT_DIR"

echo "Starting deployment process..."

# Check Node.js installation and version
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    read -p "Press Enter to continue..."
    exit 1
fi

if ! check_node_version; then
    read -p "Press Enter to continue..."
    exit 1
fi
echo "Node.js version: $(node -v)"

# Check AWS CLI installation and version
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed"
    echo "Please install AWS CLI from https://aws.amazon.com/cli/"
    read -p "Press Enter to continue..."
    exit 1
fi

if ! check_aws_version; then
    read -p "Press Enter to continue..."
    exit 1
fi
echo "AWS CLI version: $(aws --version)"

# Simple AWS credential check
echo "Verifying AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "AWS credentials verification failed"
    echo "Please ensure you have valid AWS credentials configured"
    read -p "Press Enter to continue..."
    exit 1
fi

# Install project dependencies
echo "Installing project dependencies..."
if ! npm install; then
    echo "Failed to install project dependencies"
    read -p "Press Enter to continue..."
    exit 1
fi

# Check if CDK is installed in the project
if ! npm list aws-cdk &> /dev/null; then
    echo "Installing AWS CDK..."
    if ! npm install --save-dev aws-cdk; then
        echo "Failed to install AWS CDK"
        read -p "Press Enter to continue..."
        exit 1
    fi
fi

# Verify CDK version
echo "Verifying CDK version..."
cdk_found=0
if npm list --depth=0 "$PACKAGE_NAME" >/dev/null 2>&1; then
  echo "Package $PACKAGE_NAME is installed locally."
  $cdk_found=1
else
  echo "Package $PACKAGE_NAME is NOT installed locally."
  if npm list --location=global --depth=0 "$PACKAGE_NAME" >/dev/null 2>&1; then
    echo "Package $PACKAGE_NAME is installed globally."
    $cdk_found=1
  fi
fi
if !$cdk_found; then
  echo "CDK is not installed. Please install"
  exit 1
fi


# Build TypeScript files
echo "Building TypeScript files..."
if ! npm run build; then
    echo "Failed to build TypeScript files"

    read -p "Press Enter to continue..."
    exit 1
fi

# Install server dependencies
echo "Installing server dependencies..."
if ! (cd server && npm install --omit=dev); then
    echo "Failed to install server dependencies"
    read -p "Press Enter to continue..."
    exit 1
fi

# CDK deployment steps
echo "Starting CDK deployment process..."

echo "Bootstrapping CDK stack..."
if ! cdk bootstrap; then
    echo "CDK bootstrap failed"
    read -p "Press Enter to continue..."
    exit 1
fi

echo "Synthesizing CDK stack..."
if ! cdk synth; then
    echo "CDK synthesis failed"
    read -p "Press Enter to continue..."
    exit 1
fi

# Set deployment environment
echo "Configuring deployment environment..."
export IS_LOCAL=false
if ! node build.js; then
    echo "Failed to run build script"
    read -p "Press Enter to continue..."
    exit 1
fi

# Deploy
echo "Deploying CDK stack..."
if ! cdk deploy --require-approval never; then
    echo "CDK deployment failed"
    read -p "Press Enter to continue..."
    exit 1
fi

echo "Deployment completed successfully!"
read -p "Press Enter to continue..."
