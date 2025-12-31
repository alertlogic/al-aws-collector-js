const AlAwsCollectorV2 = require('../../modern/al_aws_collector_v2');
const assert = require('assert');
const sinon = require('sinon');
const m_response = require('cfn-response');
const colMock = require('../collector_mock');
const alAwsCommon = require('../../modern/al_aws_common');
const m_alCollector = require('@alertlogic/al-collector-js');

const { CloudFormation } = require("@aws-sdk/client-cloudformation"),
    { CloudWatch } = require("@aws-sdk/client-cloudwatch"),
    { KMS } = require("@aws-sdk/client-kms"),
    { Lambda } = require("@aws-sdk/client-lambda"),
    { S3 } = require("@aws-sdk/client-s3");


var alStub = require('../al_stub');
const context = {
    invokedFunctionArn: colMock.FUNCTION_ARN
};

var alserviceStub = {};
var responseStub = {};
var setEnvStub = {};

function setAlServiceStub() {
    alserviceStub.get = alStub.mock(m_alCollector.AlServiceC, 'get',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                var ret = null;
                switch (path) {
                    case '/residency/default/services/ingest/endpoint':
                        ret = {
                            ingest: 'new-ingest-endpoint'
                        };
                        break;
                    case '/residency/default/services/azcollect/endpoint':
                        ret = {
                            azcollect: 'new-azcollect-endpoint'
                        };
                        break;
                    case '/residency/default/services/collector_status/endpoint':
                        ret = {
                            collector_status: 'new-collector-status-endpoint'
                        };
                        break;
                    default:
                        break;
                }
                return resolve(ret);
            });
        });
    alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return resolve({ collector: { id: '12345' } });
            });
        });
    alserviceStub.put = alStub.mock(m_alCollector.AlServiceC, 'put',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return resolve();
            });
        });
    alserviceStub.del = alStub.mock(m_alCollector.AlServiceC, 'deleteRequest',
        function fakeFn(path) {
            return new Promise(function (resolve, reject) {
                return resolve();
            });
        });
}

function setAlServiceErrorStub() {
    alserviceStub.get = alStub.mock(m_alCollector.AlServiceC, 'get',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject('get error');
            });
        });
    alserviceStub.post = alStub.mock(m_alCollector.AlServiceC, 'post',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject('post error');
            });
        });
    alserviceStub.put = alStub.mock(m_alCollector.AlServiceC, 'put',
        function fakeFn(path, extraOptions) {
            return new Promise(function (resolve, reject) {
                return reject('put error');
            });
        });
    alserviceStub.del = alStub.mock(m_alCollector.AlServiceC, 'deleteRequest',
        function fakeFn(path) {
            return new Promise(function (resolve, reject) {
                return reject('delete error');
            });
        });
}

function restoreAlServiceStub() {
    alserviceStub.get.restore();
    alserviceStub.post.restore();
    alserviceStub.put.restore();
    alserviceStub.del.restore();
}

function mockSetEnvStub() {
    setEnvStub = sinon.stub(alAwsCommon, 'setEnvAsync').callsFake((vars) => {
        const {
            ingest_api,
            azcollect_api,
            collector_status_api
        } = vars;
        process.env.ingest_api = ingest_api ? ingest_api : process.env.ingest_api;
        process.env.azcollect_api = azcollect_api ? azcollect_api : process.env.azcollect_api;
        process.env.collector_status_api = collector_status_api ? collector_status_api : process.env.collector_status_api;
        const returnBody = {
            Environment: {
                Variables: vars
            }
        };
        return Promise.resolve(returnBody);
    });
}

