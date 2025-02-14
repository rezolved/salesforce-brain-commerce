'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');

var constants = require('*/cartridge/scripts/constants');

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

module.exports = {
    getCurentOrNewBrainCommerceCOConfigs: getCurentOrNewBrainCommerceCOConfigs,
    getBrainCommerceProductsLastExportTime: getBrainCommerceProductsLastExportTime,
    getBrainCommerceFAQsLastExportTime: getBrainCommerceFAQsLastExportTime,
    updateProductExportTimestampInBrainCommerceCOConfigs: updateProductExportTimestampInBrainCommerceCOConfigs,
    updateFAQExportTimestampInBrainCommerceCOConfigs: updateFAQExportTimestampInBrainCommerceCOConfigs
};
