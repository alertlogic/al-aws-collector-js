

const { TextDecoder, inspect } = require('util');
const alUttil = require('./util');
const {
    CloudWatch
} = require("@aws-sdk/client-cloudwatch"),
    {
        KMS
    } = require("@aws-sdk/client-kms");
const moment = require('moment');
const zlib = require('zlib');
const response = require('cfn-response');
const deepEqual = require('deep-equal');

const alCollector = require('@alertlogic/al-collector-js');
const alAwsCommon = require('./al_aws_common');
const alAwsStatsTmpls = require('./al_aws_stats_templates');
const logger = require('../logger');

// declare const here
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

/**
 * 
 * @returns decrypted AIMS credentials
 */
async function getDecryptedCredentialsAsync() {
    if (AIMS_DECRYPTED_CREDS) {
        return AIMS_DECRYPTED_CREDS;
    }
    else {
        const kms = new KMS();
        try {
            const data = await kms.decrypt(
                { CiphertextBlob: Buffer.from(process.env.aims_secret_key, 'base64') }
            );
            AIMS_DECRYPTED_CREDS = {
                access_key_id: process.env.aims_access_key_id,
                secret_key: new TextDecoder("utf-8").decode(data.Plaintext)
            };
            return AIMS_DECRYPTED_CREDS;
        } catch (error) {
            logger.error(`AWSC0022 Error decrypting AIMS credentials: ${error.message}`);
            throw error;
        }
    }
}

class AlAwsCollectorV2 {

    static get IngestTypes() {
        return {
            SECMSGS: 'secmsgs',
            VPCFLOW: 'vpcflow',
            LOGMSGS: 'logmsgs',
            LMCSTATS: 'lmcstats'
        };
    }

    static async load() {
        return await getDecryptedCredentialsAsync();
    }

    constructor(context, collectorType, ingestType, version, aimsCreds,
        formatFun, healthCheckFuns, statsFuns, streams = []) {
        this._invokeContext = context;
        this._arn = context.invokedFunctionArn;
        this._awsAccountId = alAwsCommon.arnToAccId(context.invokedFunctionArn);
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
        this._aimsc = new alCollector.AimsC(process.env.al_api, aimsCreds, null, null, process.env.customer_id);
        this._endpointsc = new alCollector.EndpointsC(process.env.al_api, this._aimsc);
        this._azcollectc = new alCollector.AzcollectC(process.env.azcollect_api, this._aimsc, 'aws', collectorType);
        this._ingestc = new alCollector.IngestC(process.env.ingest_api, this._aimsc, 'lambda_function');
        this._collectorStatusc = new alCollector.CollectorStatusC(process.env.collector_status_api, this._aimsc);
        this._formatFun = formatFun;
        this._customHealthChecks = healthCheckFuns;
        this._customStatsFuns = statsFuns;
        this._collectorId = process.env.collector_id;
        this._stackName = process.env.stack_name;
        this._applicationId = process.env.al_application_id;
        this._streams = streams;
        this._cloudwatch = new CloudWatch({ apiVersion: '2010-08-01' });
        this._controlSnsArn = process.env.al_control_sns_arn;
    }

    set context(context) {
        this._invokeContext = context;
    }
    get context() {
        return this._invokeContext;
    }

    get registered() {
        return this._collectorId != undefined &&
            this._collectorId != '' &&
            this._collectorId != 'none';
    }

    get application_id() {
        return this._applicationId;
    }

    get aws_account_id() {
        return this._awsAccountId;
    }

    get cid() {
        return this._aimsc.cid;
    }

    get collector_id() {
        return this._collectorId;
    }

    set streams(streams) {
        this._streams = streams;
    }
    get streams() {
        return this._streams;
    }

