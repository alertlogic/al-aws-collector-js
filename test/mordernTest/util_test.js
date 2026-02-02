const assert = require('assert');
const alUtil = require('../../modern/util');

describe('util test', function () {
    describe('extractHttpErrorCode()', function () {
        it('check function set the response.status as httpErrorCode', function () {
            const logmsgErr = { "errorType": "StatusCodeError", "errorMessage": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "name": "StatusCodeError", "message": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "error": "{\"error\":\"body encoding invalid\"}", "response": { "status": 400 }, "options": { "method": "POST", "url": "https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs" } };
            const httpCode = alUtil.extractHttpErrorCode(logmsgErr);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from string message and set as httpErrorCode', function () {
            const error = "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}";
            const httpCode = alUtil.extractHttpErrorCode(error);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from message by split the message', function () {
            const error = "AWSC0018 failed at logmsgs : 404 - \"{\\\"error\\\":\\\"Customer Not Active in AIMS\\\"}";
            const httpCode = alUtil.extractHttpErrorCode(error);
            assert.equal(httpCode, 404);
        });
    });
    
    describe('formatError()', function () {
        it('check function set the response.status as httpErrorCode', function () {
            const error = { "errorType": "StatusCodeError", "errorMessage": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "name": "StatusCodeError", "message": "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"", "error": "{\"error\":\"body encoding invalid\"}", "response": { "status": 400 }, "options": { "method": "POST", "url": "https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs" } };
            const formatedError = alUtil.formatError('AWSC0018', error, 'logmsgs');
            assert.equal(formatedError.httpErrorCode, 400);
            assert.equal(formatedError.errorCode, 'AWSC0018');
            assert.notEqual(formatedError.message, null);
        });
    });

    describe('errorMsg()', function () {
        it('should return error message object with given code and message', function () {
            const code = 'TEST001';
            const message = 'This is a test error message';
            const expectedErrorMsg = {
                status: 'error',
                code: code,
                details: message
            };
            const result = alUtil.errorMsg(code, message);
            assert.deepStrictEqual(result, expectedErrorMsg);
        });
    });      
});