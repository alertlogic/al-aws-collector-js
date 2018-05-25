/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Base class for AWS Lambda based collectors.
 *
 * @end
 * -----------------------------------------------------------------------------
 */
'use strict';

const AWS = require('aws-sdk');
const moment = require('moment');
const zlib = require('zlib');
const async = require('async');

const m_alServiceC = require('al-collector-js/al_servicec');
const m_alAws = require('./al_aws');

var AIMS_DECRYPTED_CREDS = null;

const AL_SERVICES = ['ingest', 'azcollect'];

function getDescryptedCredentials(callback) {
    if (AIMS_DECRYPTED_CREDS) {
        return callback(null, AIMS_DECRYPTED_CREDS);
    } else {
        const kms = new AWS.KMS();
        kms.decrypt(
            {CiphertextBlob: new Buffer(process.env.aims_secret_key, 'base64')},
            (err, data) => {
                if (err) {
                    return callback(err);
                } else {
                    AIMS_DECRYPTED_CREDS = {
                        access_key_id: process.env.aims_access_key_id,
                        secret_key: data.Plaintext.toString('ascii')
                    };

                    return callback(null, AIMS_DECRYPTED_CREDS);
                }
            });
    }
}
/**
 * @class
 * Base class for AWS lambda based collectors
 *
 * @constructor
 * @param {Object} aimsCreds - Alert Logic API credentials.
 * @param {string} [aisCreds.access_key_id] - Alert Logic API access key id.
 * @param {string} [aisCreds.secret_key] - Alert Logic API secret key.
 *
 */
class AlAwsCollector {
    static get IngestTypes() {
        return {
            SECMSGS : 'secmsgs',
            VPCFLOW : 'vpcflow'
        }
    };
    
    static load() {
        return new Promise(function(resolve, reject){
            getDescryptedCredentials(function(err, creds){
                if (err){
                    reject(err);
                } else {
                    resolve(creds);
                }
            })
        })
    }
    
    constructor(context, collectorType, ingestType, version, aimsCreds, formatFun, healthCheckFun) {
        this._invokeContext = context;
        this._arn = context.invokedFunctionArn;
        this._collectorType = collectorType;
        this._ingestType = ingestType;
        this._version = version;
        this._region = process.env.AWS_REGION;
        this._name = process.env.AWS_LAMBDA_FUNCTION_NAME;
        this._alDataResidency = 
            process.env.al_data_residency ?
                process.env.al_data_residency :
                'default';
        this._alAzcollectEndpoint = process.env.azollect_api;
        this._aimsc = new m_alServiceC.AimsC(process.env.al_api, aimsCreds);
        this._endpointsc = new m_alServiceC.EndpointsC(process.env.al_api, this._aimsc);
        this._azcollectc = new m_alServiceC.AzcollectC(process.env.azollect_api, this._aimsc);
        this._ingestc = new m_alServiceC.IngestC(process.env.ingest_api, this._aimsc);
        this._formatFun = formatFun;
        this._healthCheckFun = healthCheckFun;
    }
    
    _getAttrs() {
        return {
            collectorType : this._collectorType,
            awsAccountId : m_alAws.arnToAccId(this._arn),
            region : this._region,
            functionName : this._name,
            version : this._version
        };
    }
    
    updateEndpoints(callback) {
        var collector = this;
        async.map(AL_SERVICES,
            function(service, mapCallback){
                collector._endpointsc.getEndpoint(service, collector._alDataResidency)
                .then(resp => {
                    return mapCallback(null, resp);
                })
                .catch(function(exception) {
                    return mapCallback(`Endpoints ${service} update failure ${exception}`);
                });
            },
            function (mapErr, mapResult) {
                if (mapErr) {
                    return callback(mapErr);
                } else {
                    var endpoints = {
                        ingest_api : mapResult[0].ingest,
                        azcollect : mapResult[1].azcollect
                    };
                    return m_alAws.setEnv(endpoints, callback);
                }
            }
        );
    }
    
    register(custom, callback) {
        const regValues = Object.assign(this._getAttrs(), custom);

        this._azcollectc.doRegistration(regValues)
            .then(resp => {
                return callback(null);
            })
            .catch(exception => {
                return callback(exception);
            });
    }

    checkin(event, callback) {
        // TODO: add stats
        var collector = this;
        async.waterfall([
            function(asyncCallback) {
                collector._healthCheckFun(event, asyncCallback);
            },
            function(healthStatus, asyncCallback) {
                var status = {
                    status : healthStatus.status,
                    details : healthStatus.details,
                    error_code: healthStatus.error_code
                };
                const checkinValues = Object.assign(collector._getAttrs(), status);
                collector._azcollectc.doCheckin(checkinValues)
                .then(resp => {
                    return asyncCallback(null);
                })
                .catch(exception => {
                    return asyncCallback(exception);
                });
            }
        ],
        callback);
    }
    
    deregister(custom, callback){
        const regValues = Object.assign(this._getAttrs(), custom);

        this._azcollectc.doDeregistration(regValues)
            .then(resp => {
                return callback(null);
            })
            .catch(exception => {
                return callback(exception);
            });
    }
    
    send(data, callback){
        var collector = this;
        var ingestType = collector._ingestType;
        
        zlib.deflate(data, function(compressionErr, compressed) {
            if (compressionErr) {
                return callback(compressionErr);
            } else {
                switch (ingestType) {
                    case AlAwsCollector.IngestTypes.SECMSGS:
                        collector._ingestc.sendSecmsgs(compressed)
                        .then(resp => {
                            return callback(null, resp);
                        })
                        .catch(exception => {
                            return callback(exception);
                        });
                        break;
                    case AlAwsCollector.IngestTypes.VPCFLOW:
                        collector._ingestc.sendVpcFlow(compressed)
                        .then(resp => {
                            return callback(null, resp);
                        })
                        .catch(exception => {
                            return callback(exception);
                        });
                        break;
                    default:
                        return callback(`Unknown Alertlogic ingestion type: ${ingestType}`);
                }
            }
        });
    }
    
    process(event, context, callback) {
        var collector = this;
        async.waterfall([
            function(asyncCallback) {
                collector._formatFun(event, context, asyncCallback);
            },
            function(formatedData, asyncCallback) {
                collector.send(formatedData, asyncCallback);
            }
        ],
        callback);
    }

    selfUpdate(callback) {
        m_alAws.selfUpdate(callback);
    }
}

module.exports = AlAwsCollector;