    /**
     * It finalizes the lambda execution by calling context.succeed or context.fail
     * @param {*} error 
     * @param {*} streamType 
     * @param {*} sendStatus 
     * @returns 
     */
    async done(error, streamType, sendStatus = true) {
        let context = this._invokeContext;
        if (error) {
            const errorString = this.stringifyError(error);
            const stream = streamType ? streamType : this._applicationId ? this._applicationId : this._ingestType;
            const status = this.setCollectorStatus(stream, errorString);
            if (sendStatus) {
                await this.sendCollectorStatus(stream, status);
                context.fail(errorString);
            } else {
                context.fail(errorString);
            }
        } else {
            return context.succeed();
        }
    }
    /**
     * Set the collector status object to be sent to collector_status service
     * @param {*} collectorStream 
     * @param {*} errorString 
     * @param {*} errorCode 
     * @returns 
     */
    setCollectorStatus(collectorStream, errorString, errorCode) {
        const stream = collectorStream ? collectorStream : this._applicationId;
        const status = errorString ? 'error' : 'ok';
        let collectorStatusData = {
            status: status,
            inst_type: 'collector',
            stream: stream,
            status_id: this._collectorId,
            timestamp: moment().valueOf(),
            reported_by: this._collectorType,
            collection_type: this._applicationId
        };

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
            };
        }
        return collectorStatusData;
    }

    stringifyError(error) {
        // The lambda context tries to stringify errors, 
        // so we should check if they can be stringified before we pass them to the context
        if (typeof error === 'string') {
            return error;
        } else {
            try {
                return JSON.stringify(error);
            }
            catch (stringifyError) {
                // Can't stringify the whole error, so lets try and get some useful info from it
                return error.toJSON ? error.toJSON() : error.message ? error.message : inspect(error);
            }
        }
    }


    getProperties() {
        return {
            awsAccountId: this._awsAccountId,
            region: this._region,
            functionName: this._name,
            version: this._version,
            dataType: this._ingestType,
            collectorId: this._collectorId,
            stackName: this._stackName,
            applicationId: this._applicationId
        };
    }

    async updateApiEndpoints() {
        var collector = this;
        try {
            const mapResult = await Promise.all(AL_SERVICES.map(service => collector._endpointsc.getEndpoint(service, collector._alDataResidency)));
            var endpoints = {
                ingest_api: mapResult[0].ingest,
                azcollect_api: mapResult[1].azcollect,
                collector_status_api: mapResult[2].collector_status
            };
            return await alAwsCommon.setEnvAsync(endpoints);
        } catch (error) {
            throw new Error(`AWSC0001 Endpoint update failure ${error}`);
        }
    }
    /**
     * Register the collector in azcollect and assets service and return cfn response
     * @param {*} event 
     * @param {*} custom 
     * @returns 
     */
    async registerSync(event, custom) {

        try {
            await this.register(event, custom);
            return response.send(event, this.context, response.SUCCESS);
        } catch (error) {
            logger.error('AWSC0017 Collector registration failed.');
            return response.send(event, this.context, response.FAILED, { Error: error });
        }
    }

    async register(event, custom) {
        let regValues = { ...this.getProperties(), ...custom };
        regValues.stackName = event && event.ResourceProperties ?
            event.ResourceProperties.StackName : regValues.stackName;

        try {
            await this.updateApiEndpoints();
            const azCollectResponse = await this._azcollectc.register(regValues);
            const newCollectorId = azCollectResponse.collector ? azCollectResponse.collector.id : 'none';
            await alAwsCommon.setEnvAsync({ collector_id: newCollectorId });
            return newCollectorId;
        } catch (error) {
            throw new Error('AWSC0003 registration error: ' + error);
        }
    }

    async handleCheckin() {
        var collector = this;
        try {
            await collector.updateApiEndpoints();
            if (!collector.registered) {
                await collector.register(undefined, undefined);
            }
            return await collector.checkin();
        } catch (error) {
            return collector.done(error);
        }

    }
    /**
     * Checkin the collector status and statistics and send it to azcollect service in every checkin interval
     */
    async checkin() {
        var collector = this;
        const context = this._invokeContext;
        const checks = this._customHealthChecks;
        const statsFuns = this._customStatsFuns;
        const collectorStreams = this._streams;
        let allFunctions = [
            collector.getHealthStatus(context, checks),
            collector.getStatistics(context, statsFuns)
        ];

        try {
            const [healthStatus, statisticsObj] = await Promise.all(allFunctions);
            const statistics = statisticsObj.statistics;

            // Extract datapoints
            const invocationStatsDatapoints = statistics[0]?.Datapoints || statistics;
            const errorStatsDatapoints = statistics[1]?.Datapoints || statistics;
            if (healthStatus.status === 'ok' && invocationStatsDatapoints.length > 0 && invocationStatsDatapoints[0].Sum > 0 && errorStatsDatapoints.length > 0 && errorStatsDatapoints[0].Sum === 0) {
                if (Array.isArray(collectorStreams) && collectorStreams.length > 0) {
                    await Promise.all(collectorStreams.map(async (streamType) => {
                        let okStatus = collector.setCollectorStatus(streamType);
                        await collector.sendCollectorStatus(streamType, okStatus);
                    }));
                } else {
                    const stream = collector._applicationId ? collector._applicationId : collector._ingestType;
                    let okStatus = collector.setCollectorStatus(stream);
                    // make api call to send status ok
                    await collector.sendCollectorStatus(stream, okStatus);
                }
            }
            const checkin = Object.assign(
                collector.getProperties(), healthStatus, { statistics: statistics }
            );
            const resp = await collector._azcollectc.checkin(checkin);
            if (resp && resp.force_update === true) {
                logger.info('AWSC0004 Force update');
                await collector.update();
            }
        }
        catch (err) {
            throw err;
        }
    }

    /**
     * Return health status by executing custom health check functions and cloudformation stack status check
     * @param {*} context 
     * @param {*} customChecks 
     * @returns 
     */
    async getHealthStatus(context, customChecks) {

        const appliedHealthChecks = customChecks.map(check => check.bind(this));
        try {
            await Promise.all(appliedHealthChecks.map(fn => fn()));
            return {
                status: 'ok',
                details: {}
            };
        } catch (error) {
            logger.warn('ALAWS00001 Health check failed with', error.message);
            return {
                status: error?.status || 'error',
                error_code: error?.code,
                details: { error: { text: error?.details || error?.message || String(error) } }
            };
        }
    }
    /**
     * Get statistics data from AWS Cloudwatch Invocations and Errors and custom stats functions
     * @param {*} context 
     * @param {*} statsFuns 
     * @returns 
     */
    async getStatistics(context, statsFuns) {

        const appliedStatsFuns = statsFuns.map(fun => fun.bind(this));
        const allFuns = [
            async () => alAwsStatsTmpls.getLambdaMetrics(context.functionName, 'Invocations'),
            async () => alAwsStatsTmpls.getLambdaMetrics(context.functionName, 'Errors'),
            ...appliedStatsFuns
        ];
        try {
            const res = await Promise.all(allFuns.map(fn => fn()));
            return { statistics: res };
        } catch (error) {
            return { statistics: [] };
        }
    }
    /**
     * update the lambda function code and configuration if there is any change
     * @returns lambda update response or error
     */
    async update() {
        let collector = this;
        await collector.selfUpdate();
        if (process.env.aws_lambda_update_config_name) {
            return await collector.selfConfigUpdate();
        }
    }

    async selfUpdate() {
        return await alAwsCommon.selfUpdateAsync();
    }

    /**
     * Check for config changes in s3 bucket and update the lambda configuration
     * @returns updated lambda response or error
     */
    async selfConfigUpdate() {
        let collector = this;
        try {
            const newConfig = await alAwsCommon.getS3ConfigChangesAsync();
            const currentConfig = await alAwsCommon.getLambdaConfigAsync();
            const appliedConfig = collector._applyConfigChanges(newConfig, currentConfig);
            if (collector._isConfigDifferent(appliedConfig, currentConfig)) {
                let updateConfig = collector._filterDisallowedConfigParams(appliedConfig);
                const result = await alAwsCommon.updateLambdaConfigAsync(updateConfig);
                if (result) {
                    logger.info('AWSC0001 Lambda self-update config successful.');
                    return result;
                }
            } else {
                logger.info('AWSC0002 Lambda self-update config nothing to update');
            }
        } catch (error) {
            logger.error('AWSC0006 Lambda self-update config error:', error);
        }
    }

    _applyConfigChanges(newValues, config) {
        var newConfig = { ...config };
        try {
            Object.keys(newValues).forEach(
                function (item) {
                    let path = newValues[item].path;
                    let value = newValues[item].value;
                    this._changeObject(newConfig, path, value);
                }, this); //lexical scoping
            return newConfig;
        }
        catch (ex) {
            throw new Error(`AWSC0010 Unable to apply new config values ${ex}`);
        }
    }

    _isConfigDifferent(newConfig, currentConfig) {
        return !deepEqual(newConfig, currentConfig);
    }


    _filterDisallowedConfigParams(config) {
        const newConfig = { ...config };
        // These are not either allowed to update or we don't have enough permission.
        NOUPDATE_CONFIG_PARAMS.forEach(p => delete newConfig[p]);
        if (newConfig.VpcConfig && typeof newConfig.VpcConfig === 'object') {
            delete newConfig.VpcConfig.VpcId;
        }
        return newConfig;
    }

    _changeObject(obj, path, value) {
        if (typeof path == 'string') {
            return this._changeObject(obj, path.split('.'), value);
        }
        else if (path.length == 1) {
            obj[path[0]] = value;
            return obj;
        } else {
            return this._changeObject(obj[path[0]], path.slice(1), value);
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

    async handleEvent(event) {
        let collector = this;
        let context = this._invokeContext;
        let parsedEvent = collector._parseEvent(event);

        switch (parsedEvent.RequestType) {
            case 'ScheduledEvent':
                switch (parsedEvent.Type) {
                    case 'SelfUpdate':
                        return await collector.handleUpdate();
                    case 'Checkin':
                        return await collector.handleCheckin();
                    default:
                        return context.fail('AWSC0009 Unknown scheduled event detail type: ' + parsedEvent.Type);
                }
                break;
            case 'Create':
                return await collector.registerSync(event, {});
            case 'Delete':
                return await collector.deregisterSync(event, {});
            default:
                return context.fail('AWSC0012 Unknown event:' + JSON.stringify(event));
        }
    }

    /**
     * Update the lambda function code and configuration if there is any change
     * @returns the Lambda context succeed or fail base 
     */
    async handleUpdate() {
        var collector = this;
        try {
            await collector.update();
            return collector.done();
        } catch (error) {
            return collector.done(error);
        }
    }

    /**
     * Deregister the collector from azcollect sand asset service and return cfn response
     * @param {*} event 
     * @param {*} custom 
     * @returns 
     */
    async deregisterSync(event, custom) {
        try {
            await this.deregister(event, custom);
            return response.send(event, this.context, response.SUCCESS);
        } catch (error) {
            return response.send(event, this.context, response.FAILED, { Error: error });
        }
    }
    /**
     * Deregister the collector from Azcollect service
     * @param {*} event 
     * @param {*} custom 
     * @returns 
     */

    async deregister(event, custom) {
        let regValues = { ...this.getProperties(), ...custom };
        regValues.stackName = event && event.ResourceProperties ?
            event.ResourceProperties.StackName : regValues.stackName;

        try {
            return await this._azcollectc.deregister(regValues);
        } catch (error) {
            logger.warn(`AWSC0011 Collector deregistration failed. ${error}`);
            throw error;
        }
    }
    /**
     * process the event by formatting and sending to alertlogic ingest service
     * @param {*} event 
     * @returns 
     */
    async process(event) {
        const context = this._invokeContext;
        var collector = this;

        const { data, compress } = await new Promise((resolve, reject) => {
            collector._formatFun(event, context, (err, formattedData, maybeCompress) => {
                if (err) return reject(err);
                // If maybeCompress is a boolean, use it; otherwise default to true
                resolve({
                    data: formattedData,
                    compress: typeof maybeCompress === 'boolean' ? maybeCompress : true
                });
            });
        });

        // Step 2: Send the formatted data
        return await collector.send(data, compress, collector._ingestType);
    }

    async processLog(messages, formatFun, hostmetaElems) {
        if (arguments.length === 3 && typeof hostmetaElems === 'function') {
            throw new Error('Callback style not supported in async version');
        }
        var collector = this;
        if (messages && messages.length > 0) {
            let buildPayloadObj = {
                hostId: collector._collectorId,
                sourceId: collector._collectorId,
                hostmetaElems: hostmetaElems,
                content: messages,
                parseCallback: formatFun,
                filterJson: '',
                filterRegexp: ''
            };
            const payloadObject = await new Promise((resolve, reject) => {
                alCollector.AlLog.buildPayload(
                    buildPayloadObj, (err, payloadObj) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(payloadObj);
                        }
                    });
            });
            await collector.send(payloadObject.payload, false, AlAwsCollectorV2.IngestTypes.LOGMSGS);
            const stats = collector.prepareLmcStats(payloadObject.raw_count, payloadObject.raw_bytes);
            return await collector.send(JSON.stringify([stats]), true, AlAwsCollectorV2.IngestTypes.LMCSTATS);
        }
    }

    /**
     * Send data to Alertlogic ingest
     * @param {*} data 
     * @param {*} compress 
     * @param {*} ingestType 
     * @returns 
     */
    async send(data, compress = true, ingestType = this._ingestType) {
        var collector = this;

        try {
            await collector.updateApiEndpoints();
            if (!data) {
                return;
            }
            if (compress) {
                data = await new Promise((resolve, reject) => {
                    zlib.deflate(data, function (compressionErr, compressed) {
                        if (compressionErr) {
                            reject(compressionErr);
                        } else {
                            resolve(compressed);
                        }
                    });
                });
                return await collector._send(data, ingestType);
            }
            else {
                return await collector._send(data, ingestType);
            }
        } catch (error) {
            logger.error(`AWSC0013 Error sending data to Alertlogic ingest: ${error.message}`);
        }

    }
    /**
     * Send the different type of data to respective ingest api
     * @param {*} data 
     * @param {*} ingestType 
     */
    async _send(data, ingestType = this._ingestType) {
        var collector = this;
        switch (ingestType) {
            case AlAwsCollectorV2.IngestTypes.SECMSGS:
                await collector._ingestc.sendSecmsgs(data);
                break;
            case AlAwsCollectorV2.IngestTypes.VPCFLOW:
                try {
                    await collector._ingestc.sendVpcFlow(data);
                } catch (exception) {
                    const error = alUttil.formatError('AWSC0020', exception, AlAwsCollectorV2.IngestTypes.VPCFLOW);
                    throw error;
                }
                break;
            case AlAwsCollectorV2.IngestTypes.LOGMSGS:
                try {
                    await collector._ingestc.sendLogmsgs(data);
                } catch (exception) {
                    const error = alUttil.formatError('AWSC0018', exception, AlAwsCollectorV2.IngestTypes.LOGMSGS);
                    throw error;
                }
                break;
            case AlAwsCollectorV2.IngestTypes.LMCSTATS:
                try {
                    await collector._ingestc.sendLmcstats(data);
                } catch (exception) {
                    const error = alUttil.formatError('AWSC0019', exception, AlAwsCollectorV2.IngestTypes.LMCSTATS);
                    throw error;
                }
                break;
            default:
                throw new Error(`AWSC0005 Unknown Alertlogic ingestion type: ${ingestType}`);
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

    /**
     * Send the status to collector_status service
     * @param {*} collectorStatusStream - Collector those having streams use that else stream will be application_id
     * @param {*} status -It's a json object form using setCollectorStatus function
     */
    async sendCollectorStatus(collectorStatusStream, status) {
        let collector = this;
        await this.updateApiEndpoints();
        if (!status || !collector.registered || collector._collectorId == 'NA' || !collectorStatusStream) {
            return null;
        } else {
            try {
                return await collector._collectorStatusc.sendStatus(collector._collectorId, collectorStatusStream, status);
            } catch (exception) {
                if (exception.response.status === 304) {
                    return null;
                }
                else {
                    logger.warn(`AWSC0015 Collector status send failed: ${exception.message}`);
                    logger.debug(exception);
                    throw new Error(exception.message);
                }
            }
        }

    }

    /**
    * @param {Object} param - Its JSON object with  metricName, namespace, standardUnit and unitValue
    * param = {
    * metricName :'custom metrics'
    * nameSpace : 'PAWSCollector',
    * standardUnit: 'Count',
    * unitValue :1
    * }
     */
    async reportCWMetric(param) {
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
        return await this._cloudwatch.putMetricData(params);
    }

    _defaultHostmetaElems() {
        return [
            {
                key: 'host_type',
                value: { str: 'lambda' }
            },
            {
                key: 'local_hostname',
                value: { str: process.env.AWS_LAMBDA_FUNCTION_NAME }
            }
        ];
    }
}

module.exports = AlAwsCollectorV2;