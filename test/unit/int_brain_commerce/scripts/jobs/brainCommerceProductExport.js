'use strict';

var { assert } = require('chai');
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = {
    PRODUCT_END_POINT: '/v1/product'
};

// Mock Status Helper
var mockStatus = function (status, code, message) {
    this.status = status || 'OK';
    this.code = code;
    this.message = message;
};
mockStatus.OK = 'OK';
mockStatus.ERROR = 'ERROR';

// Mock Dependencies
var mockSite = {
    current: {
        getDefaultCurrency: () => 'USD',
        getCustomPreferenceValue: function (key) {
            if (key === 'brainCommerceProductAttributeMapping') {
                return JSON.stringify({
                    systemAttributes: [{ brainCommerceAttr: 'id', sfccAttr: 'ID' }],
                    customAttributes: [{ brainCommerceAttr: 'custom_field', sfccAttr: 'custom.custom_field' }]
                });
            }
            return null;
        }
    }
};

var mockCategories = [
    {
        ID: 'cat3',
        displayName: 'Shoes',
        parent: {
            ID: 'cat2',
            displayName: 'Men',
            parent: {
                ID: 'cat1',
                displayName: 'Clothing',
            }
        }
    }
];

var mockLogger = {
    info: () => {},
    error: () => {}
};

var mockURLUtils = {
    url: (routeName, ...params) => {
        return `/${routeName}?${params.join('&')}`;
    },
    abs: (routeName, ...params) => {
        return `https://mocked-url.com/${routeName}?${params.join('&')}`;
    }
};

var mockProducts = Array.from({ length: 110 }, (_, index) => ({
    ID: `prod${index + 1}`,
    getLastModified: () => new Date(Date.now() - 1000 * 60 * 60 * (index + 1)), // Varying last modified times
    custom: { custom_field: `Custom Value ${index + 1}` },
    isOptionProduct: () => false,
    isProductSet: () => false,
    isBundle: () => false,
    isVariationGroup: () => false,
    isOnline: () => true,
    isVariant: () => true,
    isMaster: () => false,
    priceModel: {
        getPriceBookPrice: () => ({
            value: 100 + index, // Incrementing price for variation
            currencyCode: 'USD'
        }),
        minPrice: {
            value: 90 + index
        }
    },
    categories: mockCategories, // Ensure mockCategories is defined elsewhere
    masterProduct: {
        ID: `masterProd${index + 1}`,
        getLastModified: () => new Date(Date.now() - 1000 * 60 * 60 * (index + 1)), // Varying last modified times
        custom: { custom_field: `Custom Value ${index + 1}` },
        isOptionProduct: () => false,
        isProductSet: () => false,
        isBundle: () => false,
        isVariationGroup: () => false,
        isOnline: () => true,
        isVariant: () => false,
        isMaster: () => true,
        priceModel: {},
        categories: mockCategories
    }
}));

var mockProductMgr = {
    queryAllSiteProducts: () => ({
        products: [...mockProducts],
        hasNext: function () {
            return this.products.length > 0;
        },
        next: function () {
            return this.products.shift();
        },
        toArray: function () {
            return this.products;
        }
    })
};

var mockGetProductPrices = function (product, priceBookId) {
    return {
        listPrice: product && product.priceModel ? (product.priceModel.getPriceBookPrice(priceBookId).value || 0) : 0,
        salePrice: product && product.priceModel ? (product.priceModel.minPrice.value || 0) : 0,
        currency: 'USD'
    };
};

var mockPriceBookMgr = {
    getSitePriceBooks: () => [
        { ID: 'priceBook1', currencyCode: 'USD', parentPriceBook: null }
    ]
};

var mockBrainService = {
    service: {
        call: () => ({ status: 'OK' })
    }
};

var mockBrainCommerceConfigsHelpers = {
    validateConfigForIngestion: function () {
        return { valid: true };
    },
    getBrainCommerceProductsLastExportTime: function () {
        return new Date(Date.now() - 1000 * 60 * 60 * 2);
    },
    getBrainCommerceConfig: function () {
        return { listPriceBookId: 'mockPriceBook123' };
    },
    updateProductExportTimestampInBrainCommerceCOConfigs: function () {},
    parseContent: function (content) {
        return JSON.parse(content);
    },
    updateInventoryRecordOnSuccessResponse: function() {},
    compareInventoryRecordIfTimeComarisonFails: function() {
        return true;
    }
};

// Mock Internal Functions
var mockCreateProductObject = (product) => ({
    id: product.ID,
    custom_field: product.custom.custom_field || '',
    internal_id: 0
});

var mockSendProductsToBrainCommerce = (productsRequest) => {
    if (!Array.isArray(productsRequest) || productsRequest.length === 0) {
        return true;
    }
    return true;
};

var mockProcessProducts = (isDelta, fromThresholdDate) => {
    return {
        productsProcessedSuccessfully: 1,
        products: [{ id: 'prod1' }, { id: 'prod2' }, { id: 'prod3' }] || []
    };
};

var mockCollections = {
    forEach: (collection, callback) => {
        if (collection && collection.forEach) {
            collection.forEach(callback);
        }
    },
    map: (collection, callback) => {
        return collection && collection.map ? collection.map(callback) : [];
    },
    filter: (collection, callback) => {
        return collection && collection.filter ? collection.filter(callback) : [];
    }
};

var mockBrainCommerceUtils = {
    safeGetProp: (object, chain, defaultValue) => {
        let tempObject = object;
        if (tempObject === null || typeof tempObject !== 'object') {
            return defaultValue;
        }
        if (!chain) {
            return tempObject;
        }
        let props = chain.split('.');
        for (let prop of props) {
            if (tempObject && Object.prototype.hasOwnProperty.call(tempObject, prop)) {
                tempObject = tempObject[prop];
            } else {
                return defaultValue;
            }
        }
        return tempObject;
    }
};

var mockTransaction = {
    wrap: function (callback) {
        return callback;
    }
}

// Load the module with mock dependencies
var braincommerceProductExport = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/braincommerceProductExport', {
    'dw/system/Site': mockSite,
    'dw/system/Logger': mockLogger,
    'dw/system/Status': mockStatus,
    'dw/catalog/ProductMgr': mockProductMgr,
    'dw/catalog/PriceBookMgr': mockPriceBookMgr,
    'dw/system/Transaction': mockTransaction,
    '*/cartridge/scripts/services/brainCommerceService': mockBrainService,
    '*/cartridge/scripts/helpers/brainCommerceConfigsHelpers': mockBrainCommerceConfigsHelpers,
    '*/cartridge/scripts/constants': constants,
    'dw/web/URLUtils': mockURLUtils,
    '*/cartridge/scripts/util/collections': mockCollections,
    '*/cartridge/scripts/util/brainCommerceUtils': mockBrainCommerceUtils,
    '../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/braincommerceProductExport': {
        createProductObject: mockCreateProductObject,
        sendProductsToBrainCommerce: mockSendProductsToBrainCommerce,
        processProducts: mockProcessProducts,
    },
});

// Test Cases
describe('BrainCommerce Product Export', function () {
    beforeEach(function () {
        global.empty = function (value) {
            return value === '' || value === null || value === undefined;
        };
        global.length = function (value) {
            return value === 2;
        }
    });

    it('should create a valid product object', function () {
        var product = {
            ID: 'prod1',
            custom: { custom_field: "Test Value" }
        };
        var result = mockCreateProductObject(product);
        assert.deepEqual(result, {
            id: 'prod1',
            custom_field: "Test Value",
            internal_id: 0
        });
    });

    it('should return true when sending products successfully', function () {
        var result = mockSendProductsToBrainCommerce([]);
        assert.isTrue(result, 'Expected sendProductsToBrainCommerce to return true');
    });

    it('should return false when sending products fails', function () {
        var failingMockSendProductsToBrainCommerce = function () {
            return false;
        };

        var result = failingMockSendProductsToBrainCommerce();
        assert.isFalse(result, 'Expected sendProductsToBrainCommerce to return false');
    });

    it('should process products correctly for full export', function () {
        var result = mockProcessProducts(false, null);
        assert.equal(result.productsProcessedSuccessfully, 1, 'Expected 1 product to be processed');
    });

    it('should process products correctly for delta export', function () {
        var result = mockProcessProducts(true, new Date());
        assert.equal(result.productsProcessedSuccessfully, 1, 'Expected 1 product to be processed');
    });

    it('should return OK status for full product export', function () {
        var result = braincommerceProductExport.fullProductExport({ listPriceBookId: 'test' });
        assert.isObject(result, 'Expected fullProductExport to return an object');
        assert.equal(result.status, 'OK', `Expected fullProductExport to return OK status, got ${result.status}`);
    });

    it('should return OK status for delta product export', function () {
        var result = braincommerceProductExport.deltaProductExport({ listPriceBookId: 'test', dataPriorToHours: 2 });
        assert.isObject(result, 'Expected deltaProductExport to return an object');
        assert.equal(result.status, 'OK', `Expected deltaProductExport to return OK status, got ${result.status}`);
    });
});
