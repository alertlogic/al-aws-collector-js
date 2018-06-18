const FUNCTION_NAME = 'test-VpcFlowCollectLambdaFunction';
const S3_BUCKET = 'rcs-test-us-east-1';
const S3_ZIPFILE = 'collector.zip';
const S3_CONFIGURATION_BUCKET = S3_BUCKET;
const S3_CONFIGURATION_FILE_NAME = 'configs/lambda/al-cwl-collector.json';
const STACK_NAME = 'test-stack-01';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_LAMBDA_FUNCTION_NAME = FUNCTION_NAME;
process.env.al_api = 'api.global-services.global.alertlogic.com';
process.env.ingest_api = 'ingest.global-services.global.alertlogic.com';
process.env.azollect_api = 'azcollect.global-services.global.alertlogic.com';
process.env.aims_access_key_id = 'aims-key-id';
process.env.aims_secret_key = 'aims-secret-key-encrypted';
process.env.aws_lambda_s3_bucket = S3_BUCKET;
process.env.stack_name = STACK_NAME;
process.env.aws_lambda_zipfile_name = S3_ZIPFILE;
process.env.aws_lambda_update_config_name = S3_CONFIGURATION_FILE_NAME;


const AIMS_TEST_CREDS = {
    access_key_id: 'test-access-key-id',
    secret_key: 'test-secret-key'
};

const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:' + encodeURIComponent(FUNCTION_NAME);
const STACK_ID = 'arn:aws:cloudformation:us-east-1:123456789012:stack/test/12345c90-bd7e-11e7-9e43-503abe701cfd';



const REGISTRATION_TEST_EVENT = {
    'RequestType': 'Create',
    'ServiceToken': FUNCTION_ARN,
    'ResponseURL': 'https://cloudformation-custom-resource-response-useast1.s3.amazonaws.com/resp',
    'StackId': 'arn:aws:cloudformation:us-east-1:352283894008:stack/test-guardduty-01/92605900',
    'RequestId': '155fe44d-af80-4c42-bf30-6a78aa244aad',
    'LogicalResourceId': 'RegistrationResource',
    'ResourceType': 'Custom::RegistrationResource',
    'ResourceProperties':
    {
        'ServiceToken': FUNCTION_ARN,
        'StackName': STACK_NAME,
        'AwsAccountId': '123456789012'
    }
};

const DEREGISTRATION_TEST_EVENT = {
    'RequestType': 'Delete',
    'ServiceToken': FUNCTION_ARN,
    'ResponseURL': 'https://cloudformation-custom-resource-response-useast1.s3.amazonaws.com/resp',
    'StackId': 'arn:aws:cloudformation:us-east-1:352283894008:stack/test-guardduty-01/92605900',
    'RequestId': '155fe44d-af80-4c42-bf30-6a78aa244aad',
    'LogicalResourceId': 'RegistrationResource',
    'ResourceType': 'Custom::RegistrationResource',
    'ResourceProperties':
    {
        'ServiceToken': FUNCTION_ARN,
        'StackName': STACK_NAME,
        'AwsAccountId': '123456789012'
    }
};

const REG_URL = '/aws/cwe/123456789012/us-east-1/' + encodeURIComponent(FUNCTION_NAME);
const REG_PARAMS = {
    stackName : STACK_NAME,
    custom_fields: {
        data_type: 'vpcflow',
        something_else: 'testtest'
    }
};
const REG_AZCOLLECT_QUERY = {
    body: {
        cf_stack_name: STACK_NAME,
        version: '1.0.0',
        data_type: 'vpcflow',
        something_else: 'testtest'
    }
};

const DEREG_URL = REG_URL;
const DEREG_PARAMS = REG_PARAMS;

const CHECKIN_URL = '/aws/cwe/checkin/123456789012/us-east-1/' + encodeURIComponent(FUNCTION_NAME);
// const CHECKIN_PARAMS = {
//     'status':'ok',
//     'details':[],
//     'statistics': [
//         {
//             'Label':'Invocations',
//             'Datapoints':[
//                 {'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}
//             ]
//         }
//     ]
// };
const CHECKIN_TEST_EVENT = {
    'RequestType': 'ScheduledEvent',
    'Type': 'Checkin',
    'AwsAccountId': '353333894008',
    'StackName' : STACK_NAME,
    'Region' : 'us-east-1'
};


