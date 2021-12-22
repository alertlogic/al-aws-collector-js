/**
 * @copyright (c)2021, Alert Logic, Inc
 * @doc
 * 
 * Logger setup for Lambda functions
 * @end
 * 
 */

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, json } = format;

const showStack = process.env.LOG_ERROR_OPTS ? { stack: process.env.LOG_ERROR_OPTS } : {};
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        timestamp(),
        errors(showStack),
        json()
    ),
    transports: [
        new transports.Console(),
    ],
});

module.exports = logger;
