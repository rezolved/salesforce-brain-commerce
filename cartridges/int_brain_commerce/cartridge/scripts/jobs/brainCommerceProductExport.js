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
var brainCommerceConfigsHelpers = require('*/cartridge/scripts/helpers/brainCommerceConfigsHelpers');

var defaultCurrency = Site.current.getDefaultCurrency();
var braincommerceProductLastExport;
var productAttributes = brainCommerceConfigsHelpers.parseContent(Site.current.getCustomPreferenceValue('brainCommerceProductAttributeMapping'));
var imageTypes = Site.current.getCustomPreferenceValue('brainCommerceImageTypes').split(',') || ['main', 'large'];
var Transaction = require('dw/system/Transaction');

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

        pathList.push(categoryPath.reverse().join('/'));
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
 * Gets the attribute value from the product object for the given attribute.
 * @param {dw.catalog.Product} product - The product object from which attributes are extracted.
 * @param {Object} attribute - The attribute object containing the mapping.
 * @param {boolean} isCustomAttribute - Whether the attribute is a custom attribute.
 * @returns {string} - The attribute value.
 */
function getAttributeValue(product, attribute, isCustomAttribute) {
    var attributeValue = '';

    // Check if the attribute is a system attribute
    var variationAttribute = getVariationAttribute(product, attribute.sfccAttr);
    if (variationAttribute) {
        var varationAttributeValue = product.variationModel && product.variationModel.getSelectedValue(variationAttribute);
        attributeValue = varationAttributeValue.displayValue || varationAttributeValue.value || '';
    } else if (isCustomAttribute) { // Check if the attribute is a custom attribute
        var customAttributeValue = brainCommerceUtils.safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
        attributeValue = !empty(customAttributeValue) ? customAttributeValue : '';
    } else { // If the attribute is a system attribute
        attributeValue = brainCommerceUtils.safeGetProp(product, attribute.sfccAttr, attribute.defaultValue) || '';
    }

    return attributeValue;
}

/**
 * Gets the product prices for the given product and price book ID.
 * @param {dw.catalog.Product} product - Product Object
 * @param {string} priceBookId - Price Book ID
 * @returns {Object} - List Price and Sale Price
 */
function getProductPrices(product, priceBookId) {
    var priceObj = {
        listPrice: 0,
        salePrice: 0,
        currency: defaultCurrency
    };

    if (!product) {
        return priceObj;
    }

    // Get the list price for the product
    if (product.isMaster()) {
        // Fetch the minimum list price from the product variants
        collections.forEach(product.variants, function (variant) {
            let listPrice = variant.priceModel.getPriceBookPrice(priceBookId).value || 0;
            if (priceObj.listPrice === 0 || priceObj.listPrice > listPrice) {
                priceObj.listPrice = listPrice;
            }
        });
    } else {
        var listPrice = product.priceModel.getPriceBookPrice(priceBookId);
        priceObj.listPrice = (listPrice && listPrice.value) || 0;

        // Update currency if the product has a different currency for the list price
        if (listPrice && listPrice.currencyCode !== 'N/A' && listPrice && listPrice.currencyCode !== defaultCurrency) {
            priceObj.currency = listPrice.currencyCode;
        }
    }

    // Get the sale price for the product
    var salePrice = (product.priceModel && product.priceModel.minPrice.value) || 0;
    priceObj.salePrice = priceObj.listPrice === salePrice ? 0 : salePrice;

    return priceObj;
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
            productData[attribute.brainCommerceAttr] = getAttributeValue(product, attribute, false);
        }
    });

    // Fetch Custom attribute values
    customAttributes.forEach(function (attribute) {
        if (attribute && attribute.brainCommerceAttr && attribute.sfccAttr) {
            productData[attribute.brainCommerceAttr] = getAttributeValue(product, attribute, true);
        }
    });

    /**
     * Fetch additional product data and formats it for the Brain Commerce service.
     * 1. Category - comma separated list of category paths
     * 2. Price - List Price
     * 3. Sale Price - Sale Price
     * 4. Currency - Currency Code
     * 5. Availability - In Stock or Out of Stock
     * 6. Item Group ID - Master product ID for variants
     * 7. Product Status - Active or Inactive
     * 8. Link - Product URL
     * 9. Image Link - Product Image URL
     */

    // Fetch product category paths
    productData.product_category = getProductCategories(categories);

    // Fetch product prices and currency
    var productPrices = getProductPrices(product, listPriceBookId);
    if (productPrices.listPrice === 0 && productPrices.salePrice > 0) {
        productPrices.listPrice = productPrices.salePrice;
    }
    productData.price = productPrices.listPrice || 0;
    productData.sale_price = productPrices.salePrice || 0;
    productData.currency = productPrices.currency || defaultCurrency;
    // Fetch product availability status 'in_stock' or 'out_of_stock'
    productData.availability = productData.availability === 'IN_STOCK' ? 'in_stock' : 'out_of_stock';

    // Fetch product parent ID for variants
    productData.item_group_id = product.variant ? product.masterProduct.ID : '';

    // Fetch product status 'true' or 'false'
    productData.product_status = productData.product_status === true ? 'true' : 'false';

    // Fetch product URL
    var pid = product.variant && !product.searchable ? product.masterProduct.ID : product.ID;
    productData.link = product ? URLUtils.abs('Product-Show', 'pid', pid).toString() : '';

    // Fetch product image URL
    var productImage = '';
    for (var i = 0; i < imageTypes.length; i += 1) {
        var img = product.getImage(imageTypes[i]);
        if (img && img.getAbsURL()) {
            productImage = img.getAbsURL().toString();
            break;
        }
    }
    productData.image_link = productImage;

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
        endPointConfigs: constants.ADD_PRODUCTS_CONFIG
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
 * @param {string} listPriceBookId list price book ID
 * @returns {boolean} true if product is eligible for delta export, false otherwise
 */