const CHECKIN_AZCOLLECT_QUERY = {
    body: {
        version: '1.0.0',
        status: 'ok',
        error_code: undefined,
        details: [],
        statistics:[
            {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]},
            {'Label':'Errors','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
        ]
    }
};

const CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR = {
    body: {
        version: '1.0.0',
        status: 'error',
        error_code: 'MYCODE',
        details: [ 'error message' ],
        statistics:[
            {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]},
            {'Label':'Errors','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
        ]
    }
};

const CF_DESCRIBE_STACKS_RESPONSE = {
    'ResponseMetadata': {
        'RequestId': 'f9f5e0e7-be24-11e7-9891-49fc9e4a2c65'
    },
    'Stacks': [
        {
            'StackId': STACK_ID,
            'StackName': STACK_NAME,
            'Description': 'Alert Logic template',
            'Parameters': [],
            'CreationTime': '2017-10-30T14:27:59.848Z',
            'RollbackConfiguration': {},
            'StackStatus': 'CREATE_COMPLETE',
            'DisableRollback': false,
            'NotificationARNs': [],
            'Capabilities': [
                'CAPABILITY_IAM'
            ],
            'Outputs': [],
            'Tags': [],
            'EnableTerminationProtection': false
        }
    ]
};

const CHECKIN_ERROR_AZCOLLECT_QUERY = {
    body: {
        version: '1.0.0',
        status: 'error',
        error_code: 'ALAWS00002',
        details: [ 'CF stack has wrong status: FAILED' ],
        statistics:[
            {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]},
            {'Label':'Errors','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
        ]
    }
};

const CF_DESCRIBE_STACKS_FAILED_RESPONSE = {
  'ResponseMetadata': {
    'RequestId': 'f9f5e0e7-be24-11e7-9891-49fc9e4a2c65'
  },
  'Stacks': [
    {
      'StackId': STACK_ID,
      'StackName': STACK_NAME,
      'Description': 'Alert Logic template',
      'Parameters': [
      ],
      'CreationTime': '2017-10-30T14:27:59.848Z',
      'RollbackConfiguration': {},
      'StackStatus': 'FAILED',
      'DisableRollback': false,
      'NotificationARNs': [],
      'Capabilities': [
        'CAPABILITY_IAM'
      ],
      'Outputs': [],
      'Tags': [],
      'EnableTerminationProtection': false
    }
  ]
};

const CLOUDWATCH_GET_METRIC_STATS_OK = {
    'Datapoints': [
        {
            'Timestamp': '2017-11-21T16:40:00Z', 
            'Sum': 1.0, 
            'Unit': 'Count'
        }
    ], 
    'Label': 'Invocations'
};

const S3_CONFIGURATION_FILE_NOCHANGE = {
    "Runtime": {
        "path": "Runtime",
        "value": "nodejs6.10"
    },
    "Timeout": {
        "path": "Timeout",
        "value": 3
    }
};

const S3_CONFIGURATION_FILE_CHANGE = {
    "Runtime": {
        "path": "Runtime",
        "value": "nodejs8.10"
    },
    "Timeout": {
        "path": "Timeout",
        "value": 5
    },
    "NewVariableX": {
        "path": "Environment.Variables.x",
        "value": "XXXX"
    },
    "ChangeVariableAlApi": {
        "path": "Environment.Variables.al_api",
        "value": "new al_api value"
    }
};

const LAMBDA_FUNCTION_CONFIGURATION = {
    FunctionName: FUNCTION_NAME,
    FunctionArn: FUNCTION_ARN,
    Runtime: 'nodejs6.10',
    Role: 'arn:aws:iam::352283894008:role/tdosoudil-vpc-lambda',
    Handler: 'index.handler',
    CodeSize: 834,
    Description: '',
    Timeout: 3,
    MemorySize: 128,
    LastModified: '2018-06-15T07:44:59.223+0000',
    CodeSha256: 'o/eUfWe7Vax8Etqx/CCLgwhuyVHKHlqeU5Ur2UnY7kU=',
    Version: '$LATEST',
    VpcConfig: { SubnetIds: [], SecurityGroupIds: [], VpcId: '' },
    Environment: { 
        Variables: { 
            aims_access_key_id: AIMS_TEST_CREDS.access_key_id,
            aims_secret_key: AIMS_TEST_CREDS.secret_key,
            al_api: process.env.al_api,
            aws_lambda_s3_bucket: S3_BUCKET,
            aws_lambda_zipfile_name: S3_ZIPFILE,
            azollect_api: process.env.azollect_api,
            ingest_api: process.env.ingest_api 
        } 
    },
    TracingConfig: { Mode: 'PassThrough' },
    RevisionId: '255d5791-94fb-4190-8626-846615597187' 
};

