'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// Mock Site Preferences
var mockSite = {
    current: {
        getCustomPreferenceValue: function (key) {
            var preferences = {
                brainCommerceIngestorAPIUrl: 'https://mock-api.com/',
                brainCommerceIngestorAPIKey: 'mock-api-key'
            };
            return preferences[key] || null;
        }
    },
    getCurrent: function () {
        return mockSite.current;
    }
};

// Mock LocalServiceRegistry
var mockService = {
    setURL: function (url) { this.url = url; },
    setRequestMethod: function (method) { this.method = method; },
    addHeader: function (key, value) { this.headers[key] = value; },
    call: function () {
        return { status: 'OK', object: { success: true, message: 'Mock Response' } };
    },
    headers: {}
};

var mockLocalServiceRegistry = {
    createService: function (serviceID, config) {
        return {
            call: function (params) {
                var svc = Object.assign({}, mockService);
                svc.headers = {}; // Reset headers for each call

                // Simulate createRequest execution
                var requestBody = config.createRequest(svc, params);

                return {
                    status: 'OK',
                    requestBody: requestBody,
                    requestURL: svc.url,
                    requestMethod: svc.method,
                    headers: svc.headers,
                    response: config.parseResponse(svc, { success: true, message: 'Mock Response' }),
                    requestLog: config.getRequestLogMessage(requestBody),
                    responseLog: config.getResponseLogMessage({ success: true, message: 'Mock Response' }),
                    filteredMessage: config.filterLogMessage('Mock log message')
                };
            }
        };
    }
};

// Require the module with mock dependencies
var brainCommerceService = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/services/brainCommerceService', {
    'dw/system/Site': mockSite,
    'dw/svc/LocalServiceRegistry': mockLocalServiceRegistry
});

describe('brainCommerceService', function () {
    it('should construct the correct request', function () {
        var params = {
            endPoint: 'test-endpoint',
            requestBody: { key: 'value' }
        };

        var result = brainCommerceService.service.call(params);

        assert.equal(result.requestURL, 'https://mock-api.com/test-endpoint', 'URL should be correct');
        assert.equal(result.requestMethod, 'POST', 'Request method should be POST');
        assert.equal(result.headers['Content-Type'], 'application/json', 'Content-Type should be JSON');
        assert.equal(result.headers['X-API-Key'], 'mock-api-key', 'API Key should be set');
        assert.deepEqual(JSON.parse(result.requestBody), params.requestBody, 'Request body should match');
    });

    it('should return parsed response correctly', function () {
        var result = brainCommerceService.service.call({ endPoint: 'test-endpoint', requestBody: {} });

        assert.deepEqual(result.response, { success: true, message: 'Mock Response' }, 'Response should be correctly parsed');
    });

    it('should log the request correctly', function () {
        var params = {
            endPoint: 'test-endpoint',
            requestBody: { key: 'value' }
        };

        var result = brainCommerceService.service.call(params);

        assert.deepEqual(JSON.parse(result.requestLog), params.requestBody, 'Request log should match request body');
    });

    it('should log the response correctly', function () {
        var result = brainCommerceService.service.call({ endPoint: 'test-endpoint', requestBody: {} });

        assert.deepEqual(result.responseLog, { success: true, message: 'Mock Response' }, 'Response log should match expected response');
    });

    it('should filter log messages correctly', function () {
        var result = brainCommerceService.service.call({ endPoint: 'test-endpoint', requestBody: {} });

        assert.equal(result.filteredMessage, 'Mock log message', 'Filtered log message should match input');
    });
});
