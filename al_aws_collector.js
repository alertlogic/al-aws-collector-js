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
const response = require('cfn-response');
const deepEqual = require('deep-equal');

const m_alCollector = require('@alertlogic/al-collector-js');
const m_alAws = require('./al_aws');
const m_healthChecks = require('./health_checks');
const m_stats = require('./statistics');

var AIMS_DECRYPTED_CREDS = null;

const AL_SERVICES = ['ingest', 'azcollect'];

function getDecryptedCredentials(callback) {
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
 * @param {Object} context - context of Lambda's function.
 * @param {string} collectorType - collector type (cwe as example).
 * @param {string} ingestType - ingest data type (secmsgs, vpcflow, etc).
 * @param {string} version - version of collector.
 * @param {Object} aimsCreds - Alert Logic API credentials.
 * @param {string} [aimsCreds.access_key_id] - Alert Logic API access key id.
 * @param {string} [aimsCreds.secret_key] - Alert Logic API secret key.
 * @param {function} formatFun - callback formatting function
 * @param {Array.<function>} healthCheckFuns - list of custom health check functions (can be just empty, so only common are applied)
 * @param {Array.<function>} statsFuns - list of custom stats functions (can be just empty, so only common are applied)
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
            getDecryptedCredentials(function(err, creds){
                if (err){
                    reject(err);
                } else {
                    resolve(creds);
                }
            })
        })
    }
    
    constructor(context, collectorType, ingestType, version, aimsCreds, formatFun, healthCheckFuns, statsFuns) {
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
        this._aimsc = new m_alCollector.AimsC(process.env.al_api, aimsCreds);
        this._endpointsc = new m_alCollector.EndpointsC(process.env.al_api, this._aimsc);
        this._azcollectc = new m_alCollector.AzcollectC(process.env.azollect_api, this._aimsc, collectorType);
        this._ingestc = new m_alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
        this._formatFun = formatFun;
        this._customHealthChecks = healthCheckFuns;
        this._customStatsFuns = statsFuns;
    }
    
    _getAttrs() {
        return {
            awsAccountId : m_alAws.arnToAccId(this._arn),
            region : this._region,
            functionName : this._name,
            version : this._version,
            dataType : this._ingestType
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
                        azollect_api : mapResult[1].azcollect
                    };
                    return m_alAws.setEnv(endpoints, callback);
                }
            }
        );
    }
    
    register(event, custom) {
        const context = this._invokeContext;
        const regValues = Object.assign(this._getAttrs(), custom);

        this._azcollectc.register(regValues)
            .then(resp => {
                return response.send(event, context, response.SUCCESS);
            })
            .catch(exception => {
                return response.send(event, context, response.FAILED, {Error: exception});
            });
    }

    checkin(callback) {
        var collector = this;
        const context = this._invokeContext;
        const checks = this._customHealthChecks;
        const statsFuns = this._customStatsFuns;

        //it is assumed that all functions here always return err != null
        async.parallel([
            function(asyncCallback) {
                m_healthChecks.getHealthStatus(context, checks, function(err, healthStatus) {
                    return asyncCallback(null, healthStatus);
                });
            },
            function(asyncCallback) {
                m_stats.getStatistics(context, statsFuns, function(err, statistics) {
                    return asyncCallback(null, statistics);
                });
            }
        ],
        function(err, checkinParts) {
            const checkin = Object.assign(
                collector._getAttrs(), checkinParts[0], checkinParts[1]
            );
            collector._azcollectc.checkin(checkin)
            .then(resp => {
                if(resp && resp.force_update === true){
                    console.log("Force update");
                    collector.update(callback);
                }
                else{
                    return callback(null);
                }
            })
            .catch(exception => {
                return callback(exception);
            });
        });
    }
    
    deregister(event, custom){
        const context = this._invokeContext;
        const regValues = Object.assign(this._getAttrs(), custom);

        this._azcollectc.deregister(regValues)
            .then(resp => {
                return response.send(event, context, response.SUCCESS);
            })
            .catch(exception => {
                return response.send(event, context, response.FAILED, {Error: exception});
            });
    }

    send(data, callback){
        var collector = this;
        var ingestType = collector._ingestType;

        if(!data){
            return callback(null);
        }

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
    
    process(event, callback) {
        const context = this._invokeContext;
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
    
    update(callback) {
        let collector = this;

        async.waterfall([
            collector.selfUpdate,
            function(asyncCallback) {
                // Run config update only if the config file is known
                if (process.env.aws_lambda_update_config_name) {
                    collector.selfConfigUpdate(asyncCallback);
                } else {
                    asyncCallback(null)
                }
            }
        ], callback);
    }

    selfUpdate(callback) {
        m_alAws.selfUpdate(callback);
    }
    
    selfConfigUpdate(callback) {
        let collector = this;
        
        async.waterfall([
            function(asyncCallback) {
                m_alAws.getS3ConfigChanges(function(err, config) {
                    asyncCallback(err, config);
                });
            },
            function(newValues, asyncCallback) {
                m_alAws.getLambdaConfig(function(err, currentConfig) {
                    asyncCallback(err, newValues, currentConfig);
                });
            },
            function(newValues, currentConfig, asyncCallback) {
                collector._applyConfigChanges(newValues, currentConfig, function(err, newConfig) {
                    asyncCallback(err, newConfig, currentConfig);
                });
            },
            function(newConfig, currentConfig, asyncCallback) {
                if (collector._isConfigDifferent(newConfig, currentConfig)) {
                    let updateConfig = collector._filterDisallowedConfigParams(newConfig);
                    m_alAws.updateLambdaConfig(updateConfig, asyncCallback);
                } else {
                    asyncCallback(null);
                }
            }
        ],
        function(err, config) {
            if (err) {
                console.info('Lambda self-update config error: ', err);
            } else {
                if (config !== undefined) {
                    console.info('Lambda self-update config successful. Config: ', config);
                } else {
                    console.info('Lambda self-update config nothing to update');
                }
            }
            callback(err, config);
        });
    }

    _applyConfigChanges(newValues, config, callback) {
        var jsonConfig = JSON.stringify(config);
        var newConfig = JSON.parse(jsonConfig); 
        
        try {
            Object.keys(newValues).forEach(
                function(item) {
                    let path = newValues[item]['path'];
                    let value = newValues[item]['value'];
                    this._changeObject(newConfig, path, value);
                }, this); //lexical scoping
            return callback(null, newConfig);
        }
        catch(ex) {
            return callback('Unable to apply new config values');
        }
    }

    _changeObject(obj, path, value) {
        if (typeof path == 'string') {
            return this._changeObject(obj, path.split('.'), value);
        }
        else if (path.length == 1) {
            return obj[path[0]] = value;
        } else {
            return this._changeObject(obj[path[0]], path.slice(1), value);
        }
    }

    _isConfigDifferent(config1, config2) {
        return !deepEqual(config1, config2);
    }

    _filterDisallowedConfigParams(config) {
        var newConfig = JSON.parse(JSON.stringify(config));
        // These are not either allowed to update or we don't have enough permission.
        delete(newConfig.FunctionArn);
        delete(newConfig.Role);
        delete(newConfig.CodeSize);
        delete(newConfig.LastModified);
        delete(newConfig.CodeSha256);
        delete(newConfig.Version);
        if (newConfig.VpcConfig)
            delete(newConfig.VpcConfig.VpcId);
        delete(newConfig.MasterArn);
        return newConfig;
    }
}

module.exports = AlAwsCollector;
