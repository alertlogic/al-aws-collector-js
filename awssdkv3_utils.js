const { S3Client,PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient,UpdateFunctionCodeCommand, GetFunctionConfigurationCommand, UpdateFunctionConfigurationCommand  } = require('@aws-sdk/client-lambda');
const { CloudWatchClient,GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const { KMSClient,DecryptCommand } = require('@aws-sdk/client-kms');

const s3Client = new S3Client({}); 
const lambdaClient = new LambdaClient({}); 
const cloudWatchClient = new CloudWatchClient({apiVersion: '2010-08-01'}); 
const cloudFormationClient = new CloudFormationClient({retryMode:'ADAPTIVE'}); 
const kmsClient = new KMSClient({}); 


const getMetricStatistics = async function (params, callback) {
  const command = new GetMetricStatisticsCommand(params);
  try {
      const data = await cloudWatchClient.send(command);
      return callback(null, {
          Label: data.Label,
          Datapoints: data.Datapoints
      });
  } catch (err) {
      return callback(null, {
          Label: params.MetricName,
          StatisticsError: JSON.stringify(err).slice(0, MAX_ERROR_MSG_LEN)
      });
  }
};

module.exports = {
  s3Client,
  lambdaClient,
  cloudWatchClient,
  cloudFormationClient,
  kmsClient,
  DescribeStacksCommand,
  DecryptCommand,
  PutObjectCommand,
  UpdateFunctionCodeCommand,
  GetObjectCommand,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
  getMetricStatistics
};
