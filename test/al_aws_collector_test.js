const assert = require('assert');
const rewire = require('rewire');
const sinon = require('sinon');
const m_response = require('cfn-response');
const deepEqual = require('deep-equal');

const AlAwsCollector = require('../al_aws_collector');
const m_al_aws = require('../al_aws');
var m_alCollector = require('@alertlogic/al-collector-js');
const m_healthChecks = require('../health_checks');
var AWS = require('aws-sdk-mock');
const colMock = require('./collector_mock');
const zlib = require('zlib');

const context = {
    invokedFunctionArn : colMock.FUNCTION_ARN
};

var alserviceStub = {};
var responseStub = {};
var setEnvStub = {};

function setAlServiceStub() {
    alserviceStub.get = sinon.stub(m_alCollector.AlServiceC.prototype, 'get').callsFake(
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
    alserviceStub.post = sinon.stub(m_alCollector.AlServiceC.prototype, 'post').callsFake(
            function fakeFn(path, extraOptions) {
                return new Promise(function(resolve, reject) {
                    return resolve();
                });
            });
    alserviceStub.del = sinon.stub(m_alCollector.AlServiceC.prototype, 'deleteRequest').callsFake(
            function fakeFn(path) {
                return new Promise(function(resolve, reject) {
                    return resolve();
                });
            });
}

function setAlServiceErrorStub() {
    alserviceStub.get = sinon.stub(m_alCollector.AlServiceC.prototype, 'get').callsFake(
        function fakeFn(path, extraOptions) {
            return new Promise(function(resolve, reject) {
                return reject('get error');
            });
        });
    alserviceStub.post = sinon.stub(m_alCollector.AlServiceC.prototype, 'post').callsFake(
            function fakeFn(path, extraOptions) {
                return new Promise(function(resolve, reject) {
                    return reject('post error');
                });
            });
    alserviceStub.del = sinon.stub(m_alCollector.AlServiceC.prototype, 'deleteRequest').callsFake(
            function fakeFn(path) {
                return new Promise(function(resolve, reject) {
                    return reject('delete error');
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

function mockS3GetObject(returnObject) {
    AWS.mock('S3', 'getObject', function (params, callback) {
        let buf = Buffer(JSON.stringify(returnObject));
        return callback(null, {Body: buf});
    });
}

function mockLambdaGetFunctionConfiguration(returnObject) {
    AWS.mock('Lambda', 'getFunctionConfiguration', function (params, callback) {
        return callback(null, returnObject);
    });
}

function mockLambdaEndpointsUpdateConfiguration() {
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

function mockSetEnvStub() {
    setEnvStub = sinon.stub(m_al_aws, 'setEnv').callsFake((vars, callback)=>{
        const {
            ingest_api,
            azcollect_api
        } = vars;
        process.env.ingest_api = ingest_api ? ingest_api : process.env.ingest_api;
        process.env.azollect_api = azcollect_api ? azcollect_api : process.env.azollect_api;
        const returnBody = {
            Environment: {
                Varaibles: vars
            }
        };
        return callback(null, returnBody);
    });
}

function mockLambdaMetricStatistics() {
    AWS.mock('CloudWatch', 'getMetricStatistics', function (params, callback) {
        var ret = colMock.CLOUDWATCH_GET_METRIC_STATS_OK;
        ret.Label = params.MetricName;
        return callback(null, ret);
    });
}

var formatFun = function (event, context, callback) {
    return callback(null, event);
};

describe('al_aws_collector tests', function() {

    beforeEach(function(){
        AWS.mock('KMS', 'decrypt', function (params, callback) {
            const data = {
                    Plaintext : 'decrypted-aims-sercret-key'
            };
            return callback(null, data);
        });

        responseStub = sinon.stub(m_response, 'send').callsFake(
            function fakeFn(event, mockContext, responseStatus, responseData, physicalResourceId) {
                mockContext.succeed();
            });

        setAlServiceStub();
        mockSetEnvStub();
    });

    afterEach(function(){
        restoreAlServiceStub();
        setEnvStub.restore();
        responseStub.restore();
    });

    it('register success with env vars set', function(done) {
        var mockContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                sinon.assert.neverCalledWithMatch(alserviceStub.get, colMock.GET_INGEST_URL);
                sinon.assert.neverCalledWithMatch(alserviceStub.get, colMock.GET_AZCOLLECT_URL);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function() {});
            collector.register(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);
        });
    });

    it('register success with env vars not set', function(done) {
        mockLambdaEndpointsUpdateConfiguration();
        delete process.env.ingest_api;
        delete process.env.azcollect_api;
        var mockContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                sinon.assert.calledTwice(alserviceStub.get);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function() {});
            collector.register(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);
        });
    });

    describe('checkin success', function() {

        var mockContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };
        
        before(function() {
            AWS.mock('CloudFormation', 'describeStacks', function(params, callback) {
                assert.equal(params.StackName, colMock.STACK_NAME);
                return callback(null, colMock.CF_DESCRIBE_STACKS_RESPONSE);
            });
            mockLambdaMetricStatistics();
        });

        after(function() {
            AWS.restore('CloudFormation', 'describeStacks');
            AWS.restore('CloudWatch', 'getMetricStatistics');
        });

        it('checkin success', function(done) {
            var mockCtx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                functionName : colMock.FUNCTION_NAME,
                fail : function(error) {
                    assert.fail(error);
                },
                succeed : function() {
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                }
            };
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                        mockCtx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };
                collector.handleEvent(testEvent);
            });
        });

        it('checkin forced update success', function(done) {
            alserviceStub.post.restore();
            alserviceStub.post = sinon.stub(m_alCollector.AlServiceC.prototype, 'post').callsFake(
                    function fakeFn(path, extraOptions) {
                        return new Promise(function(resolve, reject) {
                            return resolve({force_update: true});
                        });
                    });
            let fakeSelfUpdate = sinon.stub(AlAwsCollector.prototype, 'selfUpdate').callsFake(
                (callback) => { callback(); });
            let fakeSelfConfigUpdate = sinon.stub(AlAwsCollector.prototype, 'selfConfigUpdate').callsFake(
                    (callback) => { callback(); });
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    sinon.assert.called(fakeSelfConfigUpdate);
                    sinon.assert.called(fakeSelfUpdate);
                    fakeSelfUpdate.restore();
                    fakeSelfConfigUpdate.restore();
                    done();
                });
            });
        });

        it('checkin with custom check success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var spyHealthCheck = sinon.spy(function(callback) {
                    return callback(null);
                });
                var collector = new AlAwsCollector(
                    mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0',
                    creds, undefined, [spyHealthCheck], []
                );
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledOnce(spyHealthCheck);
                    // sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);
                    done();
                });
            });
        });

        it('checkin with custom check error', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var spyHealthCheck = sinon.spy(function(callback) {
                    return callback(m_healthChecks.errorMsg('MYCODE', 'error message'));
                });
                var collector = new AlAwsCollector(
                    mockContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0',
                    creds, undefined, [spyHealthCheck], []
                );
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledOnce(spyHealthCheck);
                    sinon.assert.calledWith(
                        alserviceStub.post,
                        colMock.CHECKIN_URL,
                        colMock.CHECKIN_AZCOLLECT_QUERY_CUSTOM_HEALTHCHECK_ERROR
                    );
                    done();
                });
            });
        });
    });

    describe('checkin error', function() {

        var checkinContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        before(function() {
            AWS.mock('CloudFormation', 'describeStacks', function(params, callback) {
                assert.equal(params.StackName, colMock.STACK_NAME);
                return callback(null, colMock.CF_DESCRIBE_STACKS_FAILED_RESPONSE);
            });
            mockLambdaMetricStatistics();
        });

        after(function() {
            AWS.restore('CloudFormation', 'describeStacks');
            AWS.restore('Lambda', 'updateFunctionConfiguration');
        });

        it('checkin error with healthCheck', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                checkinContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
                collector.checkin(function(error) {
                    assert.equal(error, undefined);
                    sinon.assert.calledWith(
                        alserviceStub.post,
                        colMock.CHECKIN_URL,
                        colMock.CHECKIN_ERROR_AZCOLLECT_QUERY
                    );
                    done();
                });
            });
        });
    });

    it('deregister success', function(done) {
        var deregisterContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            succeed : () => {
                sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            deregisterContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.deregister(colMock.DEREGISTRATION_TEST_EVENT, colMock.DEREG_PARAMS);
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
        mockLambdaEndpointsUpdateConfiguration();
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.updateEndpoints(function(error) {
                assert.equal(error, undefined);
                done();
            });
        });
    });
    
    describe('mocking ingestC', function() {
        var ingestCSecmsgsStub;
        var ingestCVpcFlowStub;
        var ingestCLogmsgsStub;
        var ingestCAgentstatusStub;
        
        beforeEach(function() {
            ingestCSecmsgsStub = sinon.stub(m_alCollector.IngestC.prototype, 'sendSecmsgs').callsFake(
                function fakeFn(data, callback) {
                    return new Promise (function(resolve, reject) {
                        resolve(null);
                    });
                });

            ingestCVpcFlowStub = sinon.stub(m_alCollector.IngestC.prototype, 'sendVpcFlow').callsFake(
                function fakeFn(data, callback) {
                    return new Promise (function(resolve, reject) {
                        resolve(null);
                    });
                });
            
            ingestCLogmsgsStub = sinon.stub(m_alCollector.IngestC.prototype, 'sendLogmsgs').callsFake(
                    function fakeFn(data, callback) {
                        return new Promise (function(resolve, reject) {
                            resolve(null);
                        });
                    });
            
            ingestCAgentstatusStub = sinon.stub(m_alCollector.IngestC.prototype, 'sendAgentstatus').callsFake(
                    function fakeFn(data, callback) {
                        return new Promise (function(resolve, reject) {
                            resolve(null);
                        });
                    });
        });
        
        afterEach(function() {
            ingestCSecmsgsStub.restore();
            ingestCVpcFlowStub.restore();
            ingestCLogmsgsStub.restore();
            ingestCAgentstatusStub.restore();
        });

        it('dont send if data is falsey', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
                var data = '';
                collector.send(data, true, function(error) {
                    assert.ifError(error);
                    sinon.assert.notCalled(ingestCSecmsgsStub);
                    done();
                });
            });
        });
        
        it('send secmsgs success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, true, function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCSecmsgsStub);
                    zlib.deflate(data, function(compressionErr, compressed) {
                        assert.ifError(compressionErr);
                        sinon.assert.calledWith(ingestCSecmsgsStub, compressed);
                        done();
                    });
                });
            });
        });
        
        it('send log success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'paws', AlAwsCollector.IngestTypes.LOGMSGS, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, false, function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCLogmsgsStub);
                    sinon.assert.calledWith(ingestCLogmsgsStub, data);
                    done();
                    
                });
            });
        });

        it('send vpcflow success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.VPCFLOW, '1.0.0', creds);
                var data = 'some-data';
                collector.send(data, true, function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(ingestCVpcFlowStub);
                    zlib.deflate(data, function(compressionErr, compressed) {
                        assert.ifError(compressionErr);
                        sinon.assert.calledWith(ingestCVpcFlowStub, compressed);
                        done();
                    });
                });
            });
        });
    });
    
    describe('mocking send', function() {
        var sendStub;
        before(function() {
            sendStub = sinon.stub(AlAwsCollector.prototype, 'send').callsFake(
                function fakeFn(data, compress, callback) {
                    return callback(null, null);
                });
        });
        
        after(function() {
            sendStub.restore();
        });
        
        it('process success', function(done) {
            AlAwsCollector.load().then(function(creds) {
                var collector = new AlAwsCollector(
                    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, formatFun);
                var data = 'some-data';
                collector.process(data, function(error) {
                    assert.ifError(error);
                    sinon.assert.calledOnce(sendStub);
                    sinon.assert.calledWith(sendStub, data);
                    done();
                });
            });
        });
    });
    
    describe('isConfigDifferent() method', () => {
        var collector;
        var isConfigDifferentContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(isConfigDifferentContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
        });
        
        it('same', () => {
            assert.equal(
                false, 
                collector._isConfigDifferent(
                    colMock.LAMBDA_FUNCTION_CONFIGURATION, 
                    colMock.LAMBDA_FUNCTION_CONFIGURATION
                )
            );
        });
        
        it('different', () => {
            assert.equal(
                true, 
                collector._isConfigDifferent(
                    colMock.LAMBDA_FUNCTION_CONFIGURATION, 
                    colMock.LAMBDA_FUNCTION_CONFIGURATION_CHANGED
                )
            );
        });
    });
    
    describe('changeObject() function', () => {
        var collector;
        var objectRef;
        var object;
        var changeObjectContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        beforeEach(() => {
            collector = new AlAwsCollector(changeObjectContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
                
            object = {
                keyA: { keyAA: 'valueAA' },
                keyB: 'valueB'
            };
            objectRef = JSON.parse(JSON.stringify(object));
        });

        it('sunny single key', () => {
            collector._changeObject(object, 'keyB', 'newValueB');
            objectRef.keyB = 'newValueB';
            assert(deepEqual(objectRef, object));
        });

        it('sunny nested keys', () => {
            collector._changeObject(object, 'keyA.keyAA', 'newValueAA');
            objectRef.keyA.keyAA = 'newValueAA';
            assert(deepEqual(objectRef, object));
        });

        it('sunny add a new key', () => {
            collector._changeObject(object, 'keyC', 'newValueC');
            objectRef.keyC = 'newValueC';
            assert(deepEqual(objectRef, object));
        });

        it('sunny add a new nested key', () => {
            collector._changeObject(object, 'keyA.keyAB', 'newValueAB');
            objectRef.keyA.keyAB = 'newValueAB';
            assert(deepEqual(objectRef, object));
        });

        it('error in nested key', () => {
            assert.throws(() => {
                collector._changeObject(object, 'NON_EXISTING_KEY.keyX', 'value');
            });
        });
    });
    
    describe('done() function', () => {
        var collector;

        it('calls success when there is no error', () => {

            const testContext = {
                succeed: () => true,
                fail: () => false
            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            const doneResult = collector.done();
            assert.ok(doneResult);
        });

        it('returns errors that can be stringified in their raw state', (done) => {
            const stringifialbleError = {
                foo: "bar"
            };
            const testContext = {
                succeed: () => true,
                fail: (error) => {
                    assert.equal(error, JSON.stringify(stringifialbleError));
                    done();
                }

            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            collector.done(stringifialbleError);
        });

        it('returns errors that cannot be JSON stringified as a string', () => {
            const circRefError = {};
            circRefError.foo = circRefError;
            const testContext = {
                succeed: () => true,
                fail: (error) => {
                    assert.notEqual(error, circRefError);
                    assert.ok(typeof error === 'string');
                    assert.equal(error, '{ foo: [Circular] }');
                }
            };

            collector = new AlAwsCollector(
                testContext,
                'cwe',
                AlAwsCollector.IngestTypes.SECMSGS,
                '1.0.0',
                colMock.AIMS_TEST_CREDS
            );

            collector.done(circRefError);
        });
    });

    describe('applyConfigChanges() function', () => {
        var object;
        var newValues;
        var collector;
        var applyConfigChangesContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };

        beforeEach(() => {
            collector = new AlAwsCollector(applyConfigChangesContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
            object = JSON.parse(JSON.stringify(colMock.LAMBDA_FUNCTION_CONFIGURATION));
            newValues = colMock.S3_CONFIGURATION_FILE_CHANGE;
        });

        it('apply new changes', () => {
            collector._applyConfigChanges(newValues, object, (err, config) => {
                assert.equal(err, undefined);
                assert(deepEqual(config, colMock.LAMBDA_FUNCTION_CONFIGURATION_CHANGED));
            });
        });

        it('apply same values (no changes)', () => {
            newValues = {
                Runtime: {
                    path: "Runtime",
                    value: "nodejs6.10"
                },
                Timeout: {
                    path: "Timeout",
                    value: 3
                },
                ChangeVariableAlApi: {
                    path: "Environment.Variables.al_api",
                    value: process.env.al_api
                }
            };
            collector._applyConfigChanges(newValues, object, (err, config) => {
                assert.equal(err, undefined);
                assert(deepEqual(config, colMock.LAMBDA_FUNCTION_CONFIGURATION));
            });
        });
    });
    
    describe('selfConfigUpdate() function', () => {
        var collector;
        var selfConfigUpdateContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(selfConfigUpdateContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
        });
        
        afterEach(() => {
            AWS.restore('S3', 'getObject');
            AWS.restore('Lambda', 'getFunctionConfiguration');
            AWS.restore('Lambda', 'updateFunctionConfiguration');
        });
        
        it('sunny config update', () => {
            var updateConfig = collector._filterDisallowedConfigParams(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
    
            mockS3GetObject(colMock.S3_CONFIGURATION_FILE_CHANGE);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
    
            AWS.mock('Lambda', 'updateFunctionConfiguration', (params, callback) => {
                assert(deepEqual(updateConfig, params));
                callback(null, colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE);
            });
    
            collector.selfConfigUpdate((err, config) => {
                assert.equal(null, err);
                assert(deepEqual(colMock.LAMBDA_FUNCTION_CONFIGURATION_WITH_STATE, config));
            });
        });
    
        it('no config updates', () => {
            mockS3GetObject(colMock.S3_CONFIGURATION_FILE_NOCHANGE);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
        
            AWS.mock('Lambda', 'updateFunctionConfiguration', (params, callback) => {
                throw("should not be called");
            });
        
            collector.selfConfigUpdate((err, config) => {
                assert.equal(null, err);
                assert.equal(config, undefined);
            });
        });
        
        it('non-existing config attribute', () => {
            var fileChange = {
                "Name" : {
                    path: "a.b.c.d",
                    value: "my value"
                }
            };
            mockS3GetObject(fileChange);
            mockLambdaGetFunctionConfiguration(colMock.LAMBDA_FUNCTION_CONFIGURATION);
        
            AWS.mock('Lambda', 'updateFunctionConfiguration', (params, callback) => {
                throw("should not be called");
            });
        
            collector.selfConfigUpdate((err, config) => {
                assert.equal('AWSC0010 Unable to apply new config values TypeError: Cannot read property \'b\' of undefined', err);
                assert.equal(config, undefined);
            });
        });
    });
    
    describe('update() method', () => {
        var collector;
        var fakeSelfUpdate;
        var fakeSelfConfigUpdate;
        var updateContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            functionName : colMock.FUNCTION_NAME,
            fail : function(error) {
                assert.fail(error);
            },
            succeed : function() {
            }
        };
        
        beforeEach(() => {
            collector = new AlAwsCollector(updateContext, 'cwe', 
                AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', colMock.AIMS_TEST_CREDS);
            fakeSelfUpdate = sinon.stub(AlAwsCollector.prototype, 'selfUpdate').callsFake(
                (callback) => { callback(); });
            fakeSelfConfigUpdate = sinon.stub(AlAwsCollector.prototype, 'selfConfigUpdate').callsFake(
                    (callback) => { callback(); });
        });
        
        afterEach(() => {
            fakeSelfUpdate.restore();
            fakeSelfConfigUpdate.restore();
            process.env.aws_lambda_update_config_name = colMock.S3_CONFIGURATION_FILE_NAME;
        });
        
        it('code and config update', (done) => {
            collector.update((err) => {
                assert.equal(err, undefined);
            });
            
            sinon.assert.calledOnce(fakeSelfUpdate);
            sinon.assert.calledOnce(fakeSelfConfigUpdate);
            done();
        });
        
        it('code update only', (done) => {
            delete(process.env.aws_lambda_update_config_name);
            
            const testEvent = {
                RequestType: 'ScheduledEvent',
                Type: 'SelfUpdate'
            };
            collector.handleEvent(testEvent);
            
            sinon.assert.calledOnce(fakeSelfUpdate);
            sinon.assert.notCalled(fakeSelfConfigUpdate);
            done();
        });
    });
});


describe('al_aws_collector tests for setDecryptedCredentials()', function() {
    var rewireGetDecryptedCredentials;
    var collectRewire;

    const ACCESS_KEY_ID = 'access_key_id';
    const ENCRYPTED_SECRET_KEY = 'encrypted_secret_key';
    const ENCRYPTED_SECRET_KEY_BASE64 = new Buffer(ENCRYPTED_SECRET_KEY).toString('base64');
    const DECRYPTED_SECRET_KEY = 'secret_key';

    before(function() {
        collectRewire = rewire('../al_aws_collector');
        rewireGetDecryptedCredentials = collectRewire.__get__('getDecryptedCredentials');
    });

    afterEach(function() {
        AWS.restore('KMS', 'decrypt');
    });

    it('if AIMS_DECRYPTED_CREDS are declared already it returns ok', function(done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', {
            access_key_id : ACCESS_KEY_ID,
            secret_key: DECRYPTED_SECRET_KEY
        });
        AWS.mock('KMS', 'decrypt', function (data, callback) {
            throw Error('don\'t call me');
        });
        rewireGetDecryptedCredentials(function(err) { if (err === null) done(); });
    });

    it('if AIMS_DECRYPTED_CREDS are not declared KMS decryption is called', function(done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', undefined);
        collectRewire.__set__('process', {
            env : {
                aims_access_key_id : ACCESS_KEY_ID,
                aims_secret_key: ENCRYPTED_SECRET_KEY_BASE64
            }
        });
        AWS.mock('KMS', 'decrypt', function (data, callback) {
            assert.equal(data.CiphertextBlob, ENCRYPTED_SECRET_KEY);
            return callback(null, {Plaintext : DECRYPTED_SECRET_KEY});
        });
        rewireGetDecryptedCredentials(function(err) {
            assert.equal(err, null);
            assert.deepEqual(collectRewire.__get__('AIMS_DECRYPTED_CREDS'), {
                access_key_id: ACCESS_KEY_ID,
                secret_key: DECRYPTED_SECRET_KEY
            });
            done();
        });
    });

    it('if some error during decryption, function fails', function(done) {
        collectRewire.__set__('AIMS_DECRYPTED_CREDS', undefined);
        collectRewire.__set__('process', {
            env : {
                aims_access_key_id : ACCESS_KEY_ID,
                aims_secret_key: new Buffer('wrong_key').toString('base64')
            }
        });
        AWS.mock('KMS', 'decrypt', function (data, callback) {
            assert.equal(data.CiphertextBlob, 'wrong_key');
            return callback('error', 'stack');
        });
        rewireGetDecryptedCredentials(function(err) {
            assert.equal(err, 'error');
            done();
        });
    });
});

