const assert = require('assert');
const rewire = require('rewire');
const sinon = require('sinon');
const AlAwsCollector = require('../al_aws_collector').AlAwsCollector;
var m_servicec = require('al-collector-js/al_servicec');
var AWS = require('aws-sdk-mock');


process.env.AWS_REGION = 'us-east-1';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'lambda-name';
const context = {
invokedFunctionArn : 'arn:aws:lambda:us-east-1:123453894008:function:some-fun-name'
};

var alserviceStub = {};

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
            ingest : 'new-azcollect-endpoint'
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
            function fakeFn(path, extraOptions) {
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

var formatFun = function (event, context, callback) {
return callback(null);
};

describe('al_aws_collector tests', function(done) {

before(function(){
AWS.mock('KMS', 'decrypt', function (params, callback) {
const data = {
Plaintext : 'decrypted-aims-sercret-key'
};
            return callback(null, data);
        });

AWS.mock('Lambda', 'updateFunctionConfiguration', function (params, callback) {
            return callback(null, params);
        });

setAlServiceStub();
});

after(function(){
restoreAlServiceStub();
});

    it('register success', function(done) {
    AlAwsCollector.load().then(function(creds) {
    var collector = new AlAwsCollector(
    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
        collector.register({}, function(error) {
        done();
        });
    });
    });
    
    it('checkin success', function(done) {
    AlAwsCollector.load().then(function(creds) {
    var collector = new AlAwsCollector(
    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS,'1.0.0', creds);
    const mockHealth = {
                'status':'ok',
                'details':[],
                'statistics':[
                    {'Label':'Invocations','Datapoints':[{'Timestamp':'2017-11-21T16:40:00Z','Sum':1,'Unit':'Count'}]}
                ]
            };
        collector.checkin(mockHealth, function(error) {
        done();
        });
    });
    });
    
    it('deregister success', function(done) {
    AlAwsCollector.load().then(function(creds) {
    var collector = new AlAwsCollector(
    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
        collector.deregister({}, function(error) {
        done();
        });
    });
    });

    it('updateEndpoints success', function(done) {
    AlAwsCollector.load().then(function(creds) {
    var collector = new AlAwsCollector(
    context, 'cwe', AlAwsCollector.IngestTypes.SECMSGS, '1.0.0', creds);
        collector.updateEndpoints(function(error) {
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
