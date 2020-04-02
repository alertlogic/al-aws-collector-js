const assert = require('assert');
const m_alAws = require('../al_aws');
const colMock = require('./collector_mock');
var AWS = require('aws-sdk-mock');


describe('al_aws Tests', function() {
    describe('arnToName() tests', function() {
        it('Valid input', function(done) {
            assert.equal(m_alAws.arnToName('arn:aws:iam::123456789101:role/testRole'), 'testRole');
            assert.equal(m_alAws.arnToName('arn:aws:kinesis:us-east-1:123456789101:stream/test-KinesisStream'), 'test-KinesisStream');
            assert.equal(m_alAws.arnToName('arn:aws:sqs:us-east-1:352283894008:testSqs'), 'testSqs');
            assert.equal(m_alAws.arnToName('arn:aws:s3:::teambucket'), 'teambucket');
            done();
        });
        
        it('Invalid input', function(done) {
            assert.ifError(m_alAws.arnToName(''));
            assert.ifError(m_alAws.arnToName('invalid'));
            assert.ifError(m_alAws.arnToName('arn:aws:invalid'));
            done();
        });
    });
    
    describe('arnToAccId() tests', function() {
        it('Valid input', function(done) {
            assert.equal(m_alAws.arnToAccId('arn:aws:iam::123456789101:role/testRole'), '123456789101');
            assert.equal(m_alAws.arnToAccId('arn:aws:kinesis:us-east-1:123456789101:stream/test-KinesisStream'), '123456789101');
            assert.equal(m_alAws.arnToAccId('arn:aws:sqs:us-east-1:352283894008:testSqs'), '352283894008');
            assert.equal(m_alAws.arnToAccId('arn:aws:s3:::teambucket'), '');
            done();
        });
        
        it('Invalid input', function(done) {
            assert.ifError(m_alAws.arnToAccId(''));
            assert.ifError(m_alAws.arnToAccId('invalid'));
            assert.ifError(m_alAws.arnToAccId('arn:aws:invalid'));
            done();
        });
    });
    
    describe('getS3ConfigChanges() function', () => {
        var jsonCfg = "{\"key\":\"value\"}";
        var s3Object = {Body: new Buffer(jsonCfg)};
    
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        afterEach(() => {
            AWS.restore('S3', 'getObject');
        });
    
        it('sunny case with predefined name', () => {
            AWS.mock('S3', 'getObject', function(params, callback) {
                assert.equal(params.Bucket, colMock.S3_CONFIGURATION_BUCKET);
                assert.equal(params.Key, colMock.S3_CONFIGURATION_FILE_NAME);
                return callback(null, s3Object);
            });
    
            m_alAws.getS3ConfigChanges((err, config) => {
                assert.equal(jsonCfg, JSON.stringify(config));
            });
        });
    
        it('error', () => {
            AWS.mock('S3', 'getObject', function (params, callback) {
                assert.equal(params.Bucket, colMock.S3_CONFIGURATION_BUCKET);
                assert.equal(params.Key, colMock.S3_CONFIGURATION_FILE_NAME);
                return callback("key not found error");
            });
    
            m_alAws.getS3ConfigChanges(function(err, config) {
                assert.equal("key not found error", err);
            });
        });
    });
    
    describe('getLambdaConfig() function', () => {
    
        beforeEach(() => {
            colMock.initProcessEnv();
        });
        
        afterEach(() => {
            AWS.restore('Lambda', 'getFunctionConfiguration');
        });
        
        it('check function name', () => {
            AWS.mock('Lambda', 'getFunctionConfiguration', (params, callback) => {
                assert.equal(colMock.FUNCTION_NAME, params.FunctionName);
                return callback(null, "ok");
            });
    
            m_alAws.getLambdaConfig((err, config) => {
                assert.equal("ok", config);
            });
        });
    });
});


