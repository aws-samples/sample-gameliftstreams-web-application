## Sample Web Application for Amazon GameLift Streams

An easy-to-deploy web application example for Amazon GameLift Streams that enables browser-based game streaming with URL sharing capabilities.

**⚠️ IMPORTANT NOTICE**
This code is example code for testing and evaluation purposes only and should not be used in a production capacity. For guidance on creating production client applications, including proper testing and evaluation procedures, refer to the section on the [web client](https://docs.aws.amazon.com/gameliftstreams/latest/developerguide/sdk.html) in the _Amazon GameLift Streams Developer Guide_.

### Step 1: Check prerequisites

Make sure you have the following prerequisites before continuing to the next step:

1. An AWS account with proper credentials for programmatic access. For detailed instructions, refer to [Setting up Amazon GameLift Streams](https://docs.aws.amazon.com/gameliftstreams/latest/developerguide/setting-up.html) in the _Amazon GameLift Streams Developer Guide_.
2. An Amazon GameLift Streams-supported web browser. Refer to [Supported browsers and input](https://docs.aws.amazon.com/gameliftstreams/latest/developerguide/sdk-browsers-input.html) in the _Amazon GameLift Streams Developer Guide_.
3. Node.js 16 or newer. Download this from the [Node.js downloads](https://nodejs.org/en/download) page.

### Step 2: Download the Web SDK dependencies

Before using either component, you will need to obtain the latest Amazon GameLift Streams Web SDK and drop it into the project files. 

1. Clone this repository to your computer.
2. Download the latest Web SDK bundle from the Amazon GameLift Streams [DOWNLOAD]([https://aws.amazon.com/gamelift/streams/getting-started](https://gameliftstreams-public-website-assets.s3.us-west-2.amazonaws.com/AmazonGameLiftStreamsWebSDK-v1.0.0.zip))
3. Unzip the bundle.
4. Copy the `gameliftstreams-x.x.x.mjs` and `gameliftstreams-x.x.x.js` files into the `server/public` folder of this project (next to the other source files like `index.html`).

### Step 3: Setup components

You can choose to set up either or both of the following components, based on your needs:

#### Local web server

**Windows:**

- Run `install_server.bat`

**Linux/OSX:** Open Terminal and enter these commands:

```
chmod +x install_server.sh
./install_server.sh
```

If you have any issues running the install script, try:

```
dos2unix install_server.sh
```

#### URL sharing

To deploy this AWS Cloud Development Kit (CDK) stack, you'll need some additional toolsthe following permissions/configurations in your AWS account:

1. **Base AWS Identity and Access Management (IAM) Permissions**:
   
   - Amazon CloudFormation full access (`cloudformation:*`)
   - AWS IAM role creation permissions (`iam:CreateRole`, `iam:PutRolePolicy`, etc.)
   - AWS Lambda management permissions (`lambda:*`)
   - Amazon API Gateway management permissions (`apigateway:*`)
   - Amazon GameLift Streams permissions (`gameliftstreams:*`)
   - Amazon CloudWatch Logs permissions (for AWS Lambda logging)

2. **AWS CDK Bootstrap**: Your account/region needs to be bootstrapped for AWS CDK.
   Please see information about AWS CDK Bootstrap here: https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html

3. **AWS CLI Configuration**: Ensure your AWS CLI is configured with appropriate credentials. 
   Please see information on how the AWS CLI is configured here: https://docs.aws.amazon.com/cli/v1/userguide/cli-chap-configure.html

4. **Deployment Environment Variables**: When deploying the AWS CDK stack, you can use the standard `CDK_DEFAULT_REGION` environment variable to specify the AWS region to use. This is considered a better practice than hardcoding the region in the code, as it makes the deployment more flexible and reusable. 
   For example:
   **Windows**:
   
       set CDK_DEFAULT_REGION=us-west-2 deploy_cdk.bat
   
   **Linux/OSX**:
   
       export CDK_DEFAULT_REGION=us-west-2 ./deploy_cdk.sh

**Deploy and Install:**

1. On the Amazon GameLift Streams console Dashboard, select Stream groups.

2. Select the stream group you wish to stream from and locate its 'Stream group ID'. You will need it to run the deployment script. Make sure the application(s) you wish to stream are associated with it.

3. Deploy the AWS CDK stack.

**Windows:** Open Terminal and use command:

Example:

```
deploy_cdk.bat sg-000000000
# use your stream group ID in place of 'sg-000000000'
```

**Linux/OSX:** Open Terminal and use commands:

```
chmod +x deploy_cdk.sh
./deploy_cdk.sh sg-000000000
```

If you have any issues running the script, try:

```
dos2unix deploy_cdk.sh
```

4. After deployment is complete, your shareable stream URL will be output in this format: 
   
   https://[API-ID].execute-api.[REGION].amazonaws.com/prod/?userId={Player Name}&applicationId={Your-Application ID}&location={Your AWS Region}

## What's Included

- **Automated Setup Scripts** - Check and install required dependencies:
  
  - Node.js
  - AWS CLI
  - AWS CDK
  - AWS credentials configuration (for CDK deployment)

- **Real-time Client Side WebRTC Metrics**
  
  - WebRTC performance monitoring
  
  - Movable metric widgets
  
  - Full-screen compatibility
  
  - CSV export capability
    
    More about WebRTC Metrics here: https://www.w3.org/TR/webrtc-stats

- **Mobile Support**
  
  - Automatic mobile device detection
  - Customizable virtual controller
  - Touch controls
  - Orientation settings

## Cost Information

Typical use should be within AWS CloudFormation free tier, see:
[Provision Infrastructure As Code – AWS CloudFormation Pricing – Amazon Web Services](https://aws.amazon.com/cloudformation/pricing/)

## Dependencies

**AWS SDK Related:**

- @aws-sdk/client-bedrock-runtime
- @aws-sdk/client-cloudwatch
- aws-sdk

**Third-party Packages:**

- chart.js
- cors
- express
- node-fetch
- serverless-http 

### Uninstall CDK Stack

1. **Delete the CloudFormation Stacks**:
   
   - Login to the AWS Management Console.
   - Navigate to the AWS CloudFormation service.
   - In the AWS CloudFormation dashboard, locate the stack named `gameliftstreams-share-url-cdk` and select it.
   - Click the "Delete" button to delete this stack.
   - Next, locate the stack named `CDKToolkit` and repeat the process to delete this stack.
   - It's important to delete the stacks in this order, as the `CDKToolkit` stack may have dependencies on the `gameliftstreams-share-url-cdk` stack.

2. **Delete the Amazon S3 Bucket**:
   
   - In the AWS Management Console, navigate to the Amazon S3 service.
   - Locate the Amazon S3 bucket that was created.
   - First, empty the contents of the bucket. You can do this by either:
     - Manually deleting all objects in the bucket.
     - Using the "Empty" button in the Amazon S3 console to empty the bucket.
   - Once the bucket is empty, you can then delete the bucket itself.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. Please See the LICENSE file.
