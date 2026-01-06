const FUNCTION_NAME = 'test-VpcFlowCollectLambdaFunction';
const S3_BUCKET = 'rcs-test-us-east-1';
const S3_ZIPFILE = 'collector.zip';
const S3_CONFIGURATION_BUCKET = S3_BUCKET;
const S3_CONFIGURATION_FILE_NAME = 'configs/lambda/al-cwl-collector.json';
const STACK_NAME = 'test-stack-01';
const AL_API = 'api.global-services.global.alertlogic.com';
const INGEST_API = 'ingest.global-services.global.alertlogic.com';
const AZCOLLECT_API = 'azcollect.global-services.global.alertlogic.com';
const COLLECTOR_STATUS_API = 'collector-status-api.global.alertlogic.com';
const CTRL_SNS_ARN = 'arn:aws:sns:us-east-1:123456789012:AlCollectorControlSNS';

var initProcessEnv = function() {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_LAMBDA_FUNCTION_NAME = FUNCTION_NAME;
    process.env.al_api = AL_API;
    process.env.ingest_api = INGEST_API;
    process.env.azcollect_api = AZCOLLECT_API;
    process.env.aims_access_key_id = 'aims-key-id';
    process.env.aims_secret_key = 'aims-secret-key-encrypted';
    process.env.aws_lambda_s3_bucket = S3_BUCKET;
    process.env.stack_name = STACK_NAME;
    process.env.aws_lambda_zipfile_name = S3_ZIPFILE;
    process.env.aws_lambda_update_config_name = S3_CONFIGURATION_FILE_NAME;
    process.env.collector_id = 'collector-id';
    process.env.al_application_id = 'app-id';
    process.env.al_control_sns_arn = CTRL_SNS_ARN;
    process.env.collector_status_api = COLLECTOR_STATUS_API;
};


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
const GET_INGEST_URL = '/residency/default/serevices/ingest/endpoint';
const GET_AZCOLLECT_URL = '/residency/default/services/azcollect/endpoint';
const REG_PARAMS = {
    stackName : STACK_NAME,
    custom_fields: {
        data_type: 'vpcflow',
        something_else: 'testtest'
    }
};
const REG_AZCOLLECT_QUERY = {
    body: {
        awsAccountId: '123456789012',
        collectorId: 'collector-id',
        custom_fields: { data_type: 'vpcflow', something_else: 'testtest' },
        dataType: 'secmsgs',
        functionName: 'test-VpcFlowCollectLambdaFunction',
        region: 'us-east-1',
        stackName: STACK_NAME,
        version: '1.0.0',
        applicationId: 'app-id'
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
// const CHECKIN_TEST_EVENT = {
//     'RequestType': 'ScheduledEvent',
//     'Type': 'Checkin',
//     'AwsAccountId': '353333894008',
//     'StackName' : STACK_NAME,
//     'Region' : 'us-east-1'
// };


const CHECKIN_AZCOLLECT_QUERY = {
    body: {
        awsAccountId: '123456789012',
        collectorId: 'collector-id',
        applicationId: 'app-id',
        dataType: 'secmsgs',
        details: {},
        functionName: 'test-VpcFlowCollectLambdaFunction',
        region: 'us-east-1',
        stackName: 'test-stack-01',
        version: '1.0.0',
        status: 'ok',
        statistics:[
            {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]},
            {'Label':'Errors','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
        ]
    }
};

const CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR = {
    body: {
        awsAccountId: '123456789012',
        collectorId: 'collector-id',
        applicationId: 'app-id',
        dataType: 'secmsgs',
        functionName: 'test-VpcFlowCollectLambdaFunction',
        region: 'us-east-1',
        stackName: 'test-stack-01',
        version: '1.0.0',
        status: 'error',
        error_code: 'MYCODE',
        details: { error: { text: 'error message' } },
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
        awsAccountId: '123456789012',
        collectorId: 'collector-id',
        applicationId: 'app-id',
        dataType: 'secmsgs',
        functionName: 'test-VpcFlowCollectLambdaFunction',
        region: 'us-east-1',
        stackName: 'test-stack-01',
        version: '1.0.0',
        status: 'error',
        error_code: 'ALAWS00002',
        details: { error: { text: 'CF stack has wrong status: FAILED' } },
        statistics:[
            {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]},
            {'Label':'Errors','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
        ]
    }
};

const CHECKIN_ERROR_THROTTLING_AZCOLLECT_QUERY = {
    body: {
        awsAccountId: '123456789012',
        collectorId: 'collector-id',
        applicationId: 'app-id',
        dataType: 'secmsgs',
        functionName: 'test-VpcFlowCollectLambdaFunction',
        region: 'us-east-1',
        stackName: 'test-stack-01',
        version: '1.0.0',
        status: 'error',
        error_code: 'ALAWS00001',
        details: {"error":{"text":"{\"message\":\"Rate exceeded\",\"code\":\"Throttling\",\"time\":\"2022-06-13T10:12:35.817Z\",\"requestId\":\"b84e4d3f-8740-4e83-90ad-ce8da25438b3\",\"statusCode\":400,\"retryable\":true}"}},
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

const CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR = {
    "message": "Rate exceeded",
    "code": "Throttling",
    "time": "2022-06-13T10:12:35.817Z",
    "requestId": "b84e4d3f-8740-4e83-90ad-ce8da25438b3",
    "statusCode": 400,
    "retryable": true
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

const CLOUDWATCH_GET_METRIC_STATS_ERROR = {
    'Datapoints': [
        {
            'Timestamp': '2017-11-21T16:40:00Z', 
            'Sum': 0, 
            'Unit': 'Count'
        }
    ], 
    'Label': 'Errors'
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
        "value": "nodejs10.x"
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
            al_api: AL_API,
            aws_lambda_s3_bucket: S3_BUCKET,
            aws_lambda_zipfile_name: S3_ZIPFILE,
            azcollect_api: AZCOLLECT_API,
            ingest_api: INGEST_API
        } 
    },
    TracingConfig: { Mode: 'PassThrough' },
    RevisionId: '255d5791-94fb-4190-8626-846615597187'
};

const LAMBDA_FUNCTION_CONFIGURATION_CHANGED = {
    FunctionName: FUNCTION_NAME,
    FunctionArn: FUNCTION_ARN,
    Runtime: 'nodejs10.x',
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
            azcollect_api: AZCOLLECT_API,
            ingest_api: INGEST_API,
            x: 'XXXX'
        } 
    },
    TracingConfig: { Mode: 'PassThrough' },
    RevisionId: '255d5791-94fb-4190-8626-846615597187'
};

const LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE = {
        FunctionName: FUNCTION_NAME,
        FunctionArn: FUNCTION_ARN,
        Runtime: 'nodejs10.x',
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
                azcollect_api: AZCOLLECT_API,
                ingest_api: INGEST_API,
                x: 'XXXX'
            } 
        },
        TracingConfig: { Mode: 'PassThrough' },
        RevisionId: '255d5791-94fb-4190-8626-846615597187',
        State: 'State',
        StateReason: 'StateReason',
        StateReasonCode: 'StateReasonCode',
        LastUpdateStatus: 'LastUpdateStatus',
        LastUpdateStatusReason: 'LastUpdateStatusReason',
        LastUpdateStatusReasonCode: 'LastUpdateStatusReasonCode'
    };

