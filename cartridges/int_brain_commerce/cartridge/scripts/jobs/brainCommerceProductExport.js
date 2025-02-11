'use strict';

var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var URLUtils = require('dw/web/URLUtils');
var ProductMgr = require('dw/catalog/ProductMgr');
var Transaction = require('dw/system/Transaction');
var PriceBookMgr = require('dw/catalog/PriceBookMgr');

var brainService = require('*/cartridge/scripts/services/brainCommerceService');
var constants = require('*/cartridge/scripts/constants');
var collections = require('*/cartridge/scripts/util/collections');
var brainCommerceUtils = require('*/cartridge/scripts/util/brainCommerceUtils');

var productAttributes = JSON.parse(Site.current.getCustomPreferenceValue('brainCommerceProductAttributeMapping')) || {};
var defaultCurrency = Site.current.getDefaultCurrency();
var CustomObjectMgr = require('dw/object/CustomObjectMgr');

/**
 * Retrieves the last export timestamp from the 'brainCommerce' custom object.
*
* @returns {string|null} The last export timestamp if available, otherwise null.
*/
function getCustomObject() {
    var brainCommerceProductCustomObject = CustomObjectMgr.getCustomObject('brainCommerce', 'brainCommerce');
    var braincommerceProductLastExport = brainCommerceProductCustomObject.custom.productLastExport;
    return braincommerceProductLastExport;
}

var braincommerceProductLastExport = getCustomObject();
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

        while (currentCategory && currentCategory.ID !== 'root') {
            categoryPath.push(currentCategory.displayName);
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

    if (!product) {
        return productData;
    }

    // Fetch system attribute values
    systemAttributes.forEach(function (attribute) {
        if (attribute && attribute.brainCommerceAttr && attribute.sfccAttr) {
            productData[attribute.brainCommerceAttr] = brainCommerceUtils.safeGetProp(product, attribute.sfccAttr, '') || '';
        }
    });

    // Fetch Custom attribute values
    customAttributes.forEach(function (attribute) {
        if (attribute && attribute.brainCommerceAttr && attribute.sfccAttr) {
            var customAttributeValue = brainCommerceUtils.safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
            productData[attribute.brainCommerceAttr] = !empty(customAttributeValue) ? customAttributeValue : '';
        }
    });

    /**
     * Fetch additional product data and formats it for the Brain Commerce service.
     * 1. Category - comma separated list of category paths
     * 2. Price - List Price
     * 3. Sale Price - Sale Price
     * 4. Availability - In Stock or Out of Stock
     * 5. Item Group ID - Master product ID for variants
     * 6. Product Status - Active or Inactive
     * 7. Link - Product URL
     * 8. Image Link - Product Image URL
     */
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
 * Sends the products to Brain Commerce
 * @param {Array} productsRequest product request object
 * @param {Array} productsToBeExported product to be exported to Brain Commerce
 * @param {string} listPriceBookId list price book ID
 * @returns {boolean} true if products were sent, false otherwise
 */
function sendProductsToBrainCommerce(productsRequest, productsToBeExported, listPriceBookId) {
    var response = brainService.service.call({
        requestBody: productsRequest,
        endPoint: constants.PRODUCT_END_POINT
    });

    // Update brainCommerceLastExport product custom attribute
    if (response && response.status === 'OK') {
        Transaction.begin();
        productsToBeExported.forEach(function (product) {
            var productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
            product.custom.brainCommerceAvailabilityAndPriceStatus = productAvailabilityAndPriceStatus;
        });
        Transaction.commit();
    } else {
        Logger.error('Error in Brain commerce service: {0}', response.msg);
        return false;
    }

    return true;
}

/**
 * Checks if the product is eligible for delta export
 * @param {dw.catalog.Product} product Product Object
 * @param {Date} fromThresholdDate Threshold for modified products
 * @param {string} listPriceBookId list price book ID
 * @returns {boolean} true if product is eligible for delta export, false otherwise
 */
function isProductEligibleForDeltaExport(product, fromThresholdDate, listPriceBookId) {
    if (!product) {
        return false;
    }

    // Check if the product is updated after threshold date or last export
    var productLastModified = new Date(product.getLastModified());
    var brainCommerceLastExport = (braincommerceProductLastExport && new Date(braincommerceProductLastExport)) || null;
    var isProductUpdatedAfterThreshold = (fromThresholdDate && productLastModified >= fromThresholdDate) || false;
    var isProductUpdatedAfterLastExport = brainCommerceLastExport && productLastModified > brainCommerceLastExport;
    var isProductUpdated = (fromThresholdDate ? isProductUpdatedAfterThreshold : isProductUpdatedAfterLastExport);

    // Check if the product availability or price status has changed
    var productAvailabilityAndPriceStatus = getProductAvailabilityAndPriceStatus(product, listPriceBookId);
    var availabilityOrPriceStatusChanged = productAvailabilityAndPriceStatus && product.custom.brainCommerceAvailabilityAndPriceStatus !== productAvailabilityAndPriceStatus;

    return isProductUpdated || availabilityOrPriceStatusChanged;
}

/**
 * Processes a collection of products, filtering based on modification time and online status,
 * then sends batched product data to the Brain commerce service.
 *
 * @param {Iterator} products - An iterator of product objects.
 * @param {boolean} isDeltaFeed - Whether to process only recently modified products.
 * @param {Date} fromThresholdDate - The threshold time for modified products when `isDeltaFeed` is true.
 *  @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @returns {Object} - Returns data related to process such as number of successfully processed products.
 */
function processProducts(products, isDeltaFeed, fromThresholdDate, listPriceBookId) {
    var productsRequest = [];
    var productsToBeExported = [];
    var productsProcessedSuccessfully = 0;

    while (products.hasNext()) {
        var product = products.next();

        // Only process products that are type of product, master or variant
        var eligibleProduct = product && (!product.isOptionProduct() && !product.isProductSet() && !product.isBundle() && !product.isVariationGroup());
        if (eligibleProduct) {
            if (isDeltaFeed) {
                var isProductEligibletoExport = isProductEligibleForDeltaExport(product, fromThresholdDate, listPriceBookId);
                // Do not send the product if it was updated before threshold or not updated after last export
                if (!isProductEligibletoExport) {
                    product = null;
                }
            }

            if (product) {
                productsRequest.push(createProductObject(product, listPriceBookId));
                productsToBeExported.push(product);
                productsProcessedSuccessfully += 1;

                // Send products in chunk size and reset the list
                if (productsRequest.length >= 100) {
                    if (!sendProductsToBrainCommerce(productsRequest, productsToBeExported, listPriceBookId)) {
                        return {
                            productsProcessedSuccessfully: productsProcessedSuccessfully
                        };
                    }
                    productsRequest = [];
                    productsToBeExported = [];
                }
            }
        }
    }

    // Send the remaining product in the list
    if (productsRequest.length > 0) {
        if (!sendProductsToBrainCommerce(productsRequest, productsToBeExported, listPriceBookId)) {
            return {
                productsProcessedSuccessfully: productsProcessedSuccessfully
            };
        }
    }

    return {
        productsProcessedSuccessfully: productsProcessedSuccessfully
    };
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

    var productsProcessedSuccessfully = 0;

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            var result = processProducts(allProducts, false, null, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Full Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);
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

    var productsProcessedSuccessfully = 0;

    try {
        var allProducts = ProductMgr.queryAllSiteProducts();
        var hours = parameters.dataPriorToHours;
        var fromThresholdDate = hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : null;
        if (productAttributes) {
            var result = processProducts(allProducts, true, fromThresholdDate, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
        if (productsProcessedSuccessfully > 0) {
            Transaction.wrap(function () {
                var customObject = CustomObjectMgr.getCustomObject('brainCommerce', 'brainCommerce') || CustomObjectMgr.createCustomObject('brainCommerce', 'brainCommerce');
                customObject.custom.productLastExport = new Date();
            });
        }
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Delta Product Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Delta Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);
}

module.exports = { fullProductExport: fullProductExport, deltaProductExport: deltaProductExport };
