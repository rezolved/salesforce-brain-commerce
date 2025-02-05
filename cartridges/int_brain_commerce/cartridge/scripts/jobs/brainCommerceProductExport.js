'use strict';

var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var URLUtils = require('dw/web/URLUtils');
var Site = require('dw/system/Site');
var ProductMgr = require('dw/catalog/ProductMgr');
var brainService = require('*/cartridge/scripts/services/brainCommerceService');
var productAttributes = JSON.parse(Site.current.getCustomPreferenceValue('fullProductAttributes')) || {};
var constants = require('*/cartridge/scripts/constants');
var Transaction = require('dw/system/Transaction');
var collections = require('*/cartridge/scripts/util/collections');
var PriceBookMgr = require('dw/catalog/PriceBookMgr');
var defaultCurrency = Site.current.getDefaultCurrency();

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
 * Generates a list of category paths from an array of categories.
 *
 * @param {Array} categories - The list of category objects.
 * @returns {string} pathList - comma seperated categories.
 */
function getProductCategories(categories) {
    var pathList = [];
    for (let index = 0; index < categories.length; index += 1) {
        var categoryPath = [];
        var currentCategory = categories[index];

        while (currentCategory) {
            categoryPath.push(currentCategory.ID);
            currentCategory = currentCategory.parent;
        }

        pathList.push(categoryPath.reverse().join('>'));
    }
    return pathList.join(',');
}

/**
 * Creates a product object with mapped attributes from a given product.
 *
 * @param {Object} product - The product object from which attributes are extracted.
 * @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @returns {Object} - A formatted product object with mapped attributes.
 */
function createProductObject(product, listPriceBookId) {
    var systemAttributes = productAttributes.systemAttributes || [];
    var customAttributes = productAttributes.customAttributes || [];
    var productData = {};
    var categories = product.categories;

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
    productData.product_category = getProductCategories(categories);
    productData.price = product.priceModel.getPriceBookPrice(listPriceBookId).value || 0;
    productData.sale_price = product.priceModel.minPrice.value || 0;
    productData.availability = productData.availability === 'IN_STOCK' ? 'in_stock' : 'out_of_stock';
    productData.item_group_id = product.variant ? product.masterProduct.ID : '';
    productData.product_status = productData.product_status === true ? 'true' : 'false';
    var pid = product.variant && !product.searchable ? product.masterProduct.ID : product.ID;
    productData.link = product ? URLUtils.abs('Product-Show', 'pid', pid).toString() : '';
    var productImage = product && product.getImage ? product.getImage('large') : '';
    productData.image_link = productImage ? productImage.absURL.toString() : '';

    return productData;
}

/**
 * Sends the products to Brain Commerce
 * @param {Array} productsRequest product request object
 * @param {Array} productsToBeExported product to be exported to Brain Commerce
 * @returns {boolean} true if products were sent, false otherwise
 */
function sendProductsToBrainCommerce(productsRequest, productsToBeExported) {
    var response = brainService.service.call({
        requestBody: productsRequest,
        endPoint: constants.PRODUCT_END_POINT
    });

    // Update brainCommerceLastExport product custom attribute
    if (response && response.status === 'OK') {
        Transaction.wrap(function () {
            productsToBeExported.forEach(function (product) {
                product.custom.brainCommerceLastExport = new Date();
            });
        });
    } else {
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
 *  @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @returns {boolean} - Returns true if the the process was scuccessful and false otherwise.
 */
function processProducts(products, isDeltaFeed, totalHours, listPriceBookId) {
    var productsRequest = [];
    var productsToBeExported = [];

    while (products.hasNext()) {
        var product = products.next();

        if (product && isDeltaFeed && (product.master || product.variant)) {
            var productLastModified = new Date(product.getLastModified());
            var brainCommerceLastExport = (product.custom.brainCommerceLastExport && new Date(product.custom.brainCommerceLastExport)) || null;
            var productUpdatedBeforeThreshold = totalHours && productLastModified >= totalHours;
            var productUpdatedBeforeLastExport = brainCommerceLastExport && productLastModified >= brainCommerceLastExport;

            // Do not send the product if it was updated before threshold or not updated after last export
            if (productUpdatedBeforeThreshold || (!totalHours && productUpdatedBeforeLastExport)) {
                product = null;
            }
        }

        if (product && (product.master || product.variant)) {
            productsRequest.push(createProductObject(product, listPriceBookId));
            productsToBeExported.push(product);

            // Send products in chunk size and reset the list
            if (productsRequest.length >= 100) {
                if (!sendProductsToBrainCommerce(productsRequest, productsToBeExported)) {
                    return false;
                }
                productsRequest = [];
                productsToBeExported = [];
            }
        }
    }

    // Send the remaining product in the list
    if (productsRequest.length > 0) {
        if (!sendProductsToBrainCommerce(productsRequest, productsToBeExported)) {
            return false;
        }
    }

    return true;
}

/**
 * Retrieves the price book ID for the default currency.
 *
 * @returns {string} The ID of the price book that matches the default currency, or null if not found.
 */
function getPriceBookId() {
    var priceBookId;
    var priceBooks = PriceBookMgr.getSitePriceBooks();
    collections.forEach(priceBooks, function (priceBook) {
        if (priceBook.currencyCode === defaultCurrency) {
            priceBookId = (priceBook.parentPriceBook || priceBook).ID;
        }
    });
    return priceBookId;
}

/**
 * Exports all site products by processing them through the `processProducts` function.
 * @param {Object} parameters - The parameters object containing filtering options.
 * @returns {dw/system/Status} returns job status
 */
function fullProductExport(parameters) {
    Logger.info('***** Full Product Export Job Started *****');

    var listPriceBookId = parameters.listPriceBookId;
    if (!listPriceBookId) {
        listPriceBookId = getPriceBookId();
    }

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            processProducts(allProducts, false, null, listPriceBookId);
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

    var listPriceBookId = parameters.listPriceBookId;
    if (!listPriceBookId) {
        listPriceBookId = getPriceBookId();
    }

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        var hours = parameters.dataPriorToHours;
        var totalHours = new Date(Date.now() - hours * 60 * 60 * 1000);
        if (productAttributes) {
            processProducts(allProducts, true, totalHours, listPriceBookId);
        }
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Delta Product Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Delta Product Export Job Finished');
}

module.exports = { fullProductExport: fullProductExport, deltaProductExport: deltaProductExport };
