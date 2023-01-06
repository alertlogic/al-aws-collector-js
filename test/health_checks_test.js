const assert = require('assert');
const m_alAws = require('../health_checks');

describe('health_check test',function(){
    describe('extractHttpErrorCode()',function(){
        it('check function set the statusCode as httpErrorCode',function(){
            const logmsgErr = {"errorType":"StatusCodeError","errorMessage":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","name":"StatusCodeError","statusCode":400,"message":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","error":"{\"error\":\"body encoding invalid\"}","options":{"method":"POST","url":"https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs"}};
            const httpCode=  m_alAws.extractHttpErrorCode(logmsgErr);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from string message and set as httpErrorCode',function(){
            const error = "400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}";
            const httpCode=  m_alAws.extractHttpErrorCode(error);
            assert.equal(httpCode, 400);
        });

        it('check function extract error code from message by split the message',function(){
            const error = "AWSC0018 failed at logmsgs : 404 - \"{\\\"error\\\":\\\"Customer Not Active in AIMS\\\"}";
            const httpCode=  m_alAws.extractHttpErrorCode(error);
            assert.equal(httpCode, 404);
        });
    });

    describe('formatError()',function(){
        it('check function set the statusCode as httpErrorCode',function(){
            const error = {"errorType":"StatusCodeError","errorMessage":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","name":"StatusCodeError","statusCode":400,"message":"400 - \"{\\\"error\\\":\\\"body encoding invalid\\\"}\"","error":"{\"error\":\"body encoding invalid\"}","options":{"method":"POST","url":"https://api.global-services.us-west-2.global.alertlogic.com/ingest/v1/48649/data/logmsgs"}};
            const formatedError =  m_alAws.formatError('AWSC0018',error,'logmsgs');
            assert.equal(formatedError.httpErrorCode, 400);
            assert.equal(formatedError.errorCode, 'AWSC0018');
            assert.notEqual(formatedError.message, null);
        });
    });
});