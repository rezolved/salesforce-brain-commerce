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
        endPoint: '/v1/product/reset-collection',
        method: 'DELETE'
    },
    RESET_FAQS_COLLECTION_CONFIG: {
        endPoint: '/v1/faq/reset-collection',
        method: 'DELETE'
    },
    getDeleteProductEndPoint: function (productId) {
        return {
            endPoint: '/v1/product/' + productId,
            method: 'DELETE'
        };
    },
    getDeleteFaqEndPoint: function (faqId) {
        return {
            endPoint: '/v1/faq/' + faqId,
            method: 'DELETE'
        };
    },
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID: 'brainCommerceConfigs',
    BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'brainCommerceConfigKey'
};

module.exports = base;
