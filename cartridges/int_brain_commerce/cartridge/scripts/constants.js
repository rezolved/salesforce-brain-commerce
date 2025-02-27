'use strict';

var base = module.superModule;

base = {
    ADD_PRODUCTS_CONFIG: {
        endPoint: '/v1/product',
        method: 'POST'
    },
    ADD_FAQS_CONFIG: {
        endPoint: '/v1/faq',
        method: 'POST'
    },
    RESET_PRODUCTS_COLLECTION_CONFIG: {
        endPoint: '/v1/products/reset-collection',
        method: 'DELETE'
    },
    RESET_FAQS_COLLECTION_CONFIG: {
        endPoint: '/v1/faqs/reset-collection',
        method: 'DELETE'
    },
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID: 'brainCommerceConfigs',
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'brainCommerceConfigKey'
};

module.exports = base;