describe('AlAwsCollectorV2 tests', function () {
    beforeEach(() => {
        colMock.initProcessEnv();
        alStub.mock(KMS, 'decrypt', (params) => {
            return Promise.resolve({
                Plaintext: Buffer.from('decryptedSecretKey')
            });
        });
        responseStub = sinon.stub(m_response, 'send').callsFake((event, mockContext, responseStatus, responseData, physicalResourceId) => {
            return mockContext.succeed();
        });
        setAlServiceStub();
        mockSetEnvStub();

    });

    afterEach(() => {
        restoreAlServiceStub()
        alStub.restore(KMS, 'decrypt');
        responseStub.restore();
        setEnvStub.restore();
    })

    describe('getRegistration', function () {

        it('register success with env vars set', async function () {
            //   const registrationResponse = alStub.mock(m_alCollector.AzcollectC, 'register',(param)=>{
            //     return Promise.resolve({collector: {id: '12345'}});
            // });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    //sinon.assert.calledOnce(registrationResponse);
                    sinon.assert.called(responseStub);
                    sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                }
            };

            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);

        });
        it('register success with env vars not set', async function () {
            alStub.mock(Lambda, 'updateFunctionConfiguration', () => {
                return Promise.resolve({
                    FunctionName: params.FunctionName,
                    MemorySize: params.MemorySize,
                    Timeout: params.Timeout
                });
            })

            const envIngestApi = process.env.ingest_api;
            const envAzcollectApi = process.env.ingest_api;
            const envCollectorStatusApi = process.env_collector_status_api;
            process.env.ingest_api = undefined;
            process.env.azcollect_api = undefined;
            process.env.collector_status_api = undefined;
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.calledWith(alserviceStub.post, colMock.REG_URL, colMock.REG_AZCOLLECT_QUERY);
                    sinon.assert.calledThrice(alserviceStub.get);

                }
            };
            const creds = AlAwsCollectorV2.load();
            let collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            let updateEnpointsSpy = sinon.spy(collector, 'updateApiEndpoints')
            await collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS)

            sinon.assert.calledOnce(updateEnpointsSpy);
            assert.ok(process.env.ingest_api);
            assert.ok(process.env.azcollect_api);
            assert.ok(process.env.collector_status_api);
            assert.equal(process.env.ingest_api, "new-ingest-endpoint");
            assert.equal(process.env.azcollect_api, "new-azcollect-endpoint");
            process.env.ingest_api = envIngestApi;
            process.env.azcollect_api = envAzcollectApi;
            process.env.collector_status_api = envCollectorStatusApi;
            alStub.restore(Lambda, 'updateFunctionConfiguration');
        });

        it('register fail', async function () {
            const registrationResponse = alStub.mock(m_alCollector.AzcollectC, 'register', (param) => {
                return Promise.reject(new Error("Servcer error"));
            });
            var mockContext = {
                invokedFunctionArn: colMock.FUNCTION_ARN,
                succeed: () => {
                    sinon.assert.called(registrationResponse);
                }
            };
            const creds = AlAwsCollectorV2.load();
            var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
            await collector.registerSync(colMock.REGISTRATION_TEST_EVENT, colMock.REG_PARAMS);

        });
    });
    describe('checkin event', function () {
        // var mockContext = {
        //             invokedFunctionArn: colMock.FUNCTION_ARN,
        //             functionName: colMock.FUNCTION_NAME
        //         };

        this.beforeEach(function () {
            alStub.mock(CloudWatch, 'getMetricStatistics', async (param) => {
                return Promise.resolve({
                    FunctionName: 'TestFunction',
                    MemorySize: 128,
                    Timeout: 3
                });
            });

            alStub.mock(CloudFormation, 'describeStacks', async (param) => {
                return Promise.resolve({
                    Stacks: [
                        {
                            StackStatus: 'CREATE_COMPLETE'
                        }
                    ]
                });
            });


            after(function () {
                alStub.restore(CloudFormation, 'describeStacks');
                alStub.restore(CloudWatch, 'getMetricStatistics');
            });
            it('should send checkin event register succesfully', async function () {
                var mockContext = {
                    invokedFunctionArn: colMock.FUNCTION_ARN,
                    functionName: colMock.FUNCTION_NAME,
                    fail: function (error) {
                        assert.fail(error);
                    },
                    succeed: function () {
                        sinon.assert.calledOnce(alserviceStub.post);
                        sinon.assert.calledWith(alserviceStub.post, colMock.CHECKIN_URL, colMock.CHECKIN_AZCOLLECT_QUERY);

                    }
                };

                const creds = AlAwsCollectorV2.load();
                var collector = new AlAwsCollectorV2(mockContext, 'cwe', AlAwsCollectorV2.IngestTypes.SECMSGS, '1.0.0', creds, function () { });
                const testEvent = {
                    RequestType: 'ScheduledEvent',
                    Type: 'Checkin'
                };
                await collector.handleEvent(testEvent);
            });
        });
    });
});