function isProductEligibleForDeltaExport(product, listPriceBookId) {
    if (!product) {
        return false;
    }

    // Check if the product is updated after last export
    var productLastModified = new Date(product.getLastModified());
    var brainCommerceLastExport = (braincommerceProductLastExport && new Date(braincommerceProductLastExport)) || null;
    var isProductUpdated = brainCommerceLastExport && productLastModified > brainCommerceLastExport;

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
 *  @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @returns {Object} - Returns data related to process such as number of successfully processed products.
 */
function processProducts(products, isDeltaFeed, listPriceBookId) {
    var productsRequest = [];
    var productsToBeExported = [];
    var productsProcessedSuccessfully = 0;

    while (products.hasNext()) {
        var product = products.next();

        // Only process products that are type of product, master or variant
        var eligibleProduct = product && (
            (!product.isProductSet() && !product.isBundle() && !product.isVariationGroup())
            || (product.isMaster() && product.isOptionProduct())
        ) && product.isOnline();
        if (eligibleProduct) {
            if (isDeltaFeed) {
                var isProductEligibletoExport = isProductEligibleForDeltaExport(product, listPriceBookId);
                // Do not send the product if it was updated before updated after last export
                if (!isProductEligibletoExport) {
                    product = null;
                }
            }

            if (product) {
                productsRequest.push(createProductObject(product, listPriceBookId));
                productsToBeExported.push(product);
                productsProcessedSuccessfully += 1;

                // Add master product also in the list if the product is a variant and it's delta feed
                if (isDeltaFeed && product.isVariant() && !isProductEligibleForDeltaExport(product.masterProduct, listPriceBookId)) {
                    productsRequest.push(createProductObject(product.masterProduct, listPriceBookId));
                    productsToBeExported.push(product.masterProduct);
                    productsProcessedSuccessfully += 1;
                }

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
 * Resets the products collection in Brain Commerce.
 * @returns {boolean} Returns true if the collection was successfully reset, otherwise false.
 * */
function resetProductsCollection() {
    var response = brainService.service.call({
        requestBody: {},
        endPointConfigs: constants.PRODUCTS_COLLECTION_CONFIG
    });

    if (!(response && response.status === 'OK')) {
        Logger.error('Error in Brain commerce reset product service: {0}', response.msg);
        return false;
    }

    return true;
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
    braincommerceProductLastExport = brainCommerceConfigsHelpers.getBrainCommerceProductsLastExportTime();

    // Check if brain commerce service URL is configured
    var configValidationResult = brainCommerceConfigsHelpers.validateConfigForIngestion();
    if (!configValidationResult.valid) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + configValidationResult.message);
    }

    // Reset product collection before full export
    var hasCollectionReset = resetProductsCollection();
    if (!hasCollectionReset) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Faq Export Job Finished with ERROR: Resetting Product Collection Failed');
    }

    try {
        // Query all site products
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            var result = processProducts(allProducts, false, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
        status = new Status(Status.OK, 'FINISHED', 'Full Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);
    } catch (error) {
        Logger.error('Error in Full Product Export Job: {0}', error.message);
        status = new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + error.message);
    }

    // Update the last export timestamp if products were processed successfully
    if (productsProcessedSuccessfully > 0) {
        brainCommerceConfigsHelpers.updateProductExportTimestampInBrainCommerceCOConfigs(jobStartTime);
    }
    return status;
}

/**
 * Deletes products from Brain Commerce that are mentioned in the delete list in Brain Commerce custom object.
 * */
function deleteProductsFromBrainCommerce() {
    var brainCommerceCOConfigs = brainCommerceConfigsHelpers.getCurentOrNewBrainCommerceCOConfigs();
    var productsToBeDeleted = brainCommerceCOConfigs && brainCommerceCOConfigs.custom.productsToBeDeleted;

    if (productsToBeDeleted && productsToBeDeleted.length > 0) {
        var deletedProducts = [];

        // Delete products from Brain Commerce
        productsToBeDeleted.forEach(function (productID) {
            if (productID) {
                var response = brainService.service.call({
                    requestBody: {},
                    endPointConfigs: constants.getDeleteProductEndPoint(productID)
                });

                if (response && response.status === 'OK') {
                    deletedProducts.push(productID);
                } else {
                    Logger.error('Error in Brain commerce delete product service for product {0} : {1}', productID, response.msg);
                }
            }
        });

        // Remove deleted products from the list
        if (deletedProducts.length > 0) {
            var updatedProductsToBeDeleted = productsToBeDeleted.filter(function (productID) {
                return deletedProducts.indexOf(productID) === -1;
            });

            // Update the list of products to be deleted
            Transaction.wrap(function () {
                brainCommerceCOConfigs.custom.productsToBeDeleted = updatedProductsToBeDeleted;
            });
        }
    }
}

/**
 * Exports only recently modified site products by processing them through the `processProducts` function.
 *
 * @param {Object} parameters - The parameters object containing filtering options.
 * @returns {dw/system/Status} returns job status
 */
function deltaProductExport(parameters) {
    Logger.info('***** Delta Product Export Job Started *****');

    var jobStartTime = new Date();

    // Get the list price book ID
    var listPriceBookId = parameters.listPriceBookId || getPriceBookId();

    // Initalize variables for status and products processed successfully
    var status;
    var productsProcessedSuccessfully = 0;
    braincommerceProductLastExport = brainCommerceConfigsHelpers.getBrainCommerceProductsLastExportTime();

    // Check if brain commerce service URL is configured
    var configValidationResult = brainCommerceConfigsHelpers.validateConfigForIngestion();
    if (!configValidationResult.valid) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Product Export Job Finished with ERROR ' + configValidationResult.message);
    }

    try {
        // Delete products mentioned in the delete list in Brain Commerce custom object
        deleteProductsFromBrainCommerce();
    } catch (error) {
        Logger.error('Error while deleting products from Brain Commerce: {0}', error.message);
    }

    try {
        // Query all site products
        var allProducts = ProductMgr.queryAllSiteProducts();
        if (productAttributes) {
            var result = processProducts(allProducts, true, listPriceBookId);
            productsProcessedSuccessfully = result && result.productsProcessedSuccessfully;
        }
        status = new Status(Status.OK, 'FINISHED', 'Delta Product Export Job Finished, Products Processed => ' + productsProcessedSuccessfully);
    } catch (error) {
        status = new Status(Status.ERROR, 'FINISHED', 'Delta Product Export Job Finished with ERROR ' + error.message);
    }

    // Update the last export timestamp if products were processed successfully
    if (productsProcessedSuccessfully > 0) {
        brainCommerceConfigsHelpers.updateProductExportTimestampInBrainCommerceCOConfigs(jobStartTime);
    }
    return status;
}

module.exports = { fullProductExport: fullProductExport, deltaProductExport: deltaProductExport };
