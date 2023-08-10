const assert = require('assert');
const health_checks = require('../health_checks');
const m_alAws = require('../al_aws');
const colMock = require('./collector_mock');
const sinon = require('sinon');

describe('health_check test',function(){
    describe('extractHttpErrorCode()',function(){
        it('check function set the response.status as httpErrorCode',function(){
            const logmsgErr = {"errorType":"StatusCodeError","errorMessage":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","name":"StatusCodeError","message":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","error":"{\"error\":\"body encoding invalid\"}","response":{"status": 400 },"options":{"method":"POST","url":"https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs"}};
            const httpCode=  health_checks.extractHttpErrorCode(logmsgErr);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from string message and set as httpErrorCode',function(){
            const error = "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}";
            const httpCode=  health_checks.extractHttpErrorCode(error);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from message by split the message',function(){
            const error = "AWSC0018 failed at logmsgs : 404 - \"{\\\"error\\\":\\\"Customer Not Active in AIMS\\\"}";
            const httpCode=  health_checks.extractHttpErrorCode(error);
            assert.equal(httpCode, 404);
        });
    });

    describe('formatError()',function(){
        it('check function set the response.status as httpErrorCode',function(){
            const error = {"errorType":"StatusCodeError","errorMessage":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","name":"StatusCodeError","message":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","error":"{\"error\":\"body encoding invalid\"}","response":{"status": 400 },"options":{"method":"POST","url":"https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs"}};
            const formatedError =  health_checks.formatError('AWSC0018',error,'logmsgs');
            assert.equal(formatedError.httpErrorCode, 400);
            assert.equal(formatedError.errorCode, 'AWSC0018');
            assert.notEqual(formatedError.message, null);
        });
    });

    describe('handleIngestEncodingInvalidError()', function () {
        it('If it ingest body encoding error then it upload the file', function () {
            const error = { "errorType": "StatusCodeError", "errorMessage": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "name": "StatusCodeError", "message": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "error": "{\"error\":\"body encoding invalid\"}", "response":{"status": 400 },"options": { "method": "POST", "url": "https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs" } };
            const formatedError = health_checks.formatError('AWSC0018', error, 'logmsgs');
            let params = {
                data: colMock.S3_TEST_DATA,
                key: colMock.S3_CONFIGURATION_FILE_NAME,
                bucketName: colMock.S3_CONFIGURATION_BUCKET
            };
            const mockuploadS3Object = sinon.stub(m_alAws, 'uploadS3Object').callsFake(
                function fakeFn(param, callback) {
                    return callback(null);
                });

            health_checks.handleIngestEncodingInvalidError(formatedError, params, (err) => {
                sinon.assert.calledOnce(mockuploadS3Object);
                mockuploadS3Object.restore();
            });
        });

        it('retrun error as it, if it is not ingest body encoding error', function () {
            const error = "AWSC0018 failed at logmsgs : 404 - \"{\\\"error\\\":\\\"Customer Not Active in AIMS\\\"}";
            const formatedError = health_checks.formatError('AWSC0018', error, 'logmsgs');
            let params = {
                data: colMock.S3_TEST_DATA,
                key: colMock.S3_CONFIGURATION_FILE_NAME,
                bucketName: colMock.S3_CONFIGURATION_BUCKET
            };

            health_checks.handleIngestEncodingInvalidError(formatedError, params, (err) => {
                assert.notEqual(err,null);
            });
        });
    });
});