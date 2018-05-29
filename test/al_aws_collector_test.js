const assert = require('assert');
const rewire = require('rewire');
const sinon = require('sinon');
const m_response = require('cfn-response');

const AlAwsCollector = require('../al_aws_collector');
var m_servicec = require('al-collector-js/al_servicec');
var AWS = require('aws-sdk-mock');
const colMock = require('./collector_mock');

const context = {
    invokedFunctionArn : colMock.FUNCTION_ARN
};

var alserviceStub = {};
var responseStub = {};

function setAlServiceStub() {
    alserviceStub.get = sinon.stub(m_servicec.AlServiceC.prototype, 'get').callsFake(
        function fakeFn(path, extraOptions) {
            return new Promise(function(resolve, reject) {
                var ret = null;
                switch (path) {
                    case '/residency/default/services/ingest/endpoint':
                        ret = {
                            ingest : 'new-ingest-endpoint'
                    };
                        break;
                case '/residency/default/services/azcollect/endpoint':
                    ret = {
                        azcollect : 'new-azcollect-endpoint'
                    };
                    break;
                default:
                    break;
                }
                return resolve(ret);
            });
        });
    alserviceStub.post = sinon.stub(m_servicec.AlServiceC.prototype, 'post').callsFake(
            function fakeFn(path, extraOptions) {
                return new Promise(function(resolve, reject) {
                    return resolve();
                });
            });
    alserviceStub.del = sinon.stub(m_servicec.AlServiceC.prototype, 'deleteRequest').callsFake(
            function fakeFn(path) {
                return new Promise(function(resolve, reject) {
                    return resolve();
                });
            });
}

function restoreAlServiceStub() {
    alserviceStub.get.restore();
    alserviceStub.post.restore();
    alserviceStub.del.restore();
}

function mockLambdaUpdateFunctionCode() {
    AWS.mock('Lambda', 'updateFunctionCode', function (params, callback) {
        assert.equal(params.FunctionName, colMock.FUNCTION_NAME);
        assert.equal(params.S3Bucket, colMock.S3_BUCKET);
        assert.equal(params.S3Key, colMock.S3_ZIPFILE);
        return callback(null, params);
    });
}

function mockLambdaUpdateConfiguration() {
    AWS.mock('Lambda', 'updateFunctionConfiguration', function (params, callback) {
        assert.equal(params.FunctionName, colMock.FUNCTION_NAME);
        assert.deepEqual(params.Environment, {
            Variables: {
                ingest_api: 'new-ingest-endpoint',
                azollect_api: 'new-azcollect-endpoint'
            }
        });
        return callback(null, params);
    });
}

var formatFun = function (event, context, callback) {
    return callback(null);
};

describe('al_aws_collector tests', function(done) {

    beforeEach(function(){
        AWS.mock('KMS', 'decrypt', function (params, callback) {
            const data = {
                    Plaintext : 'decrypted-aims-sercret-key'
            };
            return callback(null, data);
        });

        responseStub = sinon.stub(m_response, 'send').callsFake(
            function fakeFn(event, context, responseStatus, responseData, physicalResourceId) {
                context.succeed();
            });

        setAlServiceStub();
    });

    afterEach(function(){
        restoreAlServiceStub();
        responseStub.restore();
    });

    it('register success', function(done) {
        var context = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function() {});
            collector.register(colMock.REGISTRATION_TEST_EVENT, context, colMock.REG_PARAMS);
        });
    });
    
    it('checkin success', function(done) {
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds);
            collector.checkin(colMock.CHECKIN_PARAMS, function(error) {
                assert.equal(error, undefined);
                sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                done();
            });
        });
    });
    
    it('deregister success', function(done) {
        var context = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.deregister(colMock.DEREGISTRATION_TEST_EVENT, context, colMock.DEREG_PARAMS);
        });
    });

    it('self update success', function(done) {
        mockLambdaUpdateFunctionCode();
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.selfUpdate(function(error) {
                assert.equal(error, undefined);
                done();
            });
        });
    });

    it('updateEndpoints success', function(done) {
        mockLambdaUpdateConfiguration();
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.updateEndpoints(function(error) {
                assert.equal(error, undefined);
                done();
            });
        });
    });
    
    it('send secmsgs success', function(done) {
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.send('some-data', function(error) {
                done();
            });
        });
    });
    
    it('process success', function(done) {
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                collector.process('some-data', {}, function(error) {
                done();
            });
        });
    });
});
