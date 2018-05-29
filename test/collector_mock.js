const FUNCTION_NAME = 'test-VpcFlowCollectLambdaFunction';
const S3_BUCKET = 'rcs-test-us-east-1';
const S3_ZIPFILE = 'collector.zip';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_LAMBDA_FUNCTION_NAME = FUNCTION_NAME;
process.env.al_api = 'api.global-services.global.alertlogic.com';
process.env.ingest_api = 'ingest.global-services.global.alertlogic.com';
process.env.azollect_api = 'azcollect.global-services.global.alertlogic.com';
process.env.aims_access_key_id = 'aims-key-id';
process.env.aims_secret_key = 'aims-secret-key-encrypted';
process.env.aws_lambda_s3_bucket = S3_BUCKET;
process.env.aws_lambda_zipfile_name = S3_ZIPFILE;


const AIMS_TEST_CREDS = {
    access_key_id: 'test-access-key-id',
    secret_key: 'test-secret-key'
};

const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:' + encodeURIComponent(FUNCTION_NAME);
const STACK_NAME = 'test-stack-01';
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
const CHECKIN_PARAMS = {
    'status':'ok',
    'details':[],
    'statistics': [
        {
            'Label':'Invocations',
            'Datapoints':[
                {'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}
            ]
        }
    ]
};
const CHECKIN_AZCOLLECT_QUERY = {
    body: {
        version: '1.0.0',
        status: 'ok',
        error_code: undefined,
        details: [],
        statistics: [
            {
                'Label':'Invocations',
                'Datapoints':[
                    {'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}
                ]
            }
        ]
    }
};

module.exports = {
    FUNCTION_ARN : FUNCTION_ARN,
    FUNCTION_NAME : FUNCTION_NAME,
    S3_BUCKET : S3_BUCKET,
    S3_ZIPFILE : S3_ZIPFILE,

    REGISTRATION_TEST_EVENT : REGISTRATION_TEST_EVENT,
    REG_URL : REG_URL,
    REG_PARAMS : REG_PARAMS,
    REG_AZCOLLECT_QUERY : REG_AZCOLLECT_QUERY,

    DEREGISTRATION_TEST_EVENT : DEREGISTRATION_TEST_EVENT,
    DEREG_URL : DEREG_URL,
    DEREG_PARAMS : DEREG_PARAMS,

    CHECKIN_URL : CHECKIN_URL,
    CHECKIN_PARAMS : CHECKIN_PARAMS,
    CHECKIN_AZCOLLECT_QUERY : CHECKIN_AZCOLLECT_QUERY
};