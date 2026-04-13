/**
 * Modern async/await implementation for CloudFormation custom resource responses
 * Uses RestServiceClient from al-collector-js for HTTP communication
 */

const { RestServiceClient } = require('@alertlogic/al-collector-js');

const response = {
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    
    async send(event, context, responseStatus, responseData, physicalResourceId) {
        const responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: `See CloudWatch Log Stream: ${context.logStreamName}`,
            PhysicalResourceId: physicalResourceId || context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: responseData || {}
        });
        console.log('CFN Response body:\n', responseBody);

        try {
            // Parse the URL to extract the endpoint and path
            const url = new URL(event.ResponseURL);
            const endpoint = url.host;
            const path = url.pathname + url.search;
            
            // Create RestServiceClient instance with no retries for CFN responses
            const client = new RestServiceClient(endpoint, {
                retries: 0,
                minTimeout: 1000,
                maxTimeout: 1000
            });
            
            const putResponse = await client.put(path, {
                body: responseBody,
                headers: {
                    'content-type': '',
                    'content-length': responseBody.length.toString()
                },
                json: false  // Don't parse response as JSON
            });
            console.log('CFN Response PUT result:', putResponse);
            
        } catch (error) {
            console.error('CFN Response Error:', error);
            // Just log the error and continue
        }
    }
};

module.exports = response;