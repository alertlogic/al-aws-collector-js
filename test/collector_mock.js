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

const CHECKIN_TEST_FUNCTION_NAME = 'test-CollectLambdaFunction-1JNNKQIPOTEST';
const CHECKIN_TEST_URL = '/aws/cwe/checkin/353333894008/us-east-1/' + encodeURIComponent(CHECKIN_TEST_FUNCTION_NAME);
const FUNCTION_ARN = 'arn:aws:lambda:us-east-1:352283894008:function:test-guardduty-01-CollectLambdaFunction-2CWNLPPW5XO8';
const STACK_NAME = 'test';
const STACK_ID = 'arn:aws:cloudformation:us-east-1:353333894008:stack/test/87b3dc90-bd7e-11e7-9e43-503abe701cfd';
const S3_BUCKET = 'rcs-test-us-east-1';
const ACCESS_KEY_ID = '854gdsn8gstgd34bg';
const CWE_RULE_NAME = 'test-CloudWatchEventsRule-EHIZIHJYHTOD';
const CWE_RULE_ARN = 'arn:aws:events:us-east-1:352283894008:rule/test-CloudWatchEventsRule-EHIZIHJYHTOD';
const KINESIS_ARN = 'arn:aws:kinesis:us-east-1:353333894008:stream/test-KinesisStream-11Z7IDV7G2XDV';