const assert = require('assert');
const sinon = require('sinon');
const m_alCollector = require('@alertlogic/al-collector-js');
const response = require('../../modern/cfn_response_fetch');

const baseEvent = {
    StackId: 'arn:aws:cloudformation:us-east-1:123:stack/foo/abcd',
    RequestId: 'req-1',
    LogicalResourceId: 'MyResource',
    ResponseURL: 'https://cfn-response.example.com/upload?signature=x'
};

const baseContext = {
    logStreamName: 'log-stream-1'
};

describe('cfn_response_fetch logging tests', function () {
    let putStub;
    let logSpy;
    let errSpy;

    afterEach(() => {
        if (putStub && putStub.restore) {
            putStub.restore();
        }
        if (logSpy && logSpy.restore) {
            logSpy.restore();
        }
        if (errSpy && errSpy.restore) {
            errSpy.restore();
        }
    });

    it('logs a complete success message without body when PUT response is empty', async function () {
        putStub = sinon.stub(m_alCollector.RestServiceClient.prototype, 'put').resolves('');
        logSpy = sinon.spy(console, 'log');

        await response.send(baseEvent, baseContext, response.SUCCESS, {});

        const successLog = logSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && c.args[0].startsWith('CFN Response PUT succeeded')
        );
        assert.ok(successLog, 'expected a complete success log line');
        assert.match(successLog.args[0], /status=SUCCESS/);
        assert.doesNotMatch(successLog.args[0], /body=/);
    });

    it('logs a complete success message without body when PUT response is an empty object', async function () {
        putStub = sinon.stub(m_alCollector.RestServiceClient.prototype, 'put').resolves({});
        logSpy = sinon.spy(console, 'log');

        await response.send(baseEvent, baseContext, response.SUCCESS, {});

        const successLog = logSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && c.args[0].startsWith('CFN Response PUT succeeded')
        );
        assert.ok(successLog);
        assert.doesNotMatch(successLog.args[0], /body=/);
    });

    it('includes the returned body in the success log when present', async function () {
        putStub = sinon.stub(m_alCollector.RestServiceClient.prototype, 'put').resolves('ok-body');
        logSpy = sinon.spy(console, 'log');

        await response.send(baseEvent, baseContext, response.SUCCESS, {});

        const successLog = logSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && c.args[0].startsWith('CFN Response PUT succeeded')
        );
        assert.ok(successLog);
        assert.match(successLog.args[0], /body=ok-body/);
    });

    it('logs the error object on PUT failure with status info available', async function () {
        const err = new Error('forbidden');
        err.response = { status: 403, statusText: 'Forbidden' };
        putStub = sinon.stub(m_alCollector.RestServiceClient.prototype, 'put').rejects(err);
        errSpy = sinon.spy(console, 'error');

        await response.send(baseEvent, baseContext, response.FAILED, { Error: 'x' });

        const errLog = errSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && c.args[0].startsWith('CFN Response failed.')
        );
        assert.ok(errLog, 'expected a failure log line');
        // The error object is passed as the second argument so operators can see status/statusText
        assert.strictEqual(errLog.args[1], err);
        assert.strictEqual(errLog.args[1].response.status, 403);
        assert.strictEqual(errLog.args[1].response.statusText, 'Forbidden');
    });

    it('logs the error object on PUT failure when only a message is present', async function () {
        const err = new Error('boom');
        putStub = sinon.stub(m_alCollector.RestServiceClient.prototype, 'put').rejects(err);
        errSpy = sinon.spy(console, 'error');

        await response.send(baseEvent, baseContext, response.FAILED, { Error: 'x' });

        const errLog = errSpy.getCalls().find(
            (c) => typeof c.args[0] === 'string' && c.args[0].startsWith('CFN Response failed.')
        );
        assert.ok(errLog);
        assert.strictEqual(errLog.args[1], err);
        assert.strictEqual(errLog.args[1].message, 'boom');
    });
});
