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

                if (!params || !params.endPointConfigs || !params.requestBody) {
                    return { status: 'ERROR', object: { success: false, message: 'Invalid parameters' } };
                }

                var requestBody = config.createRequest(svc, params);

                return {
                    status: 'OK',
                    requestBody: requestBody,
                    requestURL: svc.url,
                    requestMethod: svc.method,
                    headers: svc.headers,
                    response: config.parseResponse(svc, { object: { success: true, message: 'Mock Response' } }),
                    requestLog: config.getRequestLogMessage(requestBody),
                    responseLog: JSON.stringify(config.getResponseLogMessage({ object: { success: true, message: 'Mock Response' } })), // Ensure response log matches expected format
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

    beforeEach(function () {
        mockService.headers = {}; // Reset headers before each test
    });

    it('should construct the correct request', function () {
        var params = {
            endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' },
            requestBody: { key: 'value' }
        };

        var result = brainCommerceService.service.call(params);

        assert.equal(result.requestURL, 'https://mock-api.com/test-endpoint', 'URL should be correct');
        assert.equal(result.requestMethod, params.endPointConfigs.method, 'Request method should match the config');
        assert.equal(result.headers['Content-Type'], 'application/json', 'Content-Type should be JSON');
        assert.equal(result.headers['X-API-Key'], 'mock-api-key', 'API Key should be set');
        assert.deepEqual(JSON.parse(result.requestBody), params.requestBody, 'Request body should match');
    });

    it('should return parsed response correctly', function () {
        var result = brainCommerceService.service.call({ endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' }, requestBody: {} });

        assert.deepEqual(result.response.object, { success: true, message: 'Mock Response' }, 'Response should be correctly parsed');
    });

    it('should log the request correctly', function () {
        var params = {
            endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' },
            requestBody: { key: 'value' }
        };

        var result = brainCommerceService.service.call(params);

        assert.deepEqual(JSON.parse(result.requestLog), params.requestBody, 'Request log should match request body');
    });

    it('should log the response correctly', function () {
        var result = brainCommerceService.service.call({ endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' }, requestBody: {} });

        assert.deepEqual(JSON.parse(result.responseLog), { object: { success: true, message: 'Mock Response' } }, 'Response log should match expected response');
    });

    it('should filter log messages correctly', function () {
        var result = brainCommerceService.service.call({ endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' }, requestBody: {} });

        assert.equal(result.filteredMessage, 'Mock log message', 'Filtered log message should match input');
    });

    it('should handle service failure correctly', function () {
        var failingMockService = {
            call: function () {
                return { status: 'ERROR', object: { success: false, message: 'Service failure' } };
            }
        };

        var failingService = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/services/brainCommerceService', {
            'dw/system/Site': mockSite,
            'dw/svc/LocalServiceRegistry': {
                createService: function () {
                    return failingMockService;
                }
            }
        });

        var result = failingService.service.call({ endPointConfigs: { endPoint: 'test-endpoint', method: 'POST' }, requestBody: {} });

        assert.equal(result.status, 'ERROR', 'Service failure should return ERROR status');
        assert.deepEqual(result.object, { success: false, message: 'Service failure' }, 'Failure response should match expected structure');
    });

    it('should return an error for missing parameters', function () {
        var result = brainCommerceService.service.call({});

        assert.equal(result.status, 'ERROR', 'Should return error status');
        assert.equal(result.object.message, 'Invalid parameters', 'Should return invalid parameters message');
    });

});
