/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Base class for AWS Lambda based collectors.
 *
 * Last message ID: AWSC0010
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
            VPCFLOW : 'vpcflow',
            LOGMSGS : 'logmsgs'
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
    
    constructor(context, collectorType, ingestType, version, aimsCreds,
            formatFun, healthCheckFuns, statsFuns) {
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
        this._aimsc = new m_alCollector.AimsC(process.env.al_api, aimsCreds, null, null, process.env.customer_id);
        this._endpointsc = new m_alCollector.EndpointsC(process.env.al_api, this._aimsc);
        this._azcollectc = new m_alCollector.AzcollectC(process.env.azollect_api, this._aimsc, collectorType);
        this._ingestc = new m_alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
        this._formatFun = formatFun;
        this._customHealthChecks = healthCheckFuns;
        this._customStatsFuns = statsFuns;
        this._collectorId = process.env.collector_id;
    }
    
    set context (context) {
        this._invokeContext = context;
    }
    get context () {
        return this._invokeContext;
    }
    
    done(error) {
        let context = this._invokeContext;
        if (error) {
            return context.fail(error);
        } else {
            return context.succeed();
        }
    }
    
    getProperties() {
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
                    return mapCallback(`AWSC0001 Endpoints ${service} update failure ${exception}`);
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
        const regValues = Object.assign(this.getProperties(), custom);

        async.waterfall([
            (asyncCallback) => {
                const {
                    azcollect_api,
                    ingest_api
                } = process.env;

                if(!azcollect_api || !ingest_api){
                    // handling errors like this because the other unit tests seem to indicate that
                    // the collector should register even if there is an error in getting the endpoints.
                    this.updateEndpoints((err, newConfig) => {
                        if(err){
                            console.warn('AWSC0002 Error updating endpoints', err);
                        } else {
                            // reassign env vars because the config change occurs in the same run in registration.
                            const {
                                Environment: {
                                    Variables
                                }
                            } = newConfig;

                            Object.assign(process.env, Variables);
                            this._azcollectc = new m_alCollector.AzcollectC(process.env.azollect_api, this._aimsc, this._collectorType);
                            this._ingestc = new m_alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
                        }

                        asyncCallback(null);
                    });
                } else{
                    asyncCallback(null);
                }
            },
            (asyncCallback) => {
                if (!process.env.collector_id || process.env.collector_id === 'none') {
                    this._azcollectc.register(regValues)
                        .then(resp => {
                            const newCollectorId = resp.collector ? resp.collector.id : 'none';
                            return m_alAws.setEnv({ collector_id: newCollectorId }, asyncCallback);
                        })
                        .catch(exception => {
                            return asyncCallback('AWSC0003 registration error: ' + exception);
                        });
                } else {
                    return asyncCallback(null);
                }
            }
        ],
        (err)=> {
            if(err){
                return response.send(event, context, response.FAILED, {Error: err});
            } else {
                return response.send(event, context, response.SUCCESS);
            }
        });
    }

    handleCheckin() {
        var collector = this;
        collector.checkin(function(err) {
            return collector.done(err);
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
                collector.getProperties(), checkinParts[0], checkinParts[1]
            );
            collector._azcollectc.checkin(checkin)
            .then(resp => {
                if(resp && resp.force_update === true){
                    console.info('AWSC0004 Force update');
                    return collector.update(callback);
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
        const regValues = Object.assign(this.getProperties(), custom);

        this._azcollectc.deregister(regValues)
            .then(resp => {
                return response.send(event, context, response.SUCCESS);
            })
            .catch(exception => {
                console.warn('AWSC0011 Collector deregistration failed. ', exception);
                // Respond with SUCCESS in order to delete CF stack with no issues.
                return response.send(event, context, response.SUCCESS);
            });
    }

    send(data, compress = true, callback) {
        var collector = this;
        
        if(!data){
            return callback(null);
        }
        if (compress) {
            zlib.deflate(data, function(compressionErr, compressed) {
                if (compressionErr) {
                    return callback(compressionErr);
                } else {
                    return collector._send(compressed, callback);
                }
            });
        } else {
            return collector._send(data, callback);
        }
    }
    
    _send(data, callback) {
        var collector = this;
        var ingestType = collector._ingestType;
        switch (ingestType) {
            case AlAwsCollector.IngestTypes.SECMSGS:
                collector._ingestc.sendSecmsgs(data)
                .then(resp => {
                    return callback(null, resp);
                })
                .catch(exception => {
                    return callback(exception);
                });
                break;
            case AlAwsCollector.IngestTypes.VPCFLOW:
                collector._ingestc.sendVpcFlow(data)
                .then(resp => {
                    return callback(null, resp);
                })
                .catch(exception => {
                    return callback(exception);
                });
                break;
            case AlAwsCollector.IngestTypes.LOGMSGS:
                collector._ingestc.sendLogmsgs(data)
                .then(resp => {
                    return callback(null, resp);
                })
                .catch(exception => {
                    return callback(exception);
                });
                break;
            default:
                return callback(`AWSC0005 Unknown Alertlogic ingestion type: ${ingestType}`);
        }
    }
    
    process(event, callback) {
        const context = this._invokeContext;
        var collector = this;
        async.waterfall([
            function(asyncCallback) {
                collector._formatFun(event, context, asyncCallback);
            },
            function(formattedData, compress, asyncCallback) {
                if(arguments.length === 2 && typeof compress === "function"){
                    asyncCallback = compress;
                    compress = true;
                } 
                collector.send(formattedData, compress, asyncCallback);
            }
        ],
        callback);
    }
    
    processLog(messages, formatFun, hostmetaElems, callback) {
        if(arguments.length === 3 && typeof hostmetaElems === "function"){
            callback = hostmetaElems;
            hostmetaElems = this._defaultHostmetaElems();
        } 
        var collector = this;
        
        if (messages && messages.length > 0) {
            m_alCollector.AlLog.buildPayload(
                    collector._collectorId, collector._collectorId, hostmetaElems, messages, formatFun, function(err, payload){
                if (err) {
                    return callback(err);
                } else {
                    return collector.send(payload, false, callback);
                }
            });
        } else {
            return callback(null, {});
        }
        
    }
    
    handleUpdate() {
        var collector = this;
        collector.update(function(err) {
            return collector.done(err);
        });
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
                console.info('AWSC0006 Lambda self-update config error: ', err);
            } else {
                if (config !== undefined) {
                    console.info('AWSC0007 Lambda self-update config successful. Config: ', config);
                } else {
                    console.info('AWSC0008 Lambda self-update config nothing to update');
                }
            }
            callback(err, config);
        });
    }
    
    handleEvent(event) {
        let collector = this;
        let context = this._invokeContext;
        switch (event.RequestType) {
        case 'ScheduledEvent':
            switch (event.Type) {
                case 'SelfUpdate':
                    return collector.handleUpdate();
                    break;
                case 'Checkin':
                    return collector.handleCheckin();
                    break;
                default:
                    return context.fail('AWSC0009 Unknown scheduled event detail type: ' + event.Type);
            }
        case 'Create':
            return collector.register(event, {});
        case 'Delete':
            return collector.deregister(event, {});
        default:
            return context.fail('AWSC0012 Unknown event:' + event);
        }
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
            return callback('AWSC0010 Unable to apply new config values');
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
    
    _defaultHostmetaElems() {
        return [
          {
            key: 'host_type',
            value: {str: 'lambda'}
          },
          {
            key: 'local_hostname',
            value: {str: process.env.AWS_LAMBDA_FUNCTION_NAME}
          }
        ];
    }
}

module.exports = AlAwsCollector;