const CHECKIN_SNS_TRIGGER = {
    "Records": [
        {
            "EventSource": "aws:sns",
            "EventVersion": "1.0",
            "EventSubscriptionArn": "arn:aws:sns:us-east-1:123456789012:AlCollectorControlSNS:97f1e276-ee2f-442a-8621-8d83b19e8cd8",
            "Sns": {
                "Type": "Notification",
                "MessageId": "ae23d09e-f019-590a-bfd2-8a077f34bd42",
                "TopicArn": "arn:aws:sns:us-east-1:123456789012:AlCollectorControlSNS",
                "Subject": null,
                "Message": "{\"RequestType\": \"ScheduledEvent\", \"Type\": \"Checkin\", \"AwsAccountId\": \"123456789012\", \"Region\": \"us-east-1\", \"StackName\": \"AlPawsCollector-E4EEE2D2-321A-4DC9-852D-0995DD6016C7\"}",
                "Timestamp": "2022-03-02T15:27:41.813Z",
                "SignatureVersion": "1",
                "Signature": "LhbLDhhx5QIXJoEfzLpd6F7NTRX9BVP8gfqaP8ouMlMLaxdvsxLH1MD5F9oFGtA4oJgcMArcaiHp3bpDYnIiEPZJ3YdJRuuAECixwDwO/ROYVhiLRi0Xag++2oB9fDOhIErg1VfDxOA44eyGiMr15D8+ZLXogiMJjttcu5yn6UntahsL+F22uWfZz5Kplx3xf0eczU/qjX+vMF0d+ClVN2iwrVOFzWvTf4szjysI8BE5TU9kiqKXbwo+p5krIwpoyYhCKSGBH52Dkzo9qmFPk1Ug1je4FySQghnOLfRR+MIBrikUQr5SkeQ7kGtE1taHy7hInkLIsiy6oMeE8NOfrA==",
                "SigningCertUrl": "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
                "UnsubscribeUrl": "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-1:123456789012:AlCollectorControlSNS:97f1e276-ee2f-442a-8621-8d83b19e8cd8",
                "MessageAttributes": {}
            }
        }
    ]
};

