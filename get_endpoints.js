/* -----------------------------------------------------------------------------
 * @copyright (C) 2019, Alert Logic, Inc
 * @doc
 *
 * Function for getting AL enpoints. 
 *
 * @end
 * -----------------------------------------------------------------------------
 */
const https = require('https');

function makeApiRequest(requestParams, errorCallback){
    return new Promise((resolve, reject) => {
        const request = https.request(requestParams, (resp) => {
            var body = '';
            resp.on('data', function (chunk) {
                body += chunk;
            });
            resp.on('end', function () {
                if (body) {
                    resolve(JSON.parse(body));
                }
                else{
                    resolve(body);
                }
            });
        });
        request.on('error', (err) => {
            console.log("API request Error", err);
            reject(errorCallback(err) || err);
        });

        request.end();
    });
}
function authenticate(AimsAccessKeyId, AimsSecretKey, AlApiEndpoint, callback, errFunc) {
    const requestParams = {
        hostname:
            AlApiEndpoint,
        port: 443,
        path: '/aims/v1/authenticate',
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' +
                new Buffer(AimsAccessKeyId + ':' +
                AimsSecretKey).toString('base64'),
            'Accept': 'application/json'
        }
    };

    return makeApiRequest(requestParams, (resp) => {
        if (resp.statusCode == 401) {
            return 'AIMs credentials are invalid.';
        }
        if (resp.statusCode !== 200) {
            return 'AIMs authentication failed with http response: ' + resp.statusCode;
        }
    });
}

function getEndpoint(serviceName, AlDataResidency, AlApiEndpoint, authInfo) {
    const requestParams = {
        hostname:
            AlApiEndpoint,
        port: 443,
        path: '/endpoints/v1/' +
            authInfo.accId +
            '/residency/' + AlDataResidency + '/services/' +
             serviceName + '/endpoint',
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'x-aims-auth-token': authInfo.token
        }
    };
    return makeApiRequest(requestParams, (resp) => {
        if (resp.statusCode !== 200) {
            return 'Endpoints get for ' + serviceName + ' failed. http response: ' + resp.statusCode;
        }
    });
}

function getEndpoints(endpoints, ...params) {
    const endpointPromises = endpoints.map((endpoint) => getEndpoint(endpoint, ...params));
    return Promise.all(endpointPromises);
}

module.exports = function(endpoints, AimsAccessKeyId, AimsSecretKey, AlDataResidency, AlApiEndpoint) {
    return authenticate(AimsAccessKeyId, AimsSecretKey, AlApiEndpoint).then((resp, errFunc) => {
        const authInfo = {
            token: resp.authentication.token,
            accId: resp.authentication.account.id
        };
        return getEndpoints(endpoints, AlDataResidency, AlApiEndpoint, authInfo);
    }).then((results) => {
        return Object.assign({}, ...results);
    }).catch((err) => {
        console.error(`Error getting API Endpoints ${err}`);
        return Promise.reject(err);
    });
};

