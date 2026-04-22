'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = {
    REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_ID: 'rzlvSnpdConfigs',
    REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'rzlvSnpdConfigKey'
};

var mockCustomObject = {
    custom: {}
};

var mockSite = {
    current: {
        getID: function () { return 'testSite'; },
        getCustomPreferenceValue: function () { return null; },
        setCustomPreferenceValue: function () {}
    },
    getCurrent: function () {
        return mockSite.current;
    }
};

var loggerMessages = [];

var rzlvSnpdConfigsHelpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers', {
    'dw/object/CustomObjectMgr': {
        getCustomObject: function () { return null; },
        createCustomObject: function () { return mockCustomObject; }
    },
    'dw/system/Transaction': {
        wrap: function (callback) { return callback(); }
    },
    'dw/system/Logger': {
        error: function () {},
        info: function () {},
        warn: function (msg) { loggerMessages.push(msg); }
    },
    'dw/system/Site': mockSite,
    '*/cartridge/scripts/constants': constants
});

describe('rzlvSnpdConfigsHelpers', function () {
    beforeEach(function () {
        mockCustomObject.custom = {};
        loggerMessages = [];
    });

    describe('parseContent', function () {
        it('should parse valid JSON', function () {
            var result = rzlvSnpdConfigsHelpers.parseContent('{"key": "value"}');
            assert.deepEqual(result, { key: 'value' });
        });

        it('should return empty object for invalid JSON', function () {
            var result = rzlvSnpdConfigsHelpers.parseContent('invalid json');
            assert.deepEqual(result, {});
        });

        it('should return empty object for null', function () {
            var result = rzlvSnpdConfigsHelpers.parseContent(null);
            assert.deepEqual(result, {});
        });

        it('should return empty object for JSON null literal', function () {
            var result = rzlvSnpdConfigsHelpers.parseContent('null');
            assert.deepEqual(result, {});
        });

        it('should parse a JSON array', function () {
            var result = rzlvSnpdConfigsHelpers.parseContent('[1,2,3]');
            assert.deepEqual(result, [1, 2, 3]);
        });
    });

    describe('getCurentOrNewRzlvCOConfigs', function () {
        it('should return existing custom object if found', function () {
            var existingObj = { custom: { productLastExport: 'someDate' } };
            var helpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers', {
                'dw/object/CustomObjectMgr': {
                    getCustomObject: function () { return existingObj; },
                    createCustomObject: function () { return mockCustomObject; }
                },
                'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
                'dw/system/Logger': { error: function () {}, info: function () {}, warn: function () {} },
                'dw/system/Site': mockSite,
                '*/cartridge/scripts/constants': constants
            });
            var result = helpers.getRzlvProductsLastExportTime();
            assert.equal(result, 'someDate');
        });

        it('should create a new custom object if not found', function () {
            var createCalled = false;
            var helpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers', {
                'dw/object/CustomObjectMgr': {
                    getCustomObject: function () { return null; },
                    createCustomObject: function () {
                        createCalled = true;
                        return mockCustomObject;
                    }
                },
                'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
                'dw/system/Logger': { error: function () {}, info: function () {}, warn: function () {} },
                'dw/system/Site': mockSite,
                '*/cartridge/scripts/constants': constants
            });
            helpers.getRzlvProductsLastExportTime();
            assert.isTrue(createCalled);
        });
    });

    describe('getRzlvProductsLastExportTime', function () {
        it('should return null if no timestamp is set', function () {
            var result = rzlvSnpdConfigsHelpers.getRzlvProductsLastExportTime();
            assert.isUndefined(result);
        });

        it('should return timestamp when set', function () {
            mockCustomObject.custom.productLastExport = '2024-01-01';
            var helpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers', {
                'dw/object/CustomObjectMgr': {
                    getCustomObject: function () { return mockCustomObject; },
                    createCustomObject: function () { return mockCustomObject; }
                },
                'dw/system/Transaction': { wrap: function (cb) { return cb(); } },
                'dw/system/Logger': { error: function () {}, info: function () {}, warn: function () {} },
                'dw/system/Site': mockSite,
                '*/cartridge/scripts/constants': constants
            });
            var result = helpers.getRzlvProductsLastExportTime();
            assert.equal(result, '2024-01-01');
        });
    });

    describe('updateLastIncrementalRun', function () {
        it('should call setCustomPreferenceValue with lastSuccessfulIncrementalRun', function () {
            var capturedKey = null;
            var capturedValue = null;
            mockSite.current.setCustomPreferenceValue = function (key, val) {
                capturedKey = key;
                capturedValue = val;
            };
            var timestamp = new Date();
            rzlvSnpdConfigsHelpers.updateLastIncrementalRun(timestamp);
            assert.equal(capturedKey, 'lastSuccessfulIncrementalRun');
            assert.equal(capturedValue, timestamp);
        });
    });

    describe('updateLastBaselineRun', function () {
        it('should call setCustomPreferenceValue with lastSuccessfulBaselineRun', function () {
            var capturedKey = null;
            var capturedValue = null;
            mockSite.current.setCustomPreferenceValue = function (key, val) {
                capturedKey = key;
                capturedValue = val;
            };
            var timestamp = new Date();
            rzlvSnpdConfigsHelpers.updateLastBaselineRun(timestamp);
            assert.equal(capturedKey, 'lastSuccessfulBaselineRun');
            assert.equal(capturedValue, timestamp);
        });
    });

    describe('updateProductExportTimestampInRzlvCOConfigs', function () {
        it('should update product export timestamp on custom object', function () {
            var date = new Date();
            rzlvSnpdConfigsHelpers.updateProductExportTimestampInRzlvCOConfigs(date);
            assert.instanceOf(mockCustomObject.custom.productLastExport, Date);
        });
    });

    describe('compareInventoryRecordIfTimeComarisonFails', function () {
        var mockProduct;

        beforeEach(function () {
            mockProduct = {
                ID: 'prod1',
                availabilityModel: {
                    availabilityStatus: 'IN_STOCK',
                    inventoryRecord: {
                        custom: {
                            rzlvAttr: JSON.stringify({ testSite: 'IN_STOCK|100|90' })
                        }
                    }
                },
                priceModel: {
                    getPriceBookPrice: function () { return { value: 100 }; },
                    minPrice: { value: 90 }
                },
                isMaster: function () { return false; }
            };
        });

        it('should return false when product data matches stored data', function () {
            var result = rzlvSnpdConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId', 'rzlvAttr');
            assert.isFalse(result);
        });

        it('should return true when product data does not match stored data', function () {
            mockProduct.availabilityModel.inventoryRecord.custom.rzlvAttr = JSON.stringify({ testSite: 'OUT_OF_STOCK|200|150' });
            var result = rzlvSnpdConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId', 'rzlvAttr');
            assert.isTrue(result);
        });

        it('should return false when no inventory record exists and product is not master', function () {
            mockProduct.availabilityModel.inventoryRecord = null;
            var result = rzlvSnpdConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId', 'rzlvAttr');
            assert.isFalse(result);
        });

        it('should return false when no availabilityModel exists', function () {
            mockProduct.availabilityModel = null;
            var result = rzlvSnpdConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId', 'rzlvAttr');
            assert.isFalse(result);
        });
    });

    describe('updateInventoryRecordOnSuccessResponse', function () {
        it('should update inventory record with current status', function () {
            var mockProduct = {
                ID: 'prod1',
                availabilityModel: {
                    availabilityStatus: 'IN_STOCK',
                    inventoryRecord: {
                        custom: {
                            rzlvAttr: JSON.stringify({})
                        }
                    }
                },
                priceModel: {
                    getPriceBookPrice: function () { return { value: 100 }; },
                    minPrice: { value: 90 }
                }
            };
            rzlvSnpdConfigsHelpers.updateInventoryRecordOnSuccessResponse(mockProduct, 'priceBookId', 'rzlvAttr');
            var stored = JSON.parse(mockProduct.availabilityModel.inventoryRecord.custom.rzlvAttr);
            assert.equal(stored.testSite, 'IN_STOCK|100|90');
        });

        it('should not throw when no inventory record exists', function () {
            var mockProduct = {
                ID: 'prod1',
                availabilityModel: null,
                priceModel: {
                    getPriceBookPrice: function () { return { value: 100 }; },
                    minPrice: { value: 90 }
                }
            };
            assert.doesNotThrow(function () {
                rzlvSnpdConfigsHelpers.updateInventoryRecordOnSuccessResponse(mockProduct, 'priceBookId', 'rzlvAttr');
            });
        });
    });
});
