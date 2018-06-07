/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Statistics functions common for all collectors
 *
 * @end
 * -----------------------------------------------------------------------------
 */

const AWS = require('aws-sdk');
const async = require('async');

const m_alAws = require('./al_aws');
const m_alStatsTmpls = require('./statistics_templates');

function getStatistics(context, statsFuns, callback) {
    allFuns = [
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
    ].concat(statsFuns);
    async.parallel(allFuns,
        function(err, response) {
            if (err) {
                return callback(null, {statistics : []});
            } else {
                return callback(null, {statistics : response});
            }
        }
    );
}


module.exports = {
    getStatistics : getStatistics
};