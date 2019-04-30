# al-aws-collector-js

[![Build Status](https://secure.travis-ci.org/alertlogic/al-aws-collector-js.png?branch=master)](http://travis-ci.org/alertlogic/al-aws-collector-js)

Alert Logic cloud collector AWS common library.


# Overview

This repository contains the common JavaScript functions used by Node.js collectors in the AWS cloud.  

# HOWTO use this library in an AWS Lambda function

To install:
`npm i @alertlogic/al-aws-collector-js`

in your file
```javascript
{
    AlAwsCollector,
} = require('@alertlogic/al-aws-collect-js');
```

# API

## `AlAwsCollector`
Base class for AWS lambda based collectors

* @param {Object} context - context of Lambdas function.
* @param {string} collectorType - collector type (cwe as example).
* @param {string} ingestType - ingest data type (secmsgs, vpcflow, etc).
* @param {string} version - version of collector.
* @param {Object} aimsCreds - Alert Logic API credentials.
* @param {string} [aimsCreds.access_key_id] - Alert Logic API access key id.
* @param {string} [aimsCreds.secret_key] - Alert Logic API secret key.
* @param {function} formatFun - callback formatting function
* @param {Array.<function>} healthCheckFuns - list of custom health check functions (can be just empty, so only common are applied)
* @param {Array.<function>} statsFuns - list of custom stats functions (can be just empty, so only common are applied)

# Debugging

To get a debug trace, set an Node.js environment variable called DEBUG and
specify the JavaScript module/s to debug.

E.g.

```
export DEBUG=*
export DEBUG=index
```

Or set an environment variable called "DEBUG" in your AWS stack (using the AWS 
console) for the "alertlogic-cwe-collector" AWS Lambda function, with 
value "index" or "*".

See [debug](https://www.npmjs.com/package/debug) for further details.

# Known Issues/ Open Questions

- TBD.

# Useful Links

- [Node.js static code analysis tool](http://jshint.com/install/)
- [Node.js rewire testing tool](https://github.com/jhnns/rewire)
- [Node.js sinon testing tool](http://sinonjs.org/)
