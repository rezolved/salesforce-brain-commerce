'use strict';

var base = module.superModule;

base = {
    ADD_PRODUCTS_CONFIG: {
        endPoint: '/v1/products',
        method: 'POST'
    },
    PRODUCTS_COLLECTION_CONFIG: {
        endPoint: '/v1/products/collection?delete_existing_collection=true',
        method: 'POST'
    },
    REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_ID: 'rzlvSnpdConfigs',
    REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_RECORD_ID: 'rzlvSnpdConfigKey',
    REZOLVE_INGESTION_TASK_CUSTOM_OBJECT_ID: 'rezolveIngestionTask'
};

module.exports = base;
