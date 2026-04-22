'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var currentSite = Site.getCurrent().getID();
var constants = require('*/cartridge/scripts/constants');

/**
 * Fetches the Brain Commerce custom object configurations or creates a new one if not available.
 *
 * @returns {dw.object.CustomObject} The Brain Commerce custom object.
 */
function getCurentOrNewRzlvCOConfigs() {
    var rzlvSnpdCOConfigs = CustomObjectMgr.getCustomObject(
        constants.REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_ID,
        constants.REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_RECORD_ID
    );

    if (!rzlvSnpdCOConfigs) {
        Transaction.wrap(function () {
            rzlvSnpdCOConfigs = CustomObjectMgr.createCustomObject(
                constants.REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_ID,
                constants.REZOLVE_SNPD_CONFIG_CUSTOM_OBJECT_RECORD_ID
            );
        });
    }

    return rzlvSnpdCOConfigs;
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
 * Retrieves the last product export timestamp from the Rezolve SNPD custom object.
 *
 * @returns {string|null} The last product export timestamp if available, otherwise null.
 */
function getRzlvProductsLastExportTime() {
    const rzlvSnpdProductCustomObject = getCurentOrNewRzlvCOConfigs();
    const rzlvSnpdProductLastExport = rzlvSnpdProductCustomObject && rzlvSnpdProductCustomObject.custom.productLastExport;
    return rzlvSnpdProductLastExport;
}

/**
 * Updates the last incremental product run timestamp in the Rezolve Snpd configurations.
 *
 * @param {Date} timestamp - The timestamp to set as the last product export time.
 */
function updateLastIncrementalRun(timestamp) {
    Transaction.wrap(function () {
        Site.current.setCustomPreferenceValue('lastSuccessfulIncrementalRun', timestamp);
    });
}

/**
 * Updates the last baseline product run timestamp in the Rezolve Snpd configurations.
 *
 * @param {Date} timestamp - The timestamp to set as the last product export time.
 */
function updateLastBaselineRun(timestamp) {
    Transaction.wrap(function () {
        Site.current.setCustomPreferenceValue('lastSuccessfulBaselineRun', timestamp);
    });
}

/**
 * Updates the last product export timestamp in the Brain Commerce custom object configurations.
 *
 * @param {Date} timestamp - The timestamp to set as the last product export time.
 */
function updateProductExportTimestampInRzlvCOConfigs(timestamp) {
    const rzlvSnpdCOConfigs = getCurentOrNewRzlvCOConfigs();

    if (rzlvSnpdCOConfigs) {
        Transaction.wrap(function () {
            rzlvSnpdCOConfigs.custom.productLastExport = timestamp;
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
    let listPrice = 0;
    if (product.priceModel) {
        listPrice = product.priceModel.getPriceBookPrice(listPriceBookId).value || 0;
    } else {
        Logger.warn('Product {0} has no price model', product.ID);
    }
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
 * @param {string} priceInventoryAttribute - The custom attribute name to store the last exported price and inventory data
 * @returns {boolean} true if the product was updated, false otherwise
 */
function compareInventoryRecordIfTimeComarisonFails(product, listPriceBookId, priceInventoryAttribute) {
    let isProductUpdated = false;
    if (product.availabilityModel && product.availabilityModel.inventoryRecord) {
        const productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
        const productData = product.availabilityModel.inventoryRecord.custom && product.availabilityModel.inventoryRecord.custom[priceInventoryAttribute];
        const parsedObject = parseContent(productData);
        const storedData = Object.prototype.hasOwnProperty.call(parsedObject, currentSite) ? parsedObject[currentSite] : '';
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
 * @param {string} priceInventoryAttribute - The custom attribute name to store the last exported price and inventory data
 * @returns {void}
 */
function updateInventoryRecordOnSuccessResponse(product, listPriceBookId, priceInventoryAttribute) {
    const productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
    if (product.availabilityModel && product.availabilityModel.inventoryRecord) {
        const productData = product.availabilityModel.inventoryRecord.custom && product.availabilityModel.inventoryRecord.custom[priceInventoryAttribute];
        const parsedObject = parseContent(productData);
        parsedObject[currentSite] = productAvailabilityAndPriceStatus;
        Transaction.wrap(function () {
            product.availabilityModel.inventoryRecord.custom[priceInventoryAttribute] = JSON.stringify(parsedObject);
        });
    }
}

module.exports = {
    updateLastIncrementalRun: updateLastIncrementalRun,
    updateLastBaselineRun: updateLastBaselineRun,
    updateProductExportTimestampInRzlvCOConfigs: updateProductExportTimestampInRzlvCOConfigs,
    getRzlvProductsLastExportTime: getRzlvProductsLastExportTime,
    compareInventoryRecordIfTimeComarisonFails: compareInventoryRecordIfTimeComarisonFails,
    updateInventoryRecordOnSuccessResponse: updateInventoryRecordOnSuccessResponse,
    parseContent: parseContent
};
