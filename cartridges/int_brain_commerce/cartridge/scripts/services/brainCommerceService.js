'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Site = require('dw/system/Site');
var serviceEndPointUrl = Site.current.getCustomPreferenceValue('brainCommerceIngestorAPIUrl');

var service = LocalServiceRegistry.createService('int_braincommerce.http.service', {
    createRequest: function (svc, params) {
        svc.setURL(serviceEndPointUrl + params.endPointConfigs.endPoint);
        svc.setRequestMethod(params.endPointConfigs.method);
        svc.addHeader('Content-Type', 'application/json');
        svc.addHeader('X-API-Key', Site.current.getCustomPreferenceValue('brainCommerceIngestorAPIKey'));
        svc.addHeader('accept', 'application/json');
        return JSON.stringify(params.requestBody);
    },
    parseResponse: function (svc, result) {
        return result;
    },
    getRequestLogMessage: function (requestObj) {
        return requestObj;
    },
    getResponseLogMessage: function (responseObj) {
        return responseObj;
    },
    filterLogMessage: function (msg) {
        return msg;
    }
});

module.exports = {
    service: service
};
