const assert = require('assert');
const sinon = require('sinon');
const alAwsCommon = require('../../modern/al_aws_common');
const colMock = require('../collector_mock');
const al_stub = require('../al_stub');
const { Lambda } = require('@aws-sdk/client-lambda'),
    { S3 } = require('@aws-sdk/client-s3');

describe('al_aws_common tests', function () {
    describe('customBackoff()', function () {
        it('should return a random backoff time for throttling errors', function () {
            const retryCount = 1;
            const err = { code: 'ThrottlingException' };
            const backoffTime = alAwsCommon.customBackoff(retryCount, err);
            // With retryCount=1: random(100-3000) + (2^1 * 100) = random(100-3000) + 200 = 300-3200
            const expectedMin = 100 + (Math.pow(2, retryCount) * 100);
            const expectedMax = 3000 + (Math.pow(2, retryCount) * 100);
            assert(backoffTime >= expectedMin && backoffTime <= expectedMax,
                `Expected backoff time to be between ${expectedMin} and ${expectedMax}, but got ${backoffTime}`);
        });

        it('should return 0 for non-throttling errors', function () {
            const retryCount = 1;
            const err = { code: 'SomeOtherError' };
            const backoffTime = alAwsCommon.customBackoff(retryCount, err);
            assert.strictEqual(backoffTime, 0);
        });
    });
    describe('arnToName()', function () {
        it('should extract the resource name from a valid ARN', function () {
            const arn = 'arn:aws:lambda:us-west-2:123456789012:function:my-function';
            const name = alAwsCommon.arnToName(arn);
            assert.strictEqual(name, 'my-function');
        });

        it('should return undefined for an invalid ARN', function () {
            const arn = 'invalid-arn';
            const name = alAwsCommon.arnToName(arn);
            assert.strictEqual(name, undefined);
        });
    });
    describe('arnToAccId()', function () {
        it('should extract the account ID from a valid ARN', function () {
            const arn = 'arn:aws:lambda:us-west-2:123456789012:function:my-function';
            const accId = alAwsCommon.arnToAccId(arn);
            assert.strictEqual(accId, '123456789012');
        });

        it('should return undefined for an invalid ARN', function () {
            const arn = 'invalid-arn';
            const accId = alAwsCommon.arnToAccId(arn);
            assert.strictEqual(accId, undefined);
        });
    });
    describe('retryAsync()', function () {
        it('should retry the async function on throttling errors', async function () {
            const asyncFunc = sinon.stub().onFirstCall().rejects({ code: 'ThrottlingException' }).onSecondCall().resolves('success');
            const options = {
                times: 2,
                interval: () => 0
            };
            const result = await alAwsCommon.retryAsync(asyncFunc, options);
            assert.strictEqual(result, 'success');
            assert(asyncFunc.calledTwice);
        });
    });

    describe('getLambdaConfigAsync()', function () {
        beforeEach(function () {
            // Set up any necessary environment variables or stubs here
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(Lambda, 'getFunctionConfiguration');
        })
        it('should retrieve Lambda config', async function () {
            al_stub.mock(Lambda, 'getFunctionConfiguration', function () {
                return Promise.resolve({
                    FunctionName: process.env.aws_lambda_function_name
                });
            });
            const config = await alAwsCommon.getLambdaConfigAsync();
            assert(config);
        });
        it('should throw error for invalid function name', async function () {
            // Temporarily change env variable to invalid function name
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'invalid-function-name';
            al_stub.mock(Lambda, 'getFunctionConfiguration', function (params) {
                if (params.FunctionName === 'invalid-function-name') {
                    const error = new Error('Invalid function name');
                    error.code = 'ResourceNotFoundException';
                    return Promise.reject(error);
                }
                return Promise.resolve({ FunctionName: params.FunctionName });
            });

            await assert.rejects(alAwsCommon.getLambdaConfigAsync(), err => err.code === 'ResourceNotFoundException');
        });
    });

    describe('getS3ConfigChangesAsync()', function () {
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(S3, 'getObject');
        })

        it('should retrieve S3 config changes', async function () {
            const jsonCfg = JSON.stringify({ key: 'value' });
            al_stub.mock(S3, 'getObject', (params) => {
                return Promise.resolve({
                    Body: {
                        transformToString: async () => jsonCfg
                    }
                });
            });
            const config = await alAwsCommon.getS3ConfigChangesAsync();
            assert(config);
        });
        it('should throw error for invalid bucket', async function () {
            al_stub.mock(S3, 'getObject', () => {
                const error = new Error('NoSuchBucket');
                error.code = 'NoSuchBucket';
                return Promise.reject(error);
            });
            await assert.rejects(alAwsCommon.getS3ConfigChangesAsync(), err => err.code === 'NoSuchBucket');
        });
    });

    describe('updateLambdaConfigAsync()', function () {
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(Lambda, 'updateFunctionConfiguration');
        })

        it('should update Lambda config', async function () {
            al_stub.mock(Lambda, 'updateFunctionConfiguration', (params) => {
                return Promise.resolve({
                    FunctionName: params.FunctionName,
                    MemorySize: params.MemorySize,
                    Timeout: params.Timeout
                });
            })
            al_stub.mock(Lambda, 'getFunctionConfiguration', function () {
                return Promise.resolve({
                    FunctionName: process.env.aws_lambda_function_name,
                    MemorySize: 128,
                    Timeout: 30
                });
            });
            const config = await alAwsCommon.getLambdaConfigAsync();
            const updatedConfig = await alAwsCommon.updateLambdaConfigAsync(config);
            assert(updatedConfig);
        });
        it('should throw error for invalid config', async function () {
            al_stub.mock(Lambda, 'updateFunctionConfiguration', (params) => {
                return Promise.reject(new Error('InvalidConfiguration'));
            })

            await assert.rejects(alAwsCommon.updateLambdaConfigAsync());
        });
    });
    describe('waitForFunctionUpdateAsync()', function () {
        beforeEach(function () {
            // Set up any necessary environment variables or stubs here
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(Lambda, 'getFunctionConfiguration');
        })
        it('should wait and retry if update is in progress', async function () {
            al_stub.restore(Lambda, 'getFunctionConfiguration');
            let callCount = 0;
            al_stub.mock(Lambda, 'getFunctionConfiguration', function () {
                callCount++;
                if (callCount < 3) {
                    return Promise.resolve({ LastUpdateStatus: 'InProgress' });
                }
                return Promise.resolve({ LastUpdateStatus: 'Successful' });
            });
            const result = await alAwsCommon.waitForFunctionUpdateAsync();

            assert.strictEqual(result.LastUpdateStatus, 'Successful');
            assert(callCount >= 3, 'Should retry at least twice');
        });
    });
    describe('uploadS3ObjectAsync()', function () {
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(S3, 'putObject');
        });
        it('should upload object to S3', async function () {
            al_stub.mock(S3, 'putObject', () => {
                return Promise.resolve({
                    ETag: '3a78d463e605c66b1b51725500b9dd72',
                    LastModified: '2017-11-21T16:40:00Z'
                });
            });
            let bucketParameters = {
                data: colMock.S3_TEST_DATA,
                key: colMock.S3_CONFIGURATION_FILE_NAME,
                bucket: colMock.S3_CONFIGURATION_BUCKET
            };
            const result = await alAwsCommon.uploadS3ObjectAsync(bucketParameters);
            assert(result);
        });
        it('should throw error for invalid bucket', async function () {
            al_stub.mock(S3, 'putObject', () => {
                const error = new Error('NoSuchBucket');
                error.code = 'NoSuchBucket';
                return Promise.reject(error);
            });
            const data = 'test data';
            const key = 'test/key';
            const bucket = 'invalid-bucket-name';
            await assert.rejects(alAwsCommon.uploadS3ObjectAsync({ data, key, bucket }));
        });
    });


    describe('selfUpdateAsync()', function () {
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        afterEach(() => {
            al_stub.restore(Lambda, 'updateFunctionCode');
        });
        it('should update the function code', async function () {
            al_stub.mock(Lambda, 'updateFunctionCode', (param) => {
                return Promise.resolve({
                    FunctionName: param.FunctionName,
                    LastUpdateStatus: 'Successful'
                });
            });
            const result = await alAwsCommon.selfUpdateAsync();
            assert(result);
        });
        it('should throw error for invalid function name', async function () {
            // Temporarily change env variable to invalid function name
            process.env.AWS_LAMBDA_FUNCTION_NAME = 'invalid-function-name';
            al_stub.mock(Lambda, 'updateFunctionCode', function (params) {
                if (params.FunctionName === 'invalid-function-name') {
                    const error = new Error('Invalid function name');
                    error.code = 'ResourceNotFoundException';
                    return Promise.reject(error);
                }
                return Promise.resolve({ FunctionName: params.FunctionName });
            });
            await assert.rejects(alAwsCommon.selfUpdateAsync());
        });
    });

    describe('handleIngestEncodingInvalidError()', function () {
        it('should upload the object to S3 if the error is due to invalid encoding', async function () {
            const err = { httpErrorCode: 400 };
            const s3UploadStub = al_stub.mock(S3, 'putObject',() => Promise.resolve({
                    ETag: '3a78d463e605c66b1b51725500b9dd72',
                    LastModified: '2017-11-21T16:40:00Z'
                }))
            const result = await alAwsCommon.handleIngestEncodingInvalidError(err, { data: 'test data', key: 'test/key', bucketName: 'test-bucket' });
            assert(result);
            assert(s3UploadStub.calledOnce);
            s3UploadStub.restore();
        });
    });

});
