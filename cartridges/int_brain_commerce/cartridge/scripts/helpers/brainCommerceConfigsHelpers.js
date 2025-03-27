'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var currentSite = Site.getCurrent().getID();
var constants = require('*/cartridge/scripts/constants');
var Resource = require('dw/web/Resource');

/**
 * Fetches the Brain Commerce custom object configurations or creates a new one if not available.
 *
 * @returns {dw.object.CustomObject} The Brain Commerce custom object.
 */
function getCurentOrNewBrainCommerceCOConfigs() {
    var brainCommerceCOConfigs = CustomObjectMgr.getCustomObject(constants.BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID, constants.BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID);

    if (!brainCommerceCOConfigs) {
        Transaction.wrap(function () {
            brainCommerceCOConfigs = CustomObjectMgr.createCustomObject(constants.BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_ID, constants.BRAIN_COMMERCE_CONFIG_CUSTOM_OBJECT_RECORD_ID);
        });
    }

    return brainCommerceCOConfigs;
}

/**
 * Tries to parse a given string as a JSON object. If the parsing is successful, the parsed object is returned.
 * If the parsing fails, null is returned.
 * @param {string} stringData - The string to parse.
 * @returns {Object|null} The parsed object or null if the parsing failed.
 */
function parseContent(stringData) {
    try {
        const parsedObject = JSON.parse(stringData);
        return parsedObject !== null ? parsedObject : {}; // Handle null case explicitly
    } catch (error) {
        return {};
    }
}

/**
 * Validates the required configuration for the Brain Commerce product ingestion job.
 *
 * @returns {Object} An object containing a 'valid' flag and a 'message' property with
 * an error message if the configuration is invalid.
 */
function validateConfigForIngestion() {
    var productMapping = parseContent(Site.current.getCustomPreferenceValue('brainCommerceProductAttributeMapping'));
    var serviceUrl = Site.current.getCustomPreferenceValue('brainCommerceIngestorAPIUrl');
    var serviceApiKey = Site.current.getCustomPreferenceValue('brainCommerceIngestorAPIKey');
    var brainCommerceBackendEnabled = Site.current.getCustomPreferenceValue('isBrainCommerceBackendEnabled');

    var result = {
        message: '',
        valid: false
    };

    if (!brainCommerceBackendEnabled) {
        result.message = Resource.msg('label.backendenabled', 'brainCommerce', null);
    } else if (Object.keys(productMapping).length === 0) {
        result.message = Resource.msg('label.productmapping', 'brainCommerce', null);
    } else if (!serviceUrl) {
        result.message = Resource.msg('label.serviceurl', 'brainCommerce', null);
    } else if (!serviceApiKey) {
        result.message = Resource.msg('label.serviceapikey', 'brainCommerce', null);
    } else {
        result.valid = true;
    }

    return result;
}

/**
* Retrieves the last product export timestamp from the Brain Commerce custom object.
*
* @returns {string|null} The last product export timestamp if available, otherwise null.
*/
function getBrainCommerceProductsLastExportTime() {
    var brainCommerceProductCustomObject = getCurentOrNewBrainCommerceCOConfigs();
    var braincommerceProductLastExport = brainCommerceProductCustomObject && brainCommerceProductCustomObject.custom.productLastExport;
    return braincommerceProductLastExport;
}

/**
 * Retrieves the last FAQs export timestamp from the Brain Commerce custom object.
 *
 * @returns {string|null} The last FAQs export timestamp if available, otherwise null.
 */
function getBrainCommerceFAQsLastExportTime() {
    var brainCommerceProductCustomObject = getCurentOrNewBrainCommerceCOConfigs();
    var braincommerceProductLastExport = brainCommerceProductCustomObject && brainCommerceProductCustomObject.custom.faqLastExport;
    return braincommerceProductLastExport;
}

/**
 * Updates the last product export timestamp in the Brain Commerce custom object configurations.
 *
 * @param {Date} timestamp - The timestamp to set as the last product export time.
 */
function updateProductExportTimestampInBrainCommerceCOConfigs(timestamp) {
    var brainCommerceCOConfigs = getCurentOrNewBrainCommerceCOConfigs();

    if (brainCommerceCOConfigs) {
        Transaction.wrap(function () {
            brainCommerceCOConfigs.custom.productLastExport = timestamp;
        });
    }
}

