const assert = require('assert');
const nock = require('nock');
const ingestEndpoints = require('../ingest_endpoints');

describe('Endpoint fetcher', () => {
    const accId = 8675309;
    const alPath = (serviceName) =>  {
        return [
            '/endpoints/v1/',
            accId,
            '/residency/',
            'default',
            '/services/',
            serviceName,
            '/endpoint'
        ].join('');
    };
    describe('good cases', () =>{
        beforeEach(() => {
            nock('https://somefakeendpoint.alertlogic.com')
                .post('/aims/v1/authenticate')
                .reply(200, { authentication: {
                    token: 'this token is very fake',
                    account: {
                        id: accId
                    }
                }});
            nock('https://somefakeendpoint.alertlogic.com')
                .get(alPath('azcollect'))
                .reply(200, { 'azcollect': 'https://azcollectEnpoint' });
            nock('https://somefakeendpoint.alertlogic.com')
                .get(alPath('ingest'))
                .reply(200, { 'ingest': 'https://ingestEnpoint' });
        });

        it('gets the endpoints successfully', (done) => {
            const endpoints = ['azcollect', 'ingest'];
            ingestEndpoints(
                endpoints,
                'a key',
                'a secret',
                'default',
                'somefakeendpoint.alertlogic.com'
            ).then((results, err) => {
                assert.equal(results.azcollect, 'https://azcollectEnpoint');
                assert.equal(results.ingest, 'https://ingestEnpoint');
                done();
            }).catch((err) => {
                done(err);
            });
        });
    });
    describe('error cases', () =>{
        it('handles auth errors', (done) => {
            nock('https://somefakeendpoint.alertlogic.com')
                .post('/aims/v1/authenticate')
                .replyWithError('unauthorized');
            const endpoints = ['azcollect', 'ingest'];
            ingestEndpoints(
                endpoints,
                'a key',
                'a secret',
                'default',
                'somefakeendpoint.alertlogic.com'
            ).catch((err)=>{
                assert.equal(err.includes('AIMs authentication failed'), true);
                done();
            });
        });

        it('handles endpoint errors', (done) => {
            nock('https://somefakeendpoint.alertlogic.com')
                .post('/aims/v1/authenticate')
                .reply(200, { authentication: {
                    token: 'this token is very fake',
                    account: {
                        id: accId
                    }
                }});
            nock('https://somefakeendpoint.alertlogic.com')
                .get(alPath('azcollect'))
                .replyWithError('endpoint not found');
            nock('https://somefakeendpoint.alertlogic.com')
                .get(alPath('ingest'))
                .reply(200, { 'ingest': 'https://ingestEnpoint' });
            const endpoints = ['azcollect', 'ingest'];
            ingestEndpoints(
                endpoints,
                'a key',
                'a secret',
                'default',
                'somefakeendpoint.alertlogic.com'
            ).catch((err)=>{
                assert.equal(err.includes('Endpoints get for azcollect'), true);
                done();
            });
        });
    });
});
