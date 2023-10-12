const { S3Client,GetObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, UpdateFunctionConfigurationCommand, UpdateFunctionCodeCommand, GetFunctionConfigurationCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchClient,GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');
const { mockClient } = require("aws-sdk-client-mock");
const s3MockClient = mockClient(S3Client);
const lambdaMockClient = mockClient(LambdaClient);
const kmsMockClient = mockClient(KMSClient);
const cfnMockClient = mockClient(CloudFormationClient);
const cloudWatchMockClient = mockClient(CloudWatchClient);


module.exports = {
    s3MockClient,
    lambdaMockClient,
    kmsMockClient,
    cfnMockClient,
    cloudWatchMockClient,
    GetObjectCommand,
    DescribeStacksCommand,
    GetMetricStatisticsCommand,
    DecryptCommand,
    UpdateFunctionConfigurationCommand,
    UpdateFunctionCodeCommand,
    GetFunctionConfigurationCommand
  };
  