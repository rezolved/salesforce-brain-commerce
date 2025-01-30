'use strict';

var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var ProductMgr = require('dw/catalog/ProductMgr');
var brainService = require('*/cartridge/scripts/services/brainCommerceService');
var productAttributes = JSON.parse(Site.current.getCustomPreferenceValue('fullProductAttributes')) || {};
var constants = require('*/cartridge/scripts/constants');

/**
 * Retrieves a nested property from an object using a dot-separated string.
 *
 * @param {Object} object - The object from which to retrieve the property.
 * @param {string} chain - A dot-separated string representing the path to the property.
 * @param {*} [defaultValue] - The value to return if the property is not found or is undefined/null.
 * @returns {*} - The value of the nested property if found, otherwise the default value.
 */
function safeGetProp(object, chain, defaultValue) {
    var tempObject = object;
    if (tempObject === null || tempObject !== Object(tempObject)) {
        return defaultValue;
    }
    if (!chain) {
        return tempObject;
    }
    var prop;
    var props = chain.split('.');
    for (var q = 0, len = props.length; q < len; q += 1) {
        prop = props[q];
        if (prop in tempObject && typeof tempObject[prop] !== 'undefined' && tempObject[prop] !== null) {
            tempObject = tempObject[prop];
        } else {
            return defaultValue;
        }
    }
    return tempObject;
}

/**
 * Creates a product object with mapped attributes from a given product.
 *
 * @param {Object} product - The product object from which attributes are extracted.
 * @returns {Object} - A formatted product object with mapped attributes.
 */
function createProductObject(product) {
    var systemAttributes = productAttributes.systemAttributes || [];
    var customAttributes = productAttributes.customAttributes || [];
    var productData = {};

    // Fetch system attribute values
    systemAttributes.forEach(function (attribute) {
        if (attribute && attribute.brainCommerceAttr && attribute.sfccAttr) {
            productData[attribute.brainCommerceAttr] = safeGetProp(product, attribute.sfccAttr, '') || '';
        }
    });

    // Custom attribute values
    customAttributes.forEach(function (attribute) {
        if (attribute && attribute.brainCommerceAttr && attribute.sfccAttr) {
            var customAttributeValue = safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
            productData[attribute.brainCommerceAttr] = !empty(customAttributeValue) ? customAttributeValue : '';
        }
    });

    // Fetch addtional values
    productData.availability = productData.availability === 'IN_STOCK' ? 'in_stock' : 'out_of_stock';
    productData.product_status = productData.product_status === true ? 'true' : 'false';
    productData.link = product ? URLUtils.url('Product-Show', 'pid', product.ID).toString() : '';
    var productImage = product && product.getImage ? product.getImage('large') : '';
    productData.image_link = productImage ? productImage.absURL.toString() : '';

    return productData;
}

/**
 * Sends the products to Brain Commerce
 * @param {Array} productsRequest product request object
 * @returns {boolean} true if products were sent, false otherwise
 */
function sendProductsToBrainCommerce(productsRequest) {
    var response = brainService.service.call({
        requestBody: productsRequest,
        endPoint: constants.PRODUCT_END_POINT
    });

    if (response && response.status !== 'OK') {
        Logger.error('Error in Brain commerce service: {0}', response.msg);
        return false;
    }

    return true;
}

/**
 * Processes a collection of products, filtering based on modification time and online status,
 * then sends batched product data to the Brain commerce service.
 *
 * @param {Iterator} products - An iterator of product objects.
 * @param {boolean} isDeltaFeed - Whether to process only recently modified products.
 * @param {Date} totalHours - The threshold time for modified products when `isDeltaFeed` is true.
 * @returns {boolean} - Returns true if the the process was scuccessful and false otherwise.
 */
function processProducts(products, isDeltaFeed, totalHours) {
    var productsRequest = [];

    while (products.hasNext()) {
        var product = products.next();

        if (product && isDeltaFeed) {
            var productLastModified = new Date(product.getLastModified());
            if (productLastModified < totalHours || !product.online) {
                product = null;
            }
        }

        if (product) {
            productsRequest.push(createProductObject(product));

            // Send products in chunk size and reset the list
            if (productsRequest.length >= 100) {
                if (!sendProductsToBrainCommerce(productsRequest)) {
                    return false;
                }
                productsRequest = [];
            }
        }
    }

    // Send the remaining product in the list
    if (productsRequest.length > 0) {
        if (!sendProductsToBrainCommerce(productsRequest)) {
            return false;
        }
    }

    return true;
}

/**
 * Exports all site products by processing them through the `processProducts` function.
 * @returns {dw/system/Status} returns job status
 */
function fullProductExport() {
    Logger.info('***** Full Product Export Job Started *****');

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            processProducts(allProducts, false);
        }
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Full Product Export Job Finished');
}

/**
 * Exports only recently modified site products by processing them through the `processProducts` function.
 *
 * @param {Object} parameters - The parameters object containing filtering options.
 * @param {number} parameters.dataPriorToHours - The number of hours before the current time to filter modified products.
 * @returns {dw/system/Status} returns job status
 */
function deltaProductExport(parameters) {
    Logger.info('***** Delta Product Export Job Started *****');

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        var hours = parameters.dataPriorToHours;
        var totalHours = new Date(Date.now() - hours * 60 * 60 * 1000);
        if (productAttributes) {
            processProducts(allProducts, true, totalHours);
        }
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Delta Product Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Delta Product Export Job Finished');
}

module.exports = { fullProductExport: fullProductExport, deltaProductExport: deltaProductExport };
