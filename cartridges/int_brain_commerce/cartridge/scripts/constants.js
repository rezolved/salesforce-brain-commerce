'use strict';

var base = module.superModule;

base = {
    ADD_PRODUCTS_CONFIG: {
        endPoint: '/v1/products',
        method: 'POST'
    },
    ADD_FAQS_CONFIG: {
        endPoint: '/v1/faqs',
        method: 'POST'
    },
    PRODUCTS_COLLECTION_CONFIG: {
        endPoint: '/v1/products/collection?delete_existing_collection=true',
        method: 'POST'
    },
    FAQS_COLLECTION_CONFIG: {
        endPoint: '/v1/faqs/collection?delete_existing_collection=true',
        method: 'POST'
    },
    getDeleteProductEndPoint: function (productId) {
        return {
            endPoint: '/v1/products/' + productId,
            method: 'DELETE'
        };
    },
    getDeleteFaqEndPoint: function (faqId) {
        return {
            endPoint: '/v1/faqs/' + faqId,
            method: 'DELETE'
        };
    },
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID: 'brainCommerceConfigs',
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'brainCommerceConfigKey'
};

module.exports = base;
