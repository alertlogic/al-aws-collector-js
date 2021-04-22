/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Base class for AWS Lambda based collectors.
 *
 * Last message ID: AWSC0016
 * @end
 * -----------------------------------------------------------------------------
 */
'use strict';

const util = require('util');
const AWS = require('aws-sdk');
const moment = require('moment');
const zlib = require('zlib');
const async = require('async');
const response = require('cfn-response');
const deepEqual = require('deep-equal');

const m_alCollector = require('@alertlogic/al-collector-js');
const m_alAws = require('./al_aws');
const m_healthChecks = require('./health_checks');
const m_alStatsTmpls = require('./statistics_templates');

var AIMS_DECRYPTED_CREDS = null;

const AL_SERVICES = ['ingest', 'azcollect'];

const NOUPDATE_CONFIG_PARAMS = [
    'FunctionArn',
    'Role',
    'CodeSize',
    'LastModified',
    'CodeSha256',
    'Version',
    'MasterArn',
    'RevisionId',
    'State',
    'StateReason',
    'StateReasonCode',
    'LastUpdateStatus',
    'LastUpdateStatusReason',
    'LastUpdateStatusReasonCode'
];

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
 * @param {Array} streams - List of stream from collector
 */
class AlAwsCollector {
    static get IngestTypes() {
        return {
            SECMSGS : 'secmsgs',
            VPCFLOW : 'vpcflow',
            LOGMSGS : 'logmsgs',
            LMCSTATS: 'lmcstats'
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
            formatFun, healthCheckFuns, statsFuns, streams = []) {
        this._invokeContext = context;
        this._arn = context.invokedFunctionArn;
        this._awsAccountId = m_alAws.arnToAccId(context.invokedFunctionArn);
        this._collectorType = collectorType;
        this._ingestType = ingestType;
        this._version = version;
        this._region = process.env.AWS_REGION;
        this._name = process.env.AWS_LAMBDA_FUNCTION_NAME;
        this._alDataResidency = 
            process.env.al_data_residency ?
                process.env.al_data_residency :
                'default';
        this._alAzcollectEndpoint = process.env.azcollect_api;
        this._aimsc = new m_alCollector.AimsC(process.env.al_api, aimsCreds, null, null, process.env.customer_id);
        this._endpointsc = new m_alCollector.EndpointsC(process.env.al_api, this._aimsc);
        this._azcollectc = new m_alCollector.AzcollectC(process.env.azcollect_api, this._aimsc, 'aws', collectorType);
        this._ingestc = new m_alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
        this._formatFun = formatFun;
        this._customHealthChecks = healthCheckFuns;
        this._customStatsFuns = statsFuns;
        this._collectorId = process.env.collector_id;
        this._stackName = process.env.stack_name;
        this._applicationId = process.env.al_application_id;
        this._streams = streams;
    }
    
    set context (context) {
        this._invokeContext = context;
    }
    get context () {
        return this._invokeContext;
    }
    
    get registered () {
        return this._collectorId != undefined && 
            this._collectorId != '' &&
            this._collectorId != 'none';
    }
    
    get application_id () {
        return this._applicationId;
    };

    get aws_account_id () {
        return this._awsAccountId;
    }

    get cid () {
        return this._aimsc.cid;
    }

    get collector_id () {
        return this._collectorId;
    }
    
    set streams (streams) {
        this._streams = streams;
    }
    get streams () {
        return this._streams;
    }


    done(error , streamType) {
        let context = this._invokeContext;
        if (error) {
            // The lambda context tries to stringify errors, 
            // so we should check if they can be stringified before we pass them to the context
            let errorString;
            try{
                errorString = JSON.stringify(error);
            }
            catch (stringifyError){
                // Can't stringify the whole error, so lets try and get some useful info from it
                errorString = error.toJSON ? error.toJSON() :
                    error.message ? error.message :
                        // when all else fails, stringify it the gross way with inspect
                        util.inspect(error);
            }
            // post stream specific error
            const status = streamType ? this.prepareErrorStatus(errorString, 'none', streamType) : this.prepareErrorStatus(errorString);
            this.sendStatus(status, () => {
                context.fail(errorString);
            });
        } else {
            return context.succeed();
        }
    }
    prepareHealthyStatus(streamName = 'none', collectionType) {
        return {
            stream_name: streamName,
            status_type: 'ok',
            stream_type: 'status',
            message_type: 'collector_status',
            host_uuid: this._collectorId,
            data: [],
            agent_type: this._collectorType,
            collection_type: collectionType ? collectionType : this._ingestType,
            timestamp: moment().unix()
        };
    }
    
    prepareErrorStatus(errorString, streamName = 'none', collectionType, errorCode) {
        let cType = collectionType ? collectionType : this._ingestType;
        let errorData = errorCode ? 
            [
                {error: errorString},
                {code: errorCode}
            ] :
            [
                {error: errorString}
            ];
        return {
            stream_name: streamName,
            status_type: 'error',
            stream_type: 'status',
            message_type: 'collector_status',
            host_uuid: this._collectorId,
            data: errorData,
            agent_type: this._collectorType,
            collection_type: cType,
            timestamp: moment().unix()
        };
    }

    
    getProperties() {
        return {
            awsAccountId : this._awsAccountId,
            region : this._region,
            functionName : this._name,
            version : this._version,
            dataType : this._ingestType,
            collectorId : this._collectorId,
            stackName : this._stackName,
            applicationId : this._applicationId
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
                        azcollect_api : mapResult[1].azcollect
                    };
                    return m_alAws.setEnv(endpoints, callback);
                }
            }
        );
    }
    
    registerSync(event, custom) {
        this.register(event, custom, (err) => {
            if(err){
                return response.send(event, this.context, response.FAILED, {Error: err});
            } else {
                return response.send(event, this.context, response.SUCCESS);
            }
        });
    }
    
    register(event, custom, callback) {
        let regValues = Object.assign(this.getProperties(), custom);
        regValues.stackName = event && event.ResourceProperties ? 
                event.ResourceProperties.StackName : regValues.stackName;

        async.waterfall([
            (asyncCallback) => {
                const {
                    azcollect_api,
                    ingest_api
                } = process.env;

                if(!azcollect_api || !ingest_api || azcollect_api === "undefined" || ingest_api === "undefined"){
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
                            this._azcollectc = new m_alCollector.AzcollectC(process.env.azcollect_api, this._aimsc, 'aws', this._collectorType);
                            this._ingestc = new m_alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
                        }

                        asyncCallback(null);
                    });
                } else{
                    asyncCallback(null);
                }
            },
            (asyncCallback) => {
                this._azcollectc.register(regValues)
                    .then(resp => {
                        const newCollectorId = resp.collector ? resp.collector.id : 'none';
                        return m_alAws.setEnv({ collector_id: newCollectorId }, asyncCallback);
                    })
                    .catch(exception => {
                        return asyncCallback('AWSC0003 registration error: ' + exception);
                    });
            }
        ],
        callback);
    }

    handleCheckin() {
        var collector = this;
        async.waterfall([
            function (asyncCallback) {
                const {
                    azcollect_api,
                    ingest_api
                } = process.env;

                if (!azcollect_api || !ingest_api || azcollect_api === "undefined" || ingest_api === "undefined") {
                    // handling errors like this because the other unit tests seem to indicate that
                    // the collector should handle check in even if there is an error in getting the endpoints.
                    collector.updateEndpoints((err, newConfig) => {
                        if (err) {
                            console.warn('AWSC0014 Error updating endpoints', err);
                        } else {
                            // reassign env vars because the config change occurs in the same run in handle check in.
                            const {
                                Environment: {
                                    Variables
                                }
                            } = newConfig;

                            Object.assign(process.env, Variables);
                            collector._azcollectc = new m_alCollector.AzcollectC(process.env.azcollect_api, collector._aimsc, 'aws', collector._collectorType);
                            collector._ingestc = new m_alCollector.IngestC(process.env.ingest_api, collector._aimsc, 'lambda_function');
                        }

                        asyncCallback(null);
                    });
                } else {
                    asyncCallback(null);
                }
            },
            function (asyncCallback) {
                if (!collector.registered) {
                    collector.register(undefined, undefined, (err) => {
                        return asyncCallback(err);
                    });
                } else {
                    return asyncCallback();
                }
            },
            function (asyncCallback) {
                return collector.checkin(asyncCallback);
            }
        ], function (err) {
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
                collector.getHealthStatus(context, checks, function(err, healthStatus) {
                    return asyncCallback(null, healthStatus);
                });
            },
            function(asyncCallback) {
                collector.getStatistics(context, statsFuns, function(err, statistics) {
                    return asyncCallback(null, statistics);
                });
            }
        ],
        function(err, checkinParts) {

            const invocationStatsDatapoints = checkinParts[1].statistics[0].Datapoints ? checkinParts[1].statistics[0].Datapoints : checkinParts[1].statistics;
            const errorStatsDatapoints = checkinParts[1].statistics[1].Datapoints ? checkinParts[1].statistics[1].Datapoints : checkinParts[1].statistics ;
            const collectorStreams = collector._streams;

            if (checkinParts[0].status === 'ok' && invocationStatsDatapoints.length > 0 && invocationStatsDatapoints[0].Sum > 0
                && errorStatsDatapoints.length > 0 && errorStatsDatapoints[0].Sum === 0) {

                let streamSpecificStatus = [];
                if (Array.isArray(collectorStreams) && collectorStreams.length > 0) {
                    collectorStreams.map(streamType => {
                        let okStatus = collector.prepareHealthyStatus('none', `${collector._applicationId}_${streamType}`);
                        streamSpecificStatus.push(okStatus);
                    });
                } else {
                    let okStatus = collector.prepareHealthyStatus();
                    streamSpecificStatus.push(okStatus);
                }
                // make api call to send status ok
                collector.sendStatus(streamSpecificStatus, () => {
                    return context.succeed();
                });
            }
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
    
    getHealthStatus(context, customChecks, callback) {
        let collector = this;
        const appliedHealthChecks = customChecks.map(check => check.bind(this));
        async.parallel([
            function(asyncCallback) {
                m_healthChecks.checkCloudFormationStatus(collector._stackName, asyncCallback);
            }
        ].concat(appliedHealthChecks),
        function(errMsg) {
            var status = {};
            if (errMsg) {
                console.warn('ALAWS00001 Health check failed with',  errMsg);
                status = {
                    status: errMsg.status,
                    error_code: errMsg.code,
                    details: [errMsg.details]
                };
            } else {
                status = {
                    status: 'ok',
                    details: []
                };
            }
            return callback(null, status);
        });
    }

    getStatistics(context, statsFuns, callback) {
        const appliedStatsFuns = statsFuns.map(fun => fun.bind(this));
        var allFuns = [
            function(asyncCallback) {
                return m_alStatsTmpls.getLambdaMetrics(
                    context.functionName, 'Invocations', asyncCallback
                );
            },
            function(asyncCallback) {
                return m_alStatsTmpls.getLambdaMetrics(
                    context.functionName, 'Errors', asyncCallback
                );
            }
        ].concat(appliedStatsFuns);
        async.parallel(allFuns,
            function(err, res) {
                if (err) {
                    return callback(null, {statistics : []});
                } else {
                    return callback(null, {statistics : res});
                }
            }
        );
    }

    deregisterSync(event, custom) {
        this.deregister(event, custom, () => {
            // Respond with SUCCESS in order to delete CF stack with no issues.
            return response.send(event, this.context, response.SUCCESS);
        });
    }

    deregister(event, custom, callback) {
        const context = this._invokeContext;
        let regValues = Object.assign(this.getProperties(), custom);
        regValues.stackName = event && event.ResourceProperties ? 
                event.ResourceProperties.StackName : regValues.stackName;

        this._azcollectc.deregister(regValues)
            .then(resp => {
                return callback(null, resp);
            })
            .catch(exception => {
                console.warn('AWSC0011 Collector deregistration failed. ', exception);
                return callback(exception);
            });
    }

    sendStatus(status, callback) {
        let collector = this;

        async.waterfall([
            (asyncCallback) => {
                const {
                    azcollect_api,
                    ingest_api
                } = process.env;
                if (!azcollect_api || !ingest_api || azcollect_api === "undefined" || ingest_api === "undefined") {
                    // handling errors like this because the other unit tests seem to indicate that
                    // the collector should send status even if there is an error in getting the endpoints.
                    collector.updateEndpoints((err, newConfig) => {
                        if (err) {
                            console.warn('AWSC0016 Error updating endpoints', err);
                        } else {
                            // reassign env vars because the config change occurs in the same run in sending status.
                            const {
                                Environment: {
                                    Variables
                                }
                            } = newConfig;
                            Object.assign(process.env, Variables);
                            collector._azcollectc = new m_alCollector.AzcollectC(process.env.azcollect_api, collector._aimsc, 'aws', collector._collectorType);
                            collector._ingestc = new m_alCollector.IngestC(process.env.ingest_api, collector._aimsc, 'lambda_function');
                        }
                        asyncCallback(null);
                    });
                } else {
                    asyncCallback(null);
                }
            },
            (asyncCallback) => {
                if (!status || !collector.registered) {
                    return asyncCallback(null);
                } else {
                    let collectorStatus = Array.isArray(status) ? status : [status];
                    zlib.deflate(JSON.stringify(collectorStatus), (compressionErr, compressed) => {
                        if (compressionErr) {
                            return asyncCallback(compressionErr);
                        } else {
                            collector._ingestc.sendAgentstatus(compressed)
                                .then(resp => {
                                    return asyncCallback(null, resp);
                                })
                                .catch(exception => {
                                    console.warn('AWSC0013 Collector status send failed: ', exception);
                                    return asyncCallback(exception);
                                });
                        }
                    });
                }
            }
        ],
            callback);
    }
    
    send(data, compress = true, ingestType, callback) {
        var collector = this;
        async.waterfall([
            (asyncCallback) => {
                const {
                    azcollect_api,
                    ingest_api
                } = process.env;
                if (!azcollect_api || !ingest_api || azcollect_api === "undefined" || ingest_api === "undefined") {
                    // handling errors like this because the other unit tests seem to indicate that
                    // the collector should send data even if there is an error in getting the endpoints.
                    collector.updateEndpoints((err, newConfig) => {
                        if (err) {
                            console.warn('AWSC0015 Error updating endpoints', err);
                        } else {
                            // reassign env vars because the config change occurs in the same run in sending data.
                            const {
                                Environment: {
                                    Variables
                                }
                            } = newConfig;
                            Object.assign(process.env, Variables);
                            collector._azcollectc = new m_alCollector.AzcollectC(process.env.azcollect_api, collector._aimsc, 'aws', collector._collectorType);
                            collector._ingestc = new m_alCollector.IngestC(process.env.ingest_api, collector._aimsc, 'lambda_function');
                        }
                        asyncCallback(null);
                    });
                } else {
                    asyncCallback(null);
                }
            },
            (asyncCallback) => {
                if (!data) {
                    return asyncCallback(null);
                }
                if (compress) {
                    zlib.deflate(data, function (compressionErr, compressed) {
                        if (compressionErr) {
                            return asyncCallback(compressionErr);
                        } else {
                            return collector._send(compressed, ingestType, asyncCallback);
                        }
                    });
                } else {
                    return collector._send(data, ingestType, asyncCallback);
                }
            }
        ],
            callback);
    }
    
    _send(data, ingestType, callback) {
        var collector = this;
        var ingestType = ingestType ? ingestType : collector._ingestType;
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
            case AlAwsCollector.IngestTypes.LMCSTATS:
                collector._ingestc.sendLmcstats(data)
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
                if(arguments.length === 2 && typeof compress === 'function'){
                    asyncCallback = compress;
                    compress = true;
                } 
                collector.send(formattedData, compress, collector._ingestType, asyncCallback);
            }
        ],
        callback);
    }
    
    processLog(messages, formatFun, hostmetaElems, ingestType = '', callback) {
        if(arguments.length === 3 && typeof hostmetaElems === 'function'){
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
                    return collector.send(payload, false, ingestType,  callback);
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
                    asyncCallback();
                }
            }
        ],
        function(err, config) {
            if (err) {
                console.info('AWSC0006 Lambda self-update config error: ', err);
            } else {
                if (config !== undefined) {
                    console.info('AWSC0007 Lambda self-update config successful.');
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
            return collector.registerSync(event, {});
        case 'Delete':
            return collector.deregisterSync(event, {});
        default:
            return context.fail('AWSC0012 Unknown event:' + event);
        }
    }
    
    /**
     * To handle async event 
     * @param {*} event 
     */
    handleEventAsync(event) {
        return new Promise((resolve, reject) => {
            this.handleEvent(event, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            })
        });
    }
    _applyConfigChanges(newValues, config, callback) {
        var newConfig = {};
        Object.assign(newConfig, config);
        
        
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
            return callback(`AWSC0010 Unable to apply new config values ${ex}`);
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
        var newConfig = {};
        Object.assign(newConfig, config);
        // These are not either allowed to update or we don't have enough permission.
        NOUPDATE_CONFIG_PARAMS.forEach(p => delete newConfig[p]);
        if (newConfig.VpcConfig)
            delete newConfig.VpcConfig.VpcId;
        
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
