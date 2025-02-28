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
    PRODUCTS_COLLECTION_CONFIG: {
        endPoint: '/v1/product/collection?delete_existing_collection=true',
        method: 'POST'
    },
    FAQS_COLLECTION_CONFIG: {
        endPoint: '/v1/faq/collection?delete_existing_collection=true',
        method: 'POST'
    },
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID: 'brainCommerceConfigs',
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'brainCommerceConfigKey'
};

module.exports = base;