const LAMBDA_FUNCTION_CONFIGURATION_CHANGED = {
    FunctionName: FUNCTION_NAME,
    FunctionArn: FUNCTION_ARN,
    Runtime: 'nodejs8.10',
    Role: 'arn:aws:iam::352283894008:role/tdosoudil-vpc-lambda',
    Handler: 'index.handler',
    CodeSize: 834,
    Description: '',
    Timeout: 5,
    MemorySize: 128,
    LastModified: '2018-06-15T07:44:59.223+0000',
    CodeSha256: 'o/eUfWe7Vax8Etqx/CCLgwhuyVHKHlqeU5Ur2UnY7kU=',
    Version: '$LATEST',
    VpcConfig: { SubnetIds: [], SecurityGroupIds: [], VpcId: '' },
    Environment: { 
        Variables: { 
            aims_access_key_id: AIMS_TEST_CREDS.access_key_id,
            aims_secret_key: AIMS_TEST_CREDS.secret_key,
            al_api: 'new al_api value',
            aws_lambda_s3_bucket: S3_BUCKET,
            aws_lambda_zipfile_name: S3_ZIPFILE,
            azollect_api: process.env.azollect_api,
            ingest_api: process.env.ingest_api,
            x: 'XXXX'
        } 
    },
    TracingConfig: { Mode: 'PassThrough' },
    RevisionId: '255d5791-94fb-4190-8626-846615597187' 
};


module.exports = {
    FUNCTION_ARN : FUNCTION_ARN,
    FUNCTION_NAME : FUNCTION_NAME,
    S3_BUCKET : S3_BUCKET,
    S3_ZIPFILE : S3_ZIPFILE,
    STACK_NAME : STACK_NAME,

    REGISTRATION_TEST_EVENT : REGISTRATION_TEST_EVENT,
    REG_URL : REG_URL,
    REG_PARAMS : REG_PARAMS,
    REG_AZCOLLECT_QUERY : REG_AZCOLLECT_QUERY,

    DEREGISTRATION_TEST_EVENT : DEREGISTRATION_TEST_EVENT,
    DEREG_URL : DEREG_URL,
    DEREG_PARAMS : DEREG_PARAMS,

    CHECKIN_URL : CHECKIN_URL,
    CHECKIN_AZCOLLECT_QUERY : CHECKIN_AZCOLLECT_QUERY,
    CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR : CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR,
    CF_DESCRIBE_STACKS_RESPONSE : CF_DESCRIBE_STACKS_RESPONSE,
    CHECKIN_ERROR_AZCOLLECT_QUERY : CHECKIN_ERROR_AZCOLLECT_QUERY,
    CF_DESCRIBE_STACKS_FAILED_RESPONSE: CF_DESCRIBE_STACKS_FAILED_RESPONSE,
    CLOUDWATCH_GET_METRIC_STATS_OK : CLOUDWATCH_GET_METRIC_STATS_OK,
    
    S3_CONFIGURATION_BUCKET: S3_CONFIGURATION_BUCKET,
    S3_CONFIGURATION_FILE_NAME : S3_CONFIGURATION_FILE_NAME,
    S3_CONFIGURATION_FILE_NOCHANGE : S3_CONFIGURATION_FILE_NOCHANGE,
    S3_CONFIGURATION_FILE_CHANGE : S3_CONFIGURATION_FILE_CHANGE,
    LAMBDA_FUNCTION_CONFIGURATION : LAMBDA_FUNCTION_CONFIGURATION,
    LAMBDA_FUNCTION_CONFIGURATION_CHANGED : LAMBDA_FUNCTION_CONFIGURATION_CHANGED
};