'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var capturedServiceConfig = {};
var mockServiceInstance = {
    setURL: function (url) { mockServiceInstance._url = url; },
    setRequestMethod: function (method) { mockServiceInstance._method = method; },
    addHeader: function (key, val) { mockServiceInstance._headers[key] = val; },
    getAuthentication: function () { return 'NONE'; },
    call: function () { return mockServiceInstance._callResult; },
    _url: '',
    _method: '',
    _headers: {},
    _callResult: null
};

var mockSite = {
    current: {
        getCustomPreferenceValue: function (key) {
            var prefs = {
                rezolveIngestionApiUrl: 'https://api.example.com',
                rezolveClientKey: 'test-client-key',
                rezolveCustomerId: 'test-customer-id'
            };
            return prefs[key] || null;
        }
    }
};

var mockFileInstance = {
    exists: function () { return true; },
    getFullPath: function () { return '/test/file.jsonld'; }
};

var RezolveSnpdService = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/services/rezolveSnpdService', {
    'dw/svc/LocalServiceRegistry': {
        createService: function (serviceId, config) {
            capturedServiceConfig = config;
            return mockServiceInstance;
        }
    },
    'dw/system/Site': mockSite,
    'dw/system/Logger': {
        info: function () {},
        error: function () {},
        warn: function () {}
    },
    'dw/io/File': function (path) {
        mockFileInstance._path = path;
        return mockFileInstance;
    },
    'dw/net/HTTPRequestPart': function (name, value, encoding) {
        return { name: name, value: value, encoding: encoding };
    }
});

describe('RezolveSnpdService', function () {
    beforeEach(function () {
        mockServiceInstance._url = '';
        mockServiceInstance._method = '';
        mockServiceInstance._headers = {};
        mockServiceInstance._callResult = null;
    });

    describe('getService', function () {
        it('should return a service instance', function () {
            var service = RezolveSnpdService.getService();
            assert.isObject(service);
        });

        it('should register with correct service ID', function () {
            var registeredId = null;
            var svc = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/services/rezolveSnpdService', {
                'dw/svc/LocalServiceRegistry': {
                    createService: function (serviceId, config) {
                        registeredId = serviceId;
                        return mockServiceInstance;
                    }
                },
                'dw/system/Site': mockSite,
                'dw/system/Logger': { info: function () {}, error: function () {}, warn: function () {} },
                'dw/io/File': function () { return mockFileInstance; },
                'dw/net/HTTPRequestPart': function (n, v, e) { return { name: n, value: v }; }
            });
            svc.getService();
            assert.equal(registeredId, 'rezolvesnpd.http.ingest');
        });
    });

    describe('createRequest callback', function () {
        beforeEach(function () {
            RezolveSnpdService.getService();
        });

        it('should set URL from site pref and endpoint', function () {
            var svc = mockServiceInstance;
            svc._headers = {};
            capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks', method: 'POST' },
                requestBody: { collection: 'test' }
            });
            assert.equal(svc._url, 'https://api.example.com/api/tasks');
        });

        it('should set authorization and customer-id headers', function () {
            var svc = mockServiceInstance;
            svc._headers = {};
            capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks', method: 'POST' },
                requestBody: {}
            });
            assert.equal(svc._headers['Authorization'], 'client-key test-client-key');
            assert.equal(svc._headers['X-Groupby-Customer-Id'], 'test-customer-id');
        });

        it('should return null for GET requests', function () {
            var svc = mockServiceInstance;
            svc._headers = {};
            var result = capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks/123', method: 'GET' },
                requestBody: {}
            });
            assert.isNull(result);
            assert.equal(svc._headers['Accept'], 'application/json');
        });

        it('should return request parts for POST with body fields', function () {
            var svc = mockServiceInstance;
            svc._headers = {};
            var result = capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks', method: 'POST' },
                requestBody: { collection: 'test', indexerUploadType: 'BASELINE' }
            });
            assert.isArray(result);
            assert.equal(result.length, 2);
        });

        it('should handle catalog file field as string path', function () {
            var svc = mockServiceInstance;
            svc._headers = {};
            var result = capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks', method: 'POST' },
                requestBody: { catalog: '/path/to/catalog.jsonld' }
            });
            assert.isArray(result);
            assert.equal(result[0].name, 'catalog');
        });

        it('should handle catalog file that does not exist', function () {
            mockFileInstance.exists = function () { return false; };
            var svc = mockServiceInstance;
            svc._headers = {};
            var result = capturedServiceConfig.createRequest(svc, {
                endPointConfigs: { endPoint: '/api/tasks', method: 'POST' },
                requestBody: { catalog: '/path/to/missing.jsonld' }
            });
            assert.isArray(result);
            assert.equal(result[0].name, 'catalog');
            mockFileInstance.exists = function () { return true; };
        });
    });

    describe('parseResponse callback', function () {
        beforeEach(function () {
            RezolveSnpdService.getService();
        });

        it('should return success for 200 status with JSON body', function () {
            var response = {
                getStatusCode: function () { return 200; },
                getText: function () { return JSON.stringify({ id: '123' }); }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isTrue(result.success);
            assert.equal(result.statusCode, 200);
            assert.deepEqual(result.data, { id: '123' });
        });

        it('should return error for 400 status', function () {
            var response = {
                getStatusCode: function () { return 400; },
                getText: function () { return JSON.stringify({ message: 'Bad request' }); }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 400);
        });

        it('should return error for 500 status', function () {
            var response = {
                getStatusCode: function () { return 500; },
                getText: function () { return JSON.stringify({ message: 'Server error' }); }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 500);
        });

        it('should return error for unexpected status code', function () {
            var response = {
                getStatusCode: function () { return 301; },
                getText: function () { return ''; }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 301);
        });

        it('should handle unparseable JSON response', function () {
            var response = {
                getStatusCode: function () { return 200; },
                getText: function () { return 'not-json{'; }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isFalse(result.success);
        });

        it('should handle empty response text', function () {
            var response = {
                getStatusCode: function () { return 200; },
                getText: function () { return ''; }
            };
            var result = capturedServiceConfig.parseResponse(mockServiceInstance, response);
            assert.isTrue(result.success);
            assert.isNull(result.data);
        });
    });

    describe('initiateTask', function () {
        it('should throw when params is null (Logger accesses params.taskType before try)', function () {
            assert.throws(function () {
                RezolveSnpdService.initiateTask(null);
            }, TypeError);
        });

        it('should return success when service call succeeds', function () {
            mockServiceInstance._callResult = {
                isOk: function () { return true; },
                getObject: function () {
                    return { success: true, data: { id: 'task-123' } };
                }
            };
            var result = RezolveSnpdService.initiateTask({
                taskType: 'PRODUCT_INGESTION',
                requestBody: { collection: 'test' }
            });
            assert.isTrue(result.success);
            assert.equal(result.data.id, 'task-123');
        });

        it('should return error when service call fails', function () {
            mockServiceInstance._callResult = {
                isOk: function () { return false; },
                error: {},
                getErrorMessage: function () { return 'Connection refused'; }
            };
            var result = RezolveSnpdService.initiateTask({
                taskType: 'PRODUCT_INGESTION',
                data: { collection: 'test' }
            });
            assert.isFalse(result.success);
            assert.equal(result.message, 'Service call failed');
        });

        it('should build requestBody from data and taskType when requestBody not provided', function () {
            var capturedCallParams = null;
            mockServiceInstance.call = function (params) {
                capturedCallParams = params;
                return {
                    isOk: function () { return true; },
                    getObject: function () { return { success: true }; }
                };
            };
            RezolveSnpdService.initiateTask({
                taskType: 'PRODUCT_INGESTION',
                data: { collection: 'myCollection' },
                options: { method: 'POST' }
            });
            assert.equal(capturedCallParams.requestBody.taskType, 'PRODUCT_INGESTION');
            assert.equal(capturedCallParams.requestBody.collection, 'myCollection');
            mockServiceInstance.call = function () { return mockServiceInstance._callResult; };
        });

        it('should catch exceptions and return error', function () {
            mockServiceInstance.call = function () { throw new Error('Unexpected error'); };
            var result = RezolveSnpdService.initiateTask({
                taskType: 'PRODUCT_INGESTION',
                requestBody: {}
            });
            assert.isFalse(result.success);
            assert.include(result.message, 'Exception');
            mockServiceInstance.call = function () { return mockServiceInstance._callResult; };
        });
    });

    describe('getTaskDetail', function () {
        it('should return error when taskId is null', function () {
            var result = RezolveSnpdService.getTaskDetail(null);
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 400);
        });

        it('should return error when taskId is empty string', function () {
            var result = RezolveSnpdService.getTaskDetail('');
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 400);
        });

        it('should return task details on success', function () {
            mockServiceInstance._callResult = {
                isOk: function () { return true; },
                getStatus: function () { return 200; },
                getObject: function () {
                    return { data: { currentStage: 'COMPLETE', id: 'task-123' } };
                }
            };
            var result = RezolveSnpdService.getTaskDetail('task-123');
            assert.isTrue(result.success);
            assert.equal(result.data.currentStage, 'COMPLETE');
        });

        it('should return error when service call fails', function () {
            mockServiceInstance._callResult = {
                isOk: function () { return false; },
                getErrorMessage: function () { return 'Not found'; },
                getStatusCode: function () { return 404; }
            };
            var result = RezolveSnpdService.getTaskDetail('task-123');
            assert.isFalse(result.success);
        });

        it('should catch exceptions and return error', function () {
            mockServiceInstance.call = function () { throw new Error('Network error'); };
            var result = RezolveSnpdService.getTaskDetail('task-123');
            assert.isFalse(result.success);
            assert.equal(result.statusCode, 500);
            mockServiceInstance.call = function () { return mockServiceInstance._callResult; };
        });

        it('should pass waitForCompletion parameter in URL', function () {
            var capturedCallParams = null;
            mockServiceInstance.call = function (params) {
                capturedCallParams = params;
                return {
                    isOk: function () { return true; },
                    getStatus: function () { return 200; },
                    getObject: function () { return { data: { currentStage: 'COMPLETE' } }; }
                };
            };
            RezolveSnpdService.getTaskDetail('task-123', true);
            assert.include(capturedCallParams.endPointConfigs.endPoint, 'waitForCompletion=true');
            mockServiceInstance.call = function () { return mockServiceInstance._callResult; };
        });
    });
});
