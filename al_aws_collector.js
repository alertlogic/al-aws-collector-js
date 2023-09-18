/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Base class for AWS Lambda based collectors.
 *
 * Last message ID: AWSC0017
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
const logger = require('./logger');

var AIMS_DECRYPTED_CREDS = null;

const AL_SERVICES = ['ingest', 'azcollect', 'collector_status'];

const NOUPDATE_CONFIG_PARAMS = [
    'Architectures',
    'CodeSha256',
    'CodeSize',
    'FunctionArn',
    'LastModified',
    'LastUpdateStatus',
    'LastUpdateStatusReason',
    'LastUpdateStatusReasonCode',
    'MasterArn',
    'OptimizationStatus',
    'PackageType',
    'RevisionId',
    'Role',
    'RuntimeVersionConfig',
    'State',
    'SnapStart',
    'StateReason',
    'StateReasonCode',
    'Version'
];


function getDecryptedCredentials(callback) {
    if (AIMS_DECRYPTED_CREDS) {
        return callback(null, AIMS_DECRYPTED_CREDS);
    } else {
        const kms = new AWS.KMS();
        kms.decrypt(
            {CiphertextBlob: Buffer.from(process.env.aims_secret_key, 'base64')},
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
        this._collectorStatusc = new m_alCollector.CollectorStatusC(process.env.collector_status_api, this._aimsc);
        this._formatFun = formatFun;
        this._customHealthChecks = healthCheckFuns;
        this._customStatsFuns = statsFuns;
        this._collectorId = process.env.collector_id;
        this._stackName = process.env.stack_name;
        this._applicationId = process.env.al_application_id;
        this._streams = streams;
        this._cloudwatch = new AWS.CloudWatch({ apiVersion: '2010-08-01' });
        this._controlSnsArn = process.env.al_control_sns_arn;
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


    done(error, streamType, sendStatus = true) {
        let context = this._invokeContext;
        if (error) {
            const errorString = this.stringifyError(error);
            // TODO: fix stream name reporting
            const stream = streamType ? streamType : this._applicationId ? this._applicationId : this._ingestType;
            const status = this.setCollectorStatus(stream, errorString);
            if (sendStatus) {
                this.sendCollectorStatus(stream, status, () => {
                    context.fail(errorString);
                });
            } else {
                context.fail(errorString);
            }
        } else {
            return context.succeed();
        }
    }

    setCollectorStatus(collectorStream, errorString, errorCode) {
        const stream = collectorStream ? collectorStream : this._applicationId;
        const status = errorString ? 'error' : 'ok'
        let collectorStatusData = {
            status: status,
            inst_type: 'collector',
            stream: stream,
            status_id: this._collectorId,
            timestamp: moment().valueOf(),
            reported_by: this._collectorType,
            collection_type: this._applicationId
        }

        if (errorString) {
            const errorData = errorCode ?
                [
                    { error: errorString },
                    { code: errorCode }
                ] :
                [
                    { error: errorString }
                ];
            collectorStatusData.errorinfo = {
                details: errorData
            }
        }
        return collectorStatusData;
    }

    stringifyError(error) {
        // The lambda context tries to stringify errors, 
        // so we should check if they can be stringified before we pass them to the context
        if (typeof error === 'string') {
            return error;
        } else {
            try{
                return JSON.stringify(error);
            }
            catch (stringifyError){
                // Can't stringify the whole error, so lets try and get some useful info from it
                return error.toJSON ? error.toJSON() :
                    error.message ? error.message :
                        // when all else fails, stringify it the gross way with inspect
                        util.inspect(error);
            }
        }
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
                        ingest_api: mapResult[0].ingest,
                        azcollect_api: mapResult[1].azcollect,
                        collector_status_api: mapResult[2].collector_status
                    };
                    return m_alAws.setEnv(endpoints, callback);
                }
            }
        );
    }
    
    registerSync(event, custom) {
        this.register(event, custom, (err) => {
            if(err){
                logger.error('AWSC0017 Collector registration failed.')
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
                this.updateApiEndpoint((err) => {
                    return asyncCallback(err);
                })
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
                collector.updateApiEndpoint((err) => {
                    return asyncCallback(err);
                })
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
        function (err, checkinParts) {
            const invocationStatsDatapoints = checkinParts[1].statistics[0].Datapoints ? checkinParts[1].statistics[0].Datapoints : checkinParts[1].statistics;
            const errorStatsDatapoints = checkinParts[1].statistics[1].Datapoints ? checkinParts[1].statistics[1].Datapoints : checkinParts[1].statistics;
            const collectorStreams = collector._streams;
            async.parallel([
                function (asyncCallback) {
                    if (checkinParts[0].status === 'ok' && invocationStatsDatapoints.length > 0 && invocationStatsDatapoints[0].Sum > 0
                        && errorStatsDatapoints.length > 0 && errorStatsDatapoints[0].Sum === 0) {
                        if (Array.isArray(collectorStreams) && collectorStreams.length > 0) {
                            async.map(collectorStreams,
                                function (streamType, eachCallback) {
                                    let okStatus = collector.setCollectorStatus(streamType);
                                    collector.sendCollectorStatus(streamType, okStatus, (err, res) => {
                                        eachCallback(err, res);
                                    });
                                },
                                function (mapErr, mapResult) {
                                    if (mapErr) {
                                        logger.warn(`AWSC00021 Collector failed to update the status ${mapErr}`);
                                    } 
                                    return asyncCallback(null);
                                }
                            );
                        } else {
                            const stream = collector._applicationId ? collector._applicationId : collector._ingestType;
                            let okStatus = collector.setCollectorStatus(stream);
                            // make api call to send status ok
                            collector.sendCollectorStatus(stream, okStatus, () => {
                                return asyncCallback(null);
                            });
                        }
                    }
                    else {
                        return asyncCallback(null);
                    }
                },
                function (asyncCallback) {
                    const checkin = Object.assign(
                        collector.getProperties(), checkinParts[0], checkinParts[1]
                    );
                    collector._azcollectc.checkin(checkin)
                        .then(resp => {
                            if (resp && resp.force_update === true) {
                                logger.info('AWSC0004 Force update');
                                collector.update(asyncCallback);
                            }
                            else {
                                return asyncCallback(null);
                            }
                        })
                        .catch(exception => {
                            return asyncCallback(exception);
                        });
                }
            ], callback);
        });
    }
    
    getHealthStatus(context, customChecks, callback) {
        let collector = this;
        const appliedHealthChecks = customChecks.map(check => check.bind(this));
        async.parallel(
            appliedHealthChecks,
            function (errMsg) {
                var status = {};
                if (errMsg) {
                    logger.warn('ALAWS00001 Health check failed with', errMsg);
                    status = {
                        status: errMsg.status,
                        error_code: errMsg.code,
                        details: { error: { text: errMsg.details } }
                    };
                } else {
                    status = {
                        status: 'ok',
                        details: {}
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
                logger.warn(`AWSC0011 Collector deregistration failed. ${exception}`);
                return callback(exception);
            });
    }

    /**
     * Function update endpoint api for different AL service if it is not available in env variable.
     * @param {*} asyncCallback 
     * @returns 
     */
    updateApiEndpoint(asyncCallback) {
        const collector = this;
        const {
            azcollect_api,
            ingest_api,
            collector_status_api
        } = process.env;
        if (!azcollect_api || !ingest_api || !collector_status_api || azcollect_api === "undefined" || ingest_api === "undefined" || collector_status_api === "undefined") {
            // handling errors like this because the other unit tests seem to indicate that
            // the collector should send status even if there is an error in getting the endpoints.
            collector.updateEndpoints((err, newConfig) => {
                if (err) {
                    logger.warn(`AWSC0014 Error updating endpoints ${err}`);
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
                    collector._collectorStatusc = new m_alCollector.CollectorStatusC(process.env.collector_status_api, collector._aimsc)
                }
                return asyncCallback(null);
            });
        } else {
            return asyncCallback(null);
        }
    }

    /**
     * Send the status to collector_status service
     * @param {*} collectorStatusStream - Collector those having streams use that else stream will be application_id
     * @param {*} status -It's a json object form using setCollectorStatus function
     * @param {*} callback 
     */
    sendCollectorStatus(collectorStatusStream, status, callback) {
        let collector = this;
        async.waterfall([
            (asyncCallback) => {
                collector.updateApiEndpoint((err) => {
                    return asyncCallback(err);
                })
            },
            (asyncCallback) => {
                // collector_id, stream and status object all are requied property for sending the status to collectors_status service; return null without throwing error.
                if (!status || !collector.registered || collector._collectorId == 'NA' || !collectorStatusStream) {
                    return asyncCallback(null);
                } else {
                    collector._collectorStatusc.sendStatus(collector.collector_id, collectorStatusStream, status)
                        .then(resp => {
                            return asyncCallback(null, resp);
                        })
                        .catch(exception => {
                            if (exception.response.status === 304) {
                                return asyncCallback(null);
                            }
                            else {
                                logger.warn(`AWSC0015 Collector status send failed: ${exception.message}`);
                                logger.debug(exception);
                                return asyncCallback(exception.message);
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
                collector.updateApiEndpoint((err) => {
                    return asyncCallback(err);
                });
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
                    const error = m_healthChecks.formatError('AWSC0020', exception, AlAwsCollector.IngestTypes.VPCFLOW);
                    return callback(error);
                });
                break;
            case AlAwsCollector.IngestTypes.LOGMSGS:
                collector._ingestc.sendLogmsgs(data)
                .then(resp => {
                    return callback(null, resp);
                })
                .catch(exception => {
                    logger.debug(exception);
                    const error = m_healthChecks.formatError('AWSC0018', exception, AlAwsCollector.IngestTypes.LOGMSGS);
                    return callback(error);
                });
                break;
            case AlAwsCollector.IngestTypes.LMCSTATS:
                collector._ingestc.sendLmcstats(data)
                .then(resp => {
                    return callback(null, resp);
                })
                .catch(exception => {
                    logger.debug(exception);
                    const error = m_healthChecks.formatError('AWSC0019', exception, AlAwsCollector.IngestTypes.LMCSTATS);
                    return callback(error);
                });
                break;
            default:
                return callback(`AWSC0005 Unknown Alertlogic ingestion type: ${ingestType}`);
        }
    }

    prepareLmcStats(event_count, byte_count) {
        return {
            inst_type: 'collector',
            appliance_id: '',
            source_type: this._collectorType,
            source_id: this._collectorId,
            host_id: this._collectorId,
            event_count: event_count,
            byte_count: byte_count,
            application_id: this._applicationId,
            timestamp: moment().unix()
        };
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
    
    processLog(messages, formatFun, hostmetaElems, callback) {
        if(arguments.length === 3 && typeof hostmetaElems === 'function'){
            callback = hostmetaElems;
            hostmetaElems = this._defaultHostmetaElems();
        } 
        var collector = this;
        
        if (messages && messages.length > 0) {
            async.waterfall([
                function (asyncCallback) {
                    let buildPayloadObj = {
                        hostId: collector._collectorId, 
                        sourceId: collector._collectorId, 
                        hostmetaElems: hostmetaElems, 
                        content: messages, 
                        parseCallback: formatFun, 
                        filterJson: '', 
                        filterRegexp: ''
                    };
                   //TODO: We need to take pass filter parameters filterJson, filterRegexp via collector obj or env vars
                    m_alCollector.AlLog.buildPayload(
                        buildPayloadObj, (err, payloadObj) => {
                            return asyncCallback(err, payloadObj);
                        });
                },
                function (payloadObj, asyncCallback) {
                    collector.send(payloadObj.payload, false, AlAwsCollector.IngestTypes.LOGMSGS, (err, res) => {
                        return asyncCallback(err, payloadObj);
                    });
                },
                function (payloadObj, asyncCallback) {
                    const stats = collector.prepareLmcStats(payloadObj.raw_count, payloadObj.raw_bytes);
                    return collector.send(JSON.stringify([stats]), true, AlAwsCollector.IngestTypes.LMCSTATS, asyncCallback);
                }
            ], callback);
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
                logger.info(`AWSC0006 Lambda self-update config error: ${err}`);
            } else {
                if (config !== undefined) {
                    logger.info('AWSC0007 Lambda self-update config successful.');
                } else {
                    logger.info('AWSC0008 Lambda self-update config nothing to update');
                }
            }
            callback(err, config);
        });
    }
    
    handleEvent(event) {
        let collector = this;
        let context = this._invokeContext;
        let parsedEvent = collector._parseEvent(event);

        switch (parsedEvent.RequestType) {
        case 'ScheduledEvent':
            switch (parsedEvent.Type) {
                case 'SelfUpdate':
                    return collector.handleUpdate();
                    break;
                case 'Checkin':
                    return collector.handleCheckin();
                    break;
                default:
                    return context.fail('AWSC0009 Unknown scheduled event detail type: ' + parsedEvent.Type);
            }
        case 'Create':
            return collector.registerSync(event, {});
        case 'Delete':
            return collector.deregisterSync(event, {});
        default:
            return context.fail('AWSC0012 Unknown event:' + JSON.stringify(event));
        }
    }

    /**
     * Control events like checkin/update may be coming directly from CloudWatch
     * and have been sent via SNS.
     * @param {*} event
     */
    _parseEvent(event) {
        let collector = this;
        if (event.RequestType) {
            return event;
        } else if (event.Records) {
            let snsControlEvents = event.Records.filter((rec) => {
                return rec.EventSource === 'aws:sns' &&
                    rec.Sns.TopicArn === collector._controlSnsArn;
            });

            if (snsControlEvents[0] && snsControlEvents[0].Sns.Message) {
                return JSON.parse(snsControlEvents[0].Sns.Message);
            } else {
                return event;
            }
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

/**
 * 
 * @param {Object} param - Its JSON object with  metricName, namespace, standardUnit and unitValue
 * param = {
 * metricName :'custom metrics'
 * nameSpace : 'PAWSCollector',
 * standardUnit: 'Count',
 * unitValue :1
 * }
 * @param {*} callback 
 * @returns 
 */
    reportCWMetric(param, callback) {
        const params = {
            MetricData: [
                {
                    MetricName: param.metricName,
                    Dimensions: [
                        {
                            Name: 'CollectorType',
                            Value: this._collectorType
                        },
                        {
                            Name: 'FunctionName',
                            Value: this._name
                        }
                    ],
                    Timestamp: new Date(),
                    Unit: param.standardUnit,
                    Value: param.unitValue
                }
            ],
            Namespace: param.nameSpace
        };
        return this._cloudwatch.putMetricData(params, callback);
    }
}

module.exports = AlAwsCollector;
