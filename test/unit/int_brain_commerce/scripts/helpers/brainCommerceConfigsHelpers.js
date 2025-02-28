'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = {
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID: 'brainCommerceConfigs',
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'brainCommerceConfigKey'
};

var mockCustomObject = {
    custom: {}
};

var mockSite = {
    current: {
        getID: function () { return 'testSite'; },
        getCustomPreferenceValue: function (key) {
            var mockPreferences = {
                isBrainCommerceBackendEnabled: true,
                brainCommerceProductAttributeMapping: '{"id": "name"}',
                brainCommerceIngestorAPIUrl: 'https://api.example.com',
                brainCommerceIngestorAPIKey: 'API_KEY'
            };
            return mockPreferences.hasOwnProperty(key) ? mockPreferences[key] : null;
        }
    },
    getCurrent: function () {
        return mockSite.current;
    }
};

var mockProduct = {
    ID: 'mockProduct',
    availabilityModel: {
        availabilityStatus: 'IN_STOCK',
        inventoryRecord: {
            custom: {
                brainCommerceLastExportedPriceAndInventory: JSON.stringify({ testSite: 'IN_STOCK|100|90' })
            }
        }
    },
    priceModel: {
        getPriceBookPrice: function () { return { value: 100 }; },
        minPrice: { value: 90 }
    },
    isMaster: function () { return false; }
};

var mockProductTwo = {
    ID: 'mockProduct',
    priceModel: {
        getPriceBookPrice: function () { return { value: 100 }; },
        minPrice: { value: 90 }
    },
    isMaster: function () { return false; }
}

var brainCommerceConfigsHelpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceConfigsHelpers', {
    'dw/object/CustomObjectMgr': {
        getCustomObject: function (key, id) { return null; },
        createCustomObject: function () { return mockCustomObject; }
    },
    'dw/system/Transaction': {
        wrap: function (callback) { return callback(); }
    },
    'dw/system/Logger': {
        error: function () {},
        info: function () {}
    },
    'dw/system/Site': mockSite,
    'dw/web/Resource': {
        msg: function () { return 'Mocked message'; }
    },
    '*/cartridge/scripts/constants': constants
});