/**
 * Updates the last FAQ export timestamp in the Brain Commerce custom object configurations.
 *
 * @param {Date} timestamp - The timestamp to set as the last FAQ export time.
 */
function updateFAQExportTimestampInBrainCommerceCOConfigs(timestamp) {
    var brainCommerceCOConfigs = getCurentOrNewBrainCommerceCOConfigs();

    if (brainCommerceCOConfigs) {
        Transaction.wrap(function () {
            brainCommerceCOConfigs.custom.faqLastExport = timestamp;
        });
    }
}

/**
 * Creates a string with product availability list price and sale price joined by a pipe.
 * @param {dw.catalog.Product} product Product Object
 * @param {string} listPriceBookId list price book ID
 * @returns {string} availabilityAndPriceStatus availability and price status
 */
function getProductAvailabilityAndPriceStatus(product, listPriceBookId) {
    if (!product) {
        return '';
    }

    var availabilityAndPriceStatus = [];

    // Get product availability
    var availability = (product.availabilityModel && product.availabilityModel.availabilityStatus) || '';
    availabilityAndPriceStatus.push(availability);

    // Get product list price
    var listPrice = product.priceModel.getPriceBookPrice(listPriceBookId).value || 0;
    availabilityAndPriceStatus.push(listPrice);

    // Get product sale price
    var salePrice = (product.priceModel && product.priceModel.minPrice.value) || 0;
    availabilityAndPriceStatus.push(salePrice);

    return availabilityAndPriceStatus.join('|');
}

/**
 * Compares the product inventory record with the stored data if the time comparison fails.
 * @param {dw.catalog.Product} product - The product object
 * @param {string} listPriceBookId - The list price book ID
 * @returns {void} true if the product was updated, false otherwise
 */
function compareInventoryRecordIfTimeComarisonFails(product, listPriceBookId) {
    var isProductUpdated = false;
    if (product.availabilityModel && product.availabilityModel.inventoryRecord) {
        var productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
        var productData = product.availabilityModel.inventoryRecord.custom && product.availabilityModel.inventoryRecord.custom.brainCommerceLastExportedPriceAndInventory;
        var parsedObject = parseContent(productData);
        var storedData = Object.prototype.hasOwnProperty.call(parsedObject, currentSite) ? parsedObject[currentSite] : '';
        isProductUpdated = storedData !== productAvailabilityAndPriceStatus;
    } else if (product && !product.isMaster()) {
        Logger.info('Skipping product from delta {0} as the product inventory record is missing!', product.ID);
    }

    return isProductUpdated;
}

/**
 * Updates the inventory record with the product availability and price status when the product is successfully sent to Brain Commerce.
 * @param {dw.catalog.Product} product - The product object
 * @param {string} listPriceBookId - The list price book ID
 * @returns {void}
 */
function updateInventoryRecordOnSuccessResponse(product, listPriceBookId) {
    var productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
    if (product.availabilityModel && product.availabilityModel.inventoryRecord) {
        var productData = product.availabilityModel.inventoryRecord.custom && product.availabilityModel.inventoryRecord.custom.brainCommerceLastExportedPriceAndInventory;
        var parsedObject = parseContent(productData);
        parsedObject[currentSite] = productAvailabilityAndPriceStatus;
        Transaction.wrap(function () {
            product.availabilityModel.inventoryRecord.custom.brainCommerceLastExportedPriceAndInventory = JSON.stringify(parsedObject);
        });
    }
}

module.exports = {
    getCurentOrNewBrainCommerceCOConfigs: getCurentOrNewBrainCommerceCOConfigs,
    getBrainCommerceProductsLastExportTime: getBrainCommerceProductsLastExportTime,
    getBrainCommerceFAQsLastExportTime: getBrainCommerceFAQsLastExportTime,
    updateProductExportTimestampInBrainCommerceCOConfigs: updateProductExportTimestampInBrainCommerceCOConfigs,
    updateFAQExportTimestampInBrainCommerceCOConfigs: updateFAQExportTimestampInBrainCommerceCOConfigs,
    compareInventoryRecordIfTimeComarisonFails: compareInventoryRecordIfTimeComarisonFails,
    updateInventoryRecordOnSuccessResponse: updateInventoryRecordOnSuccessResponse,
    validateConfigForIngestion: validateConfigForIngestion,
    parseContent: parseContent
};
