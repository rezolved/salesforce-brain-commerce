'use strict';

var Site = require('dw/system/Site');
var Logger = require('dw/system/Logger');
var Status = require('dw/system/Status');
var URLUtils = require('dw/web/URLUtils');
var ProductMgr = require('dw/catalog/ProductMgr');
var PriceBookMgr = require('dw/catalog/PriceBookMgr');

var brainService = require('*/cartridge/scripts/services/brainCommerceService');
var constants = require('*/cartridge/scripts/constants');
var collections = require('*/cartridge/scripts/util/collections');
var brainCommerceUtils = require('*/cartridge/scripts/util/brainCommerceUtils');
var productAttributes = JSON.parse(Site.current.getCustomPreferenceValue('brainCommerceProductAttributeMapping')) || {};
var defaultCurrency = Site.current.getDefaultCurrency();
var brainCommerceConfigsHelpers = require('*/cartridge/scripts/helpers/brainCommerceConfigsHelpers');
var braincommerceProductLastExport = brainCommerceConfigsHelpers.getBrainCommerceProductsLastExportTime();

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
 * Returns Product Variation Attribute based on the provided attribute if exists.
 * @param {dw.catalog.Product} product - Product Object
 * @param {string} attribute - Attribute to be fetched
 * @returns {dw.catalog.ProductVariationAttribute | boolean | null} - Product Variation Attribute or false or null
 */
function getVariationAttribute(product, attribute) {
    return product && product.isVariant() && product.variationModel && product.variationModel.getProductVariationAttribute(attribute);
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
            var variationAttribute = getVariationAttribute(product, attribute.sfccAttr);
            if (variationAttribute) {
                var varationAttributeValue = product.variationModel && product.variationModel.getSelectedValue(variationAttribute);
                productData[attribute.brainCommerceAttr] = varationAttributeValue.displayValue || varationAttributeValue.value || '';
            } else {
                var customAttributeValue = brainCommerceUtils.safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
                productData[attribute.brainCommerceAttr] = !empty(customAttributeValue) ? customAttributeValue : '';
            }
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
        productsToBeExported.forEach(function (product) {
            brainCommerceConfigsHelpers.updateInventoryRecordOnSuccessResponse(product, listPriceBookId);
        });
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
    if (!isProductUpdated) {
        isProductUpdated = brainCommerceConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(product, listPriceBookId);
    }

    return isProductUpdated;
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
        var eligibleProduct = product && (!product.isOptionProduct() && !product.isProductSet() && !product.isBundle() && !product.isVariationGroup()) && product.isOnline();
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
    var priceBookId = '';

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

    var jobStartTime = new Date();

    // Get the list price book ID
    var listPriceBookId = parameters.listPriceBookId || getPriceBookId();

    // Initalize variables for status and products processed successfully
    var status;
    var productsProcessedSuccessfully = 0;

    try {
        // Query all site products
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            var result = processProducts(allProducts, false, null, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
    } catch (error) {
        Logger.error('Error in Full Product Export Job: {0}', error.message);
        status = new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + error.message);
    }

    status = new Status(Status.OK, 'FINISHED', 'Full Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);

    // Update the last export timestamp if products were processed successfully
    if (productsProcessedSuccessfully > 0) {
        brainCommerceConfigsHelpers.updateProductExportTimestampInBrainCommerceCOConfigs(jobStartTime);
    }
    return status;
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

    var jobStartTime = new Date();

    // Get the list price book ID
    var listPriceBookId = parameters.listPriceBookId || getPriceBookId();
    var hours = parameters.dataPriorToHours;
    var fromThresholdDate = hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : null;

    // Initalize variables for status and products processed successfully
    var status;
    var productsProcessedSuccessfully = 0;

    try {
        // Query all site products
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            var result = processProducts(allProducts, true, fromThresholdDate, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
    } catch (error) {
        status = new Status(Status.ERROR, 'FINISHED', 'Delta Product Export Job Finished with ERROR ' + error.message);
    }

    status = new Status(Status.OK, 'FINISHED', 'Delta Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);

    // Update the last export timestamp if products were processed successfully
    if (productsProcessedSuccessfully > 0) {
        brainCommerceConfigsHelpers.updateProductExportTimestampInBrainCommerceCOConfigs(jobStartTime);
    }
    return status;
}

module.exports = { fullProductExport: fullProductExport, deltaProductExport: deltaProductExport };
