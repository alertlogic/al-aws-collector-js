/* -----------------------------------------------------------------------------
 * @copyright (C) 2025, Alert Logic, Inc
 * @doc
 *
 * Common functions for all collectors
 *
 * @end
 * -----------------------------------------------------------------------------
 */


function stringify(jsonObj) {
    return JSON.stringify(jsonObj, null, 0);
}

/**
 * @function
 * @param {string} code - error code
 * @param {string} message - error message
 * @returns {ErrorMsg} returns error message object
 */

function errorMsg(code, message) {
    return {
        status: 'error',
        code: code,
        details: message
    };
}
/**
 * @param {*} error 
 * @returns httpErrorCode
 */
function extractHttpErrorCode(error) {
    let httpErrorCode;
    if (typeof (error) === 'string') {
        httpErrorCode = parseInt(error.slice(0, 3));
        if (isNaN(httpErrorCode) && error.includes(':')) {
            const splitErrorMessage = error.split(':');
            httpErrorCode = parseInt(splitErrorMessage[1].replace(/ /, '').slice(0, 3));
        }
    } else {
        httpErrorCode = error.response.status;
    }
    return httpErrorCode;
}

/**
 * 
 * @param {*} code 
 * @param {*} message 
 * @param {*} httpErrorCode 
 * @returns errorObject
 */
function formatError(code, exception, type) {
    const httpCode = extractHttpErrorCode(exception);
    let errorObject = {
        errorCode: code,
        message: `${code} failed at ${type} : ${exception.message}`,
        httpErrorCode: httpCode
    };
    return errorObject;
}



module.exports = {
    errorMsg: errorMsg,
    extractHttpErrorCode: extractHttpErrorCode,
    formatError: formatError,
    stringify: stringify
};

