process.env.AWS_REGION = 'us-east-1';
process.env.al_api = 'api.global-services.global.alertlogic.com';
process.env.ingest_api = 'ingest.global-services.global.alertlogic.com';
process.env.azollect_api = 'azcollect.global-services.global.alertlogic.com';
process.env.aims_access_key_id = 'aims-key-id';
process.env.aims_secret_key = 'aims-secret-key-encrypted';

const AIMS_TEST_CREDS = {
    access_key_id: 'test-access-key-id',
    secret_key: 'test-secret-key'
};

const CHECKIN_TEST_FUNCTION_NAME = 'test-CollectLambdaFunction';
const CHECKIN_TEST_URL = '/aws/cwe/checkin/123456789012/us-east-1/' + encodeURIComponent(CHECKIN_TEST_FUNCTION_NAME);
const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:123456789012:function:test-';
const STACK_NAME = 'test';
const STACK_ID = 'arn:aws:cloudformation:us-east-1:123456789012:stack/test/12345c90-bd7e-11e7-9e43-503abe701cfd';
const S3_BUCKET = 'rcs-test-us-east-1';
const ACCESS_KEY_ID = 'key-id';
const CWE_RULE_NAME = 'test-CloudWatchEventsRule-EHIZIHJYHTOD';
const CWE_RULE_ARN = 'arn:aws:events:us-east-1:123456789012:rule/test-CloudWatchEventsRule';
const KINESIS_ARN = 'arn:aws:kinesis:us-east-1:123456789012:stream/test-KinesisStream';