describe('brainCommerceConfigsHelpers', function () {
    describe('parseContent', function () {
        it('should parse valid JSON', function () {
            var result = brainCommerceConfigsHelpers.parseContent('{"key": "value"}');
            assert.deepEqual(result, { key: 'value' });
        });

        it('should return empty object for invalid JSON', function () {
            var result = brainCommerceConfigsHelpers.parseContent('invalid json');
            assert.deepEqual(result, {});
        });

        it('should return empty object for null JSON', function () {
            var result = brainCommerceConfigsHelpers.parseContent(null);
            assert.deepEqual(result, {});
        });
    });

    describe('validateConfigForIngestion', function () {
        beforeEach(function () {
            mockSite.current.getCustomPreferenceValue = function (key) {
                var preferences = {
                    isBrainCommerceBackendEnabled: true,
                    brainCommerceProductAttributeMapping: '{"id": "name"}',
                    brainCommerceIngestorAPIUrl: 'https://api.example.com',
                    brainCommerceIngestorAPIKey: 'API_KEY'
                };
                return preferences[key];
            };
        });

        it('should return valid when all required configurations are set', function () {
            var result = brainCommerceConfigsHelpers.validateConfigForIngestion();
            assert.isTrue(result.valid);
        });

        it('should return invalid when backend is disabled', function () {
            mockSite.current.getCustomPreferenceValue = function (key) {
                return key === 'isBrainCommerceBackendEnabled' ? false : 'mockValue';
            };
            var result = brainCommerceConfigsHelpers.validateConfigForIngestion();
            assert.isFalse(result.valid);
        });

        it('should return invalid when product mapping is empty', function () {
            mockSite.current.getCustomPreferenceValue = function (key) {
                return key === 'brainCommerceProductAttributeMapping' ? '{}' : 'mockValue';
            };
            var result = brainCommerceConfigsHelpers.validateConfigForIngestion();
            assert.isFalse(result.valid);
        });

        it('should return invalid when service URL is missing', function () {
            mockSite.current.getCustomPreferenceValue = function (key) {
                if (key === 'brainCommerceProductAttributeMapping') return '{"id": "name"}';
                if (key === 'isBrainCommerceBackendEnabled') return true;
                if (key === 'brainCommerceIngestorAPIUrl') return null;
                if (key === 'brainCommerceIngestorAPIKey') return true;
                return 'mockValue';
            };

            var result = brainCommerceConfigsHelpers.validateConfigForIngestion();
            assert.isFalse(result.valid);
        });

        it('should return invalid when service API key is missing', function () {
            mockSite.current.getCustomPreferenceValue = function (key) {
                if (key === 'brainCommerceProductAttributeMapping') return '{"id": "name"}';
                if (key === 'isBrainCommerceBackendEnabled') return true;
                if (key === 'brainCommerceIngestorAPIUrl') return 'https://api.example.com';
                if (key === 'brainCommerceIngestorAPIKey') return null;
                return 'mockValue';
            };

            var result = brainCommerceConfigsHelpers.validateConfigForIngestion();
            assert.isFalse(result.valid);
        });
    });

    describe('getBrainCommerceProductsLastExportTime', function () {
        it('should return null if no timestamp is set', function () {
            delete mockCustomObject.custom.productLastExport;
            var result = brainCommerceConfigsHelpers.getBrainCommerceProductsLastExportTime();
            assert.isNull(result || null);
        });
    });

    describe('getBrainCommerceFAQsLastExportTime', function () {
        it('should return null if no timestamp is set', function () {
            delete mockCustomObject.custom.faqLastExport;
            var result = brainCommerceConfigsHelpers.getBrainCommerceFAQsLastExportTime();
            assert.isNull(result || null);
        });
    });

    describe('updateProductExportTimestampInBrainCommerceCOConfigs', function () {
        it('should update product export timestamp', function () {
            var date = new Date();
            brainCommerceConfigsHelpers.updateProductExportTimestampInBrainCommerceCOConfigs(date);
            assert.instanceOf(mockCustomObject.custom.productLastExport, Date);
        });
    });

    describe('updateFAQExportTimestampInBrainCommerceCOConfigs', function () {
        it('should update FAQ export timestamp', function () {
            var date = new Date();
            brainCommerceConfigsHelpers.updateFAQExportTimestampInBrainCommerceCOConfigs(date);
            assert.instanceOf(mockCustomObject.custom.faqLastExport, Date);
        });
    });

    describe('compareInventoryRecordIfTimeComarisonFails', function () {
        it('should return false if product data matches stored data', function () {
            var result = brainCommerceConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId');
            assert.isFalse(result);
        });

        it('should log if product is varient and does not contain availability model', function () {
            var result = brainCommerceConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProductTwo, 'priceBookId');
            assert.isFalse(result);
        });

        it('should return true if product data does not match stored data', function () {
            mockProduct.availabilityModel.inventoryRecord.custom.brainCommerceLastExportedPriceAndInventory = JSON.stringify({ testSite: 'OUT_OF_STOCK|200|150' });
            var result = brainCommerceConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(mockProduct, 'priceBookId');
            assert.isTrue(result);
        });
    });

    describe('updateInventoryRecordOnSuccessResponse', function () {
        it('should update inventory record on success response', function () {
            brainCommerceConfigsHelpers.updateInventoryRecordOnSuccessResponse(mockProduct, 'priceBookId');
            assert.equal(mockProduct.availabilityModel.inventoryRecord.custom.brainCommerceLastExportedPriceAndInventory, JSON.stringify({ testSite: 'IN_STOCK|100|90' }));
        });
    });
});
