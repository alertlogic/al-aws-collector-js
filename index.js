/* -----------------------------------------------------------------------------
 * @copyright (C) 2018, Alert Logic, Inc
 * @doc
 *
 * Helper classes and function for lambda based collectors.
 *
 * @end
 * -----------------------------------------------------------------------------
 */

module.exports = {
    AlAwsCollector : require('./al_aws_collector'),
    Util : require('./al_aws'),
    Health : require('./health_checks'),
    Stats: require('./statistics_templates'),
    Logger: require('./logger'),
    AlAwsCollectorV2: require('./modern/al_aws_collector_v2'),
    AlAwsCommon: require('./modern/al_aws_common'),
    AlAwsStats: require('./modern/al_aws_stats_templates'),
    AlUtil: require('./modern/util')
};