const S3_TEST_DATA = { "actor": { "id": "00u912a1q9R7n6IsA1t7", "type": "User", "displayName": "Test user", "detailEntry": null }, "client": { "userAgent": { "rawUserAgent": "@okta/okta-sdk-nodejs/4.1.0 node/14.20.0 linux/4.14.255-296-236.539.amzn2.aarch64", "os": "Linux", "browser": "UNKNOWN" }, "zone": "null", "device": "Computer", "id": null, "ipAddress": "100.24.126.148", "geographicalContext": null }, "legacyEventType": "core.framework.ratelimit.warning", "uuid": "d0b4a036-87a7-11ed-a582-0f7bbc99b2fd", "version": "0", "target": [{ "id": "/api/v1/logs", "type": "URL Pattern" }, { "id": "efc4e90e-6b87-3d2c-827e-815acbd1cfe1", "type": "Bucket Uuid" }] };

module.exports = {
    initProcessEnv : initProcessEnv,
    FUNCTION_ARN : FUNCTION_ARN,
    FUNCTION_NAME : FUNCTION_NAME,
    S3_BUCKET : S3_BUCKET,
    S3_ZIPFILE : S3_ZIPFILE,
    STACK_NAME : STACK_NAME,
    AIMS_TEST_CREDS: AIMS_TEST_CREDS,
    REGISTRATION_TEST_EVENT : REGISTRATION_TEST_EVENT,
    REG_URL : REG_URL,
    GET_AZCOLLECT_URL: GET_AZCOLLECT_URL,
    GET_INGEST_URL: GET_INGEST_URL,
    REG_PARAMS : REG_PARAMS,
    REG_AZCOLLECT_QUERY : REG_AZCOLLECT_QUERY,
    DEREGISTRATION_TEST_EVENT : DEREGISTRATION_TEST_EVENT,
    DEREG_URL : DEREG_URL,
    DEREG_PARAMS : DEREG_PARAMS,
    CHECKIN_URL : CHECKIN_URL,
    CHECKIN_AZCOLLECT_QUERY : CHECKIN_AZCOLLECT_QUERY,
    CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR : CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR,
    CHECKIN_ERROR_AZCOLLECT_QUERY : CHECKIN_ERROR_AZCOLLECT_QUERY,
    CHECKIN_ERROR_THROTTLING_AZCOLLECT_QUERY : CHECKIN_ERROR_THROTTLING_AZCOLLECT_QUERY,
    CHECKIN_SNS_TRIGGER : CHECKIN_SNS_TRIGGER,
    CF_DESCRIBE_STACKS_RESPONSE : CF_DESCRIBE_STACKS_RESPONSE,
    CF_DESCRIBE_STACKS_FAILED_RESPONSE: CF_DESCRIBE_STACKS_FAILED_RESPONSE,
    CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR: CF_DESCRIBE_STACKS_FAILED_THROTTLING_ERROR,
    CLOUDWATCH_GET_METRIC_STATS_OK : CLOUDWATCH_GET_METRIC_STATS_OK,
    CLOUDWATCH_GET_METRIC_STATS_ERROR : CLOUDWATCH_GET_METRIC_STATS_ERROR,
    S3_CONFIGURATION_BUCKET: S3_CONFIGURATION_BUCKET,
    S3_CONFIGURATION_FILE_NAME : S3_CONFIGURATION_FILE_NAME,
    S3_CONFIGURATION_FILE_NOCHANGE : S3_CONFIGURATION_FILE_NOCHANGE,
    S3_CONFIGURATION_FILE_CHANGE : S3_CONFIGURATION_FILE_CHANGE,
    LAMBDA_FUNCTION_CONFIGURATION : LAMBDA_FUNCTION_CONFIGURATION,
    LAMBDA_FUNCTION_CONFIGURATION_CHANGED : LAMBDA_FUNCTION_CONFIGURATION_CHANGED,
    LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE : LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE,
    S3_TEST_DATA: S3_TEST_DATA
};
