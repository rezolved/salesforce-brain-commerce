'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

// global.empty is used in source code — must be defined before proxyquire
global.empty = function (val) {
    if (val === null || val === undefined || val === '') return true;
    if (typeof val === 'object' && Object.keys(val).length === 0) return true;
    return false;
};

var mockSite = {
    current: {
        getDefaultCurrency: function () { return 'USD'; },
        getCustomPreferenceValue: function (key) {
            var prefs = {
                rzlvSnpdProductAttributeMapping: JSON.stringify({
                    baseData: [{
                        systemAttributes: [
                            { snpdAttr: 'title', sfccAttr: 'name' },
                            { snpdAttr: 'brands', sfccAttr: 'brand' }
                        ],
                        customAttributes: [
                            { snpdAttr: 'tags', sfccAttr: 'customTag', defaultValue: '' }
                        ]
                    }],
                    attributes: [{
                        systemAttributes: [
                            { snpdAttr: 'color', sfccAttr: 'color' }
                        ],
                        customAttributes: []
                    }]
                }),
                rezolveCollectionName: 'test-collection',
                lastSuccessfulIncrementalRun: null,
                lastSuccessfulBaselineRun: null
            };
            return prefs.hasOwnProperty(key) ? prefs[key] : null;
        },
        setCustomPreferenceValue: function () {},
        defaultLocale: 'en_US'
    },
    getCurrent: function () { return mockSite.current; }
};

var lastServiceCall = null;
var serviceCallSuccess = true;
var serviceCallResponse = { success: true, data: { id: 'task-123', currentStage: 'INITIATED' } };
var createdCustomObjects = [];
var mockConfigsHelpers;
var mockFileWriterLines = [];
var mockFileWriterClosed = false;

function createModule(overrides) {
    var configsHelpersCalls = {
        updateLastBaselineRun: [],
        updateLastIncrementalRun: [],
        updateProductExportTimestampInRzlvCOConfigs: [],
        updateInventoryRecordOnSuccessResponse: [],
        compareInventoryRecordIfTimeComarisonFails: []
    };

    mockConfigsHelpers = {
        parseContent: function (str) {
            try { return JSON.parse(str); } catch (e) { return {}; }
        },
        getRzlvProductsLastExportTime: function () {
            return (overrides && overrides.lastExportTime) || null;
        },
        updateLastBaselineRun: function (ts) { configsHelpersCalls.updateLastBaselineRun.push(ts); },
        updateLastIncrementalRun: function (ts) { configsHelpersCalls.updateLastIncrementalRun.push(ts); },
        updateProductExportTimestampInRzlvCOConfigs: function (ts) { configsHelpersCalls.updateProductExportTimestampInRzlvCOConfigs.push(ts); },
        updateInventoryRecordOnSuccessResponse: function (product, pbId, attr) {
            configsHelpersCalls.updateInventoryRecordOnSuccessResponse.push({ product: product, pbId: pbId, attr: attr });
        },
        compareInventoryRecordIfTimeComarisonFails: function () {
            return (overrides && overrides.inventoryChanged) || false;
        },
        _calls: configsHelpersCalls
    };

    lastServiceCall = null;
    createdCustomObjects = [];
    mockFileWriterLines = [];
    mockFileWriterClosed = false;

    return proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/rezolveSnpdIngestion', {
        'dw/system/Site': mockSite,
        'dw/system/Logger': {
            info: function () {},
            error: function () {},
            warn: function () {}
        },
        'dw/system/Status': function (status, code) {
            this.status = status;
            this.code = code;
        },
        'dw/catalog/ProductMgr': {
            queryAllSiteProducts: function () {
                var products = (overrides && overrides.products) || [];
                var idx = 0;
                return {
                    hasNext: function () { return idx < products.length; },
                    next: function () { return products[idx++]; }
                };
            }
        },
        'dw/catalog/PriceBookMgr': {
            getSitePriceBooks: function () {
                return (overrides && overrides.priceBooks) || [];
            }
        },
        'dw/web/URLUtils': {
            abs: function () {
                return { toString: function () { return 'https://example.com/product'; } };
            }
        },
        'dw/object/CustomObjectMgr': {
            createCustomObject: function (type, id) {
                var obj = { custom: {} };
                createdCustomObjects.push({ type: type, id: id, obj: obj });
                return obj;
            }
        },
        'dw/system/Transaction': {
            wrap: function (cb) { return cb(); }
        },
        'dw/io/File': (function () {
            function MockFile() {
                this.exists = function () { return true; };
                this.mkdirs = function () { return true; };
                this.getFullPath = function () { return '/IMPEX/rzlv/catalog/test.jsonld'; };
            }
            MockFile.getRootDirectory = function () {
                return new MockFile();
            };
            MockFile.IMPEX = 'IMPEX';
            return MockFile;
        }()),
        'dw/io/FileWriter': function () {
            this.writeLine = function (line) { mockFileWriterLines.push(line); };
            this.close = function () { mockFileWriterClosed = true; };
        },
        'dw/util/Locale': {
            getLocale: function () { return { language: 'en' }; }
        },
        '*/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers': mockConfigsHelpers,
        '*/cartridge/scripts/services/rezolveSnpdService': {
            initiateTask: function (params) {
                lastServiceCall = params;
                if (serviceCallSuccess) {
                    return serviceCallResponse;
                }
                return { success: false, error: { message: 'Service error' } };
            }
        },
        '*/cartridge/scripts/constants': {
            REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_ID: 'rzlvSnpdConfigs',
            REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'rzlvSnpdConfigKey',
            REZOLVE_INGESTION_TASK_CUSTOM_OBJECT_ID: 'rezolveIngestionTask'
        },
        '*/cartridge/scripts/util/collections': {
            forEach: function (collection, callback) {
                if (collection && collection.length) {
                    for (var i = 0; i < collection.length; i++) {
                        callback(collection[i]);
                    }
                }
            }
        },
        '*/cartridge/scripts/util/rzlvSnpdUtils': {
            safeGetProp: function (obj, chain, defaultVal) {
                if (!obj || !chain) return defaultVal;
                var parts = chain.split('.');
                var current = obj;
                for (var i = 0; i < parts.length; i++) {
                    if (current === null || current === undefined || !(parts[i] in current)) return defaultVal;
                    current = current[parts[i]];
                }
                return current !== null && current !== undefined ? current : defaultVal;
            }
        }
    });
}

function makeProduct(overrides) {
    var product = {
        ID: (overrides && overrides.ID) || 'prod-001',
        name: overrides && overrides.hasOwnProperty('name') ? overrides.name : 'Test Product',
        brand: overrides && overrides.hasOwnProperty('brand') ? overrides.brand : 'TestBrand',
        searchable: true,
        custom: (overrides && overrides.custom) || {},
        categories: (overrides && overrides.categories) || [{
            ID: 'cat1',
            displayName: 'Category 1',
            parent: { ID: 'root', displayName: 'Root', parent: null }
        }],
        isOnline: function () { return (overrides && overrides.isOnline !== undefined) ? overrides.isOnline : true; },
        isMaster: function () { return (overrides && overrides.isMaster) || false; },
        isVariant: function () { return (overrides && overrides.isVariant) || false; },
        isProductSet: function () { return (overrides && overrides.isProductSet) || false; },
        isBundle: function () { return (overrides && overrides.isBundle) || false; },
        isOptionProduct: function () { return false; },
        getLastModified: function () { return (overrides && overrides.lastModified) || new Date(); },
        getImages: function () { return []; },
        variants: (overrides && overrides.variants) || [],
        getVariants: function () { return (overrides && overrides.variants) || []; },
        availabilityModel: (overrides && overrides.availabilityModel !== undefined) ? overrides.availabilityModel : {
            availability: 1,
            inventoryRecord: { custom: {} }
        },
        priceModel: (overrides && overrides.priceModel !== undefined) ? overrides.priceModel : {
            getPriceBookPrice: function () { return { value: 100, currencyCode: 'USD' }; },
            minPrice: { value: 90 }
        },
        variationModel: (overrides && overrides.variationModel) || {
            getProductVariationAttribute: function () { return null; },
            getVariationGroups: function () { return []; }
        }
    };
    return product;
}

describe('rezolveSnpdIngestion', function () {
    beforeEach(function () {
        serviceCallSuccess = true;
        serviceCallResponse = { success: true, data: { id: 'task-123', currentStage: 'INITIATED' } };
    });

    describe('extractAndSubmit - BASELINE', function () {
        it('should return OK status for BASELINE ingestion', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            var result = mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-001'; } }
            );
            assert.equal(result.code, 'FINISHED');
        });

        it('should call updateLastBaselineRun after BASELINE ingestion', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-001'; } }
            );
            assert.equal(mockConfigsHelpers._calls.updateLastBaselineRun.length, 1);
        });

        it('should call service with products', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-001'; } }
            );
            assert.isNotNull(lastServiceCall);
        });

        it('should write products to file before service call', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-001'; } }
            );
            assert.isAbove(mockFileWriterLines.length, 0);
            assert.isTrue(mockFileWriterClosed);
        });

        it('should create an ingestion task custom object on success', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-001'; } }
            );
            assert.equal(createdCustomObjects.length, 1);
            assert.equal(createdCustomObjects[0].type, 'rezolveIngestionTask');
            assert.equal(createdCustomObjects[0].id, 'task-123');
        });

        it('should return ERROR for invalid indexerUploadType', function () {
            var mod = createModule({ products: [] });
            var result = mod.extractAndSubmit(
                { indexerUploadType: 'INVALID' },
                { getID: function () { return 'job-001'; } }
            );
            assert.equal(result.code, 'FAILED');
        });

        it('should return FINISHED when no indexerUploadType is provided', function () {
            var mod = createModule({ products: [] });
            var result = mod.extractAndSubmit(
                {},
                { getID: function () { return 'job-001'; } }
            );
            assert.equal(result.code, 'FINISHED');
        });
    });

    describe('extractAndSubmit - PARTIAL_CATALOG', function () {
        it('should return OK status for PARTIAL_CATALOG ingestion', function () {
            var product = makeProduct({ lastModified: new Date() });
            var mod = createModule({ products: [product], lastExportTime: new Date(Date.now() - 60000).toISOString() });
            var result = mod.extractAndSubmit(
                { indexerUploadType: 'PARTIAL_CATALOG' },
                { getID: function () { return 'job-002'; } }
            );
            assert.equal(result.code, 'FINISHED');
        });

        it('should call updateLastIncrementalRun after PARTIAL_CATALOG', function () {
            var product = makeProduct({ lastModified: new Date() });
            var mod = createModule({ products: [product], lastExportTime: new Date(Date.now() - 60000).toISOString() });
            mod.extractAndSubmit(
                { indexerUploadType: 'PARTIAL_CATALOG' },
                { getID: function () { return 'job-002'; } }
            );
            assert.equal(mockConfigsHelpers._calls.updateLastIncrementalRun.length, 1);
        });

        it('should skip products not modified since last export', function () {
            var oldProduct = makeProduct({
                ID: 'old-prod',
                lastModified: new Date(Date.now() - 120000)
            });
            var mod = createModule({
                products: [oldProduct],
                lastExportTime: new Date(Date.now() - 60000).toISOString()
            });
            mod.extractAndSubmit(
                { indexerUploadType: 'PARTIAL_CATALOG' },
                { getID: function () { return 'job-002'; } }
            );
            // No service call should be made since no products are eligible
            assert.isNull(lastServiceCall);
        });

        it('should include products when inventory has changed', function () {
            var product = makeProduct({
                ID: 'inv-changed',
                lastModified: new Date(Date.now() - 120000)
            });
            var mod = createModule({
                products: [product],
                lastExportTime: new Date(Date.now() - 60000).toISOString(),
                inventoryChanged: true
            });
            mod.extractAndSubmit(
                { indexerUploadType: 'PARTIAL_CATALOG' },
                { getID: function () { return 'job-002'; } }
            );
            assert.isNotNull(lastServiceCall);
        });
    });

    describe('product filtering', function () {
        it('should skip bundle products', function () {
            var bundle = makeProduct({ ID: 'bundle-1', isBundle: true });
            var mod = createModule({ products: [bundle] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-003'; } }
            );
            assert.isNull(lastServiceCall);
        });

        it('should skip product set products', function () {
            var productSet = makeProduct({ ID: 'set-1', isProductSet: true });
            var mod = createModule({ products: [productSet] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-003'; } }
            );
            assert.isNull(lastServiceCall);
        });

        it('should skip offline products', function () {
            var offlineProd = makeProduct({ ID: 'offline-1', isOnline: false });
            var mod = createModule({ products: [offlineProd] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-003'; } }
            );
            assert.isNull(lastServiceCall);
        });

        it('should include online standard products', function () {
            var product = makeProduct({ ID: 'standard-1' });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-003'; } }
            );
            assert.isNotNull(lastServiceCall);
        });
    });

    describe('attribute mapping', function () {
        it('should map system attributes from product', function () {
            var product = makeProduct({ name: 'Widget', brand: 'Acme' });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-004'; } }
            );
            assert.isAbove(mockFileWriterLines.length, 0);
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.title, 'Widget');
        });

        it('should default brands to dash when empty', function () {
            var product = makeProduct({ brand: '' });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-004'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.deepEqual(written.brands, ['-']);
        });

        it('should wrap array attributes as arrays', function () {
            var product = makeProduct({ brand: 'TestBrand' });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-004'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.isArray(written.brands);
            assert.isArray(written.tags);
        });

        it('should map custom attributes', function () {
            var product = makeProduct({ custom: { customTag: 'sale' } });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-004'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.deepEqual(written.tags, ['sale']);
        });

        it('should include attributes array from mapping config', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-004'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.isArray(written.attributes);
        });
    });

    describe('category path building', function () {
        it('should build category path from hierarchy', function () {
            var categories = [{
                ID: 'sub',
                displayName: 'Subcategory',
                parent: {
                    ID: 'parent',
                    displayName: 'Parent',
                    parent: { ID: 'root', displayName: 'Root', parent: null }
                }
            }];
            var product = makeProduct({ categories: categories });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-005'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.isArray(written.categories);
            assert.equal(written.categories[0], 'Parent/Subcategory');
        });

        it('should return dash when no categories exist', function () {
            var product = makeProduct({ categories: [] });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-005'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.include(written.categories, '-');
        });
    });

    describe('price calculation', function () {
        it('should set listPrice and salePrice for standard product', function () {
            var product = makeProduct({
                priceModel: {
                    getPriceBookPrice: function () { return { value: 100, currencyCode: 'USD' }; },
                    minPrice: { value: 80 }
                }
            });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-006'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.priceInfo.originalPrice, 100);
            assert.equal(written.priceInfo.price, 80);
        });

        it('should find minimum list price for master product', function () {
            var variants = [
                {
                    ID: 'v1',
                    priceModel: {
                        getPriceBookPrice: function () { return { value: 120 }; }
                    }
                },
                {
                    ID: 'v2',
                    priceModel: {
                        getPriceBookPrice: function () { return { value: 90 }; }
                    }
                }
            ];
            var product = makeProduct({
                isMaster: true,
                priceModel: {
                    getPriceBookPrice: function () { return { value: 0 }; },
                    minPrice: { value: 80 }
                },
                variants: variants,
                availabilityModel: { availability: 1 }
            });
            product.getVariants = function () { return variants; };
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-006'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.priceInfo.originalPrice, 90);
        });

        it('should set listPrice equal to salePrice when listPrice is 0 and salePrice > 0', function () {
            var product = makeProduct({
                priceModel: {
                    getPriceBookPrice: function () { return { value: 0, currencyCode: 'USD' }; },
                    minPrice: { value: 50 }
                }
            });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-006'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            // When listPrice is 0 and salePrice > 0, salePrice becomes 0 (equal check),
            // then the outer code sets listPrice = salePrice
            assert.equal(written.priceInfo.originalPrice, 50);
        });

        it('should handle missing priceModel gracefully', function () {
            var product = makeProduct({ priceModel: null });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-006'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.priceInfo.originalPrice, 0);
            assert.equal(written.priceInfo.price, 0);
        });
    });

    describe('availability', function () {
        it('should set IN_STOCK for available product', function () {
            var product = makeProduct({
                availabilityModel: { availability: 1 }
            });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-007'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.availability, 'IN_STOCK');
        });

        it('should set OUT_OF_STOCK for unavailable product', function () {
            var product = makeProduct({
                availabilityModel: { availability: 0 }
            });
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-007'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.availability, 'OUT_OF_STOCK');
        });

        it('should check variant availability for master product', function () {
            var variants = [
                { ID: 'v1', availabilityModel: { availability: 0 } },
                { ID: 'v2', availabilityModel: { availability: 1 } }
            ];
            var product = makeProduct({
                isMaster: true,
                variants: variants,
                availabilityModel: { availability: 0 }
            });
            product.getVariants = function () { return variants; };
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-007'; } }
            );
            var written = JSON.parse(mockFileWriterLines[0]);
            assert.equal(written.availability, 'IN_STOCK');
        });
    });

    describe('service error handling', function () {
        it('should not create ingestion task when service fails', function () {
            serviceCallSuccess = false;
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-008'; } }
            );
            assert.equal(createdCustomObjects.length, 0);
        });

        it('should still update timestamps even when service fails', function () {
            serviceCallSuccess = false;
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-008'; } }
            );
            assert.equal(mockConfigsHelpers._calls.updateLastBaselineRun.length, 1);
        });

        it('should not call updateInventoryRecordOnSuccessResponse when service fails', function () {
            serviceCallSuccess = false;
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-008'; } }
            );
            assert.equal(mockConfigsHelpers._calls.updateInventoryRecordOnSuccessResponse.length, 0);
        });
    });

    describe('inventory update on success', function () {
        it('should update inventory records for exported products on success', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE' },
                { getID: function () { return 'job-009'; } }
            );
            assert.isAbove(mockConfigsHelpers._calls.updateInventoryRecordOnSuccessResponse.length, 0);
        });
    });

    describe('use listPriceBookId parameter', function () {
        it('should use provided listPriceBookId from parameters', function () {
            var product = makeProduct();
            var mod = createModule({ products: [product] });
            mod.extractAndSubmit(
                { indexerUploadType: 'BASELINE', listPriceBookId: 'custom-pb' },
                { getID: function () { return 'job-010'; } }
            );
            // Service should be called (product processed)
            assert.isNotNull(lastServiceCall);
        });
    });
});