describe('al_aws_collector error tests', function() {

    beforeEach(function(){
        AWS.mock('KMS', 'decrypt', function (params, callback) {
            const data = {
                    Plaintext : 'decrypted-aims-sercret-key'
            };
            return callback(null, data);
        });

        responseStub = sinon.stub(m_response, 'send').callsFake(
            function fakeFn(event, fakeContext, responseStatus, responseData, physicalResourceId) {
                fakeContext.done();
            });

        setAlServiceErrorStub();
        AWS.mock('CloudFormation', 'describeStacks', function(params, callback) {
            assert.equal(params.StackName, colMock.STACK_NAME);
            return callback(null, colMock.CF_DESCRIBE_STACKS_RESPONSE);
        });
        mockLambdaMetricStatistics();
        mockSetEnvStub();
    });

    afterEach(function(){
        restoreAlServiceStub();
        responseStub.restore();
        setEnvStub.restore();
        AWS.restore('CloudFormation', 'describeStacks');
        AWS.restore('CloudWatch', 'getMetricStatistics');
    });

    it('register error', function(done) {
        var registerContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            done : () => {
                sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                sinon.assert.calledWith(responseStub, sinon.match.any, sinon.match.any, m_response.FAILED, {Error: 'AWSC0003 registration error: post error'});
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            registerContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds, function() {});
            collector.register(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);
        });
    });

    it('deregister error', function(done) {
        var deregisterContext = {
            invokedFunctionArn : colMock.FUNCTION_ARN,
            done : () => {
                sinon.assert.calledWith(alserviceStub.del, colMock.DEREG_URL);
                sinon.assert.calledWith(responseStub, sinon.match.any, sinon.match.any, m_response.SUCCESS);
                done();
            }
        };
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
            deregisterContext, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
            collector.deregister(colMock.DEREGISTRATION_TEST_EVENT, colMock.DEREG_PARAMS);
        });
    });

    it('checkin error', function(done) {
        AlAwsCollector.load().then(function(creds) {
            var collector = new AlAwsCollector(
                context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
            collector.checkin(function(error) {
                assert.equal(error, 'post error');
                done();
            });
        });
    });
    
    it('default scheduled event error', function(done) {
        AlAwsCollector.load().then(function(creds) {
            let ctx = {
                invokedFunctionArn : colMock.FUNCTION_ARN,
                fail : function(error) {
                    assert.equal(error, 'AWSC0009 Unknown scheduled event detail type: Unknown');
                    done();
                },
                succeed : function() {
                    assert.fail('Should not be called');
                }
            };
            var collector = new AlAwsCollector(
                ctx, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds, undefined, [], []);
            const testEvent = {
                RequestType: 'ScheduledEvent',
                Type: 'Unknown'
            };
            collector.handleEvent(testEvent);
        });
    });

});
