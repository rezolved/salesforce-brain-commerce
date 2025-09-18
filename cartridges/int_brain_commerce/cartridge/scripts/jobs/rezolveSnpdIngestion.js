const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');
const ProductMgr = require('dw/catalog/ProductMgr');
const PriceBookMgr = require('dw/catalog/PriceBookMgr');
const brainCommerceConfigsHelpers = require('*/cartridge/scripts/helpers/brainCommerceConfigsHelpers');
const defaultCurrency = Site.current.getDefaultCurrency();
const URLUtils = require('dw/web/URLUtils');
const mappingConfigValue = Site.current.getCustomPreferenceValue('brainCommerceSnpdProductAttributeMapping');
const mappingConfig = brainCommerceConfigsHelpers.parseContent(mappingConfigValue || '{}');
const locale = require('dw/util/Locale');

/**
 * Retrieves the price book ID for the default currency.
 *
 * @returns {string} The ID of the price book that matches the default currency, or null if not found.
 */
function getPriceBookId() {
    const collections = require('*/cartridge/scripts/util/collections');
    let priceBookId = '';

    const priceBooks = PriceBookMgr.getSitePriceBooks();
    collections.forEach(priceBooks, function (priceBook) {
        if (priceBook.currencyCode === defaultCurrency) {
            priceBookId = (priceBook.parentPriceBook || priceBook).ID;
        }
    });

    return priceBookId;
}

/**
 * Returns Product Variation Attribute based on the provided attribute if exists.
 * @param {Object} product - Product Object
 * @param {string} attribute - Attribute to be fetched
 * @returns {Object | boolean | null} - Product Variation Attribute or false or null
 */
function getVariationAttribute(product, attribute) {
    return product && product.isVariant() && product.variationModel && product.variationModel.getProductVariationAttribute(attribute);
}

/**
 * Gets the attribute value from the product object for the given attribute.
 * @param {Object} product - The product object from which attributes are extracted.
 * @param {Object} attribute - The attribute object containing the mapping.
 * @param {boolean} isCustomAttribute - Whether the attribute is a custom attribute.
 * @returns {string} - The attribute value.
 */
function getAttributeValue(product, attribute, isCustomAttribute) {
    const brainCommerceUtils = require('*/cartridge/scripts/util/brainCommerceUtils');
    let attributeValue = '';

    // Check if the attribute is a system attribute
    let variationAttribute = getVariationAttribute(product, attribute.sfccAttr);
    if (variationAttribute && typeof variationAttribute !== 'boolean') {
        const varationAttributeValue = product.variationModel && product.variationModel.getSelectedValue(variationAttribute);
        if (varationAttributeValue) {
            attributeValue = varationAttributeValue.displayValue || varationAttributeValue.value || '';
        }
    } else if (isCustomAttribute) { // Check if the attribute is a custom attribute
        const customAttributeValue = brainCommerceUtils.safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
        attributeValue = !empty(customAttributeValue) ? customAttributeValue : '';
    } else { // If the attribute is a system attribute
        attributeValue = brainCommerceUtils.safeGetProp(product, attribute.sfccAttr, attribute.defaultValue) || '';
    }

    return attributeValue;
}

/**
 * Generates a list of category paths from an array of categories.
 *
 * @param {Array} categories - The list of category objects.
 * @returns {string} pathList - comma seperated categories.
 */
function getProductCategories(categories) {
    const pathList = [];
    for (let index = 0; index < categories.length; index += 1) {
        const categoryPath = [];
        let currentCategory = categories[index];

        while (currentCategory && currentCategory.ID !== 'root') {
            categoryPath.push(currentCategory.displayName);
            currentCategory = currentCategory.parent;
        }

        pathList.push(categoryPath.reverse().join('/'));
    }
    return pathList.join(',');
}

/**
 * Gets the product prices for the given product and price book ID.
 * @param {dw.catalog.Product} product - Product Object
 * @param {string} priceBookId - Price Book ID
 * @returns {Object} - List Price and Sale Price
 */
function getProductPrices(product, priceBookId) {
    const collections = require('*/cartridge/scripts/util/collections');
    const priceObj = {
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
        const listPrice = product.priceModel.getPriceBookPrice(priceBookId);
        priceObj.listPrice = (listPrice && listPrice.value) || 0;

        // Update currency if the product has a different currency for the list price
        if (listPrice && listPrice.currencyCode !== 'N/A' && listPrice && listPrice.currencyCode !== defaultCurrency) {
            priceObj.currency = listPrice.currencyCode;
        }
    }

    // Get the sale price for the product
    const salePrice = (product.priceModel && product.priceModel.minPrice.value) || 0;
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
    const productData = {};
    const categories = product.categories;

    if (!product) {
        return productData;
    }

    if (mappingConfig.baseData && Array.isArray(mappingConfig.baseData)) {
        mappingConfig.baseData.forEach(function (baseDataItem) {
            if (baseDataItem.systemAttributes && Array.isArray(baseDataItem.systemAttributes)) {
                baseDataItem.systemAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        productData[attribute.snpdAttr] = getAttributeValue(product, attribute, false);
                    }
                });
            }

            if (baseDataItem.customAttributes && Array.isArray(baseDataItem.customAttributes)) {
                baseDataItem.customAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        productData[attribute.snpdAttr] = getAttributeValue(product, attribute, true);
                    }
                });
            }
        });
    }

    if (mappingConfig.attributes && Array.isArray(mappingConfig.attributes)) {
        productData.attributes = {};

        mappingConfig.attributes.forEach(function (attributeItem) {
            if (attributeItem.systemAttributes && Array.isArray(attributeItem.systemAttributes)) {
                attributeItem.systemAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        productData.attributes[attribute.snpdAttr] = getAttributeValue(product, attribute, false);
                    }
                });
            }

            if (attributeItem.customAttributes && Array.isArray(attributeItem.customAttributes)) {
                attributeItem.customAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        productData.attributes[attribute.snpdAttr] = getAttributeValue(product, attribute, true);
                    }
                });
            }
        });
    }

    /** Add Additional Product Data * */

    // Fetch product category paths
    productData.categories = getProductCategories(categories);

    // Fetch product prices and currency
    const productPrices = getProductPrices(product, listPriceBookId);
    if (productPrices.listPrice === 0 && productPrices.salePrice > 0) {
        productPrices.listPrice = productPrices.salePrice;
    }
    productData.price = productPrices.listPrice || 0;
    productData.sale_price = productPrices.salePrice || 0;
    productData.currency = productPrices.currency || defaultCurrency;

    // Fetch product availability status according to Vertex AI Product Resource
    let availability = 'OUT_OF_STOCK'; // Default to out of stock

    if (product) {
        // Check if product is available for sale
        let isAvailable = false;
        if (product.isMaster()) {
            // For master products, check if any variant is available
            let variants = product.getVariants();
            if (variants && variants.length > 0) {
                for (let i = 0; i < variants.length; i += 1) {
                    let variant = variants[i];
                    if (variant.availabilityModel && variant.availabilityModel.availability > 0) {
                        isAvailable = true;
                        break;
                    }
                }
            }
        } else {
            // For regular products and variants, check availability directly
            isAvailable = product.availabilityModel && product.availabilityModel.availability > 0;
        }
        availability = isAvailable ? 'IN_STOCK' : 'OUT_OF_STOCK';
    }
    productData.availability = availability;

    // Fetch product parent ID for variants
    let pid;

    if (product.searchable) {
        pid = product.ID;
    } else if (product.isVariant()) {
        const variationGroups = product.variationModel && product.variationModel.master
            ? product.variationModel.master.getVariationGroups()
            : [];

        let foundGroup = null;

        for (let k = 0; k < variationGroups.length; k += 1) {
            const group = variationGroups[k];
            const variants = group.getVariants();

            for (let j = 0; j < variants.length; j += 1) {
                if (variants[j].ID === product.ID) {
                    foundGroup = group;
                    break;
                }
            }

            if (foundGroup) break;
        }

        pid = foundGroup ? foundGroup.ID : product.masterProduct.ID;
        productData.primaryProductId = foundGroup ? foundGroup.ID : product.masterProduct.ID;
    } else {
        pid = product.ID;
        productData.primaryProductId = product.ID;
    }

    // Fetch product URL
    productData.uri = product ? URLUtils.abs('Product-Show', 'pid', pid).toString() : '';

    // Fetch locale
    const currentSite = Site.getCurrent();
    const currentLocale = locale.getLocale(currentSite.defaultLocale);
    productData.languageCode = currentLocale.language;

    // Fetch product images according to Vertex AI Product Resource format
    let productImages = [];

    const imageTypesToSearch = ['large', 'main', 'thumbnail', 'hi-res'];

    imageTypesToSearch.forEach(function (imageType) {
        const images = product.getImages(imageType);
        if (images && images.length > 0) {
            for (let i = 0; i < images.length; i += 1) {
                const img = images[i];
                if (img && img.getAbsURL()) {
                    const imageObj = {
                        uri: img.getAbsURL().toString()
                    };
                    try {
                        const originalUrl = img.getImageURL();
                        if (originalUrl) {
                            imageObj.height = 0;
                            imageObj.width = 0;
                        }
                    } catch (e) {
                        imageObj.height = 0;
                        imageObj.width = 0;
                    }
                    productImages.push(imageObj);
                }
            }
        }
    });

    productData.images = productImages;

    return productData;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Sends a batch of products to the Brain Commerce service.
 * @param {Array} productsRequest product request object
 * @param {Array} productsToBeExported product to be exported to Brain Commerce
 * @param {string} listPriceBookId list price book ID
 */
function sendRequest(productsRequest, productsToBeExported, listPriceBookId) {
    const rzlvSnpdService = require('*/cartridge/scripts/services/rezolveSnpdService');
    Logger.info('Sending ' + productsRequest.length + ' products to Brain Commerce service.');

    try {
        let ndjsonData = '';
        productsRequest.forEach(function (product) {
            ndjsonData += JSON.stringify(product) + '\n';
        });
        const requestBody = {
            collection: 'Production',
            indexerUploadType: 'BASELINE',
            failureCountThreshold: 1000,
            timeoutMinutes: 100,
            catalog: ndjsonData
        };

        const response = rzlvSnpdService.initiateTask({
            taskType: 'PRODUCT_INGESTION',
            data: requestBody,
            options: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        });

        if (!(response && response.success)) {
            Logger.error('Error in Brain commerce product ingestion service: {0}', response && response.error && response.error.message);
            return false;
        }

        Logger.info('Successfully sent ' + productsRequest.length + ' products to Brain Commerce service.');
        return true;
    } catch (error) {
        Logger.error('Error sending catalog data: {0}', error.message);
        return false;
    }
}

/**
 * Processes a collection of products, filtering based on modification time and online status,
 * then sends batched product data to the Brain commerce service.
 *
 * @param {Object} products - An iterator of product objects.
 * @param {boolean} isDeltaFeed - Whether to process only recently modified products.
 *  @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @returns {Object} - Returns data related to process such as number of successfully processed products.
 */
function processProducts(products, isDeltaFeed, listPriceBookId) {
    var productsRequest = [];
    var productsToBeExported = [];
    var productsProcessedSuccessfully = 0;

    while (products.hasNext()) {
        const product = products.next();
        // Only process products that are type of product, master or variant
        const eligibleProduct = product && (
            (!product.isProductSet() && !product.isBundle())
            || (product.isMaster() && product.isOptionProduct())
        ) && product.isOnline();
        if (eligibleProduct) {
            if (product) {
                let skipMasterProduct = false;

                if (product.isMaster()) {
                    const allVariants = product.getVariants();
                    const variationGroups = product.variationModel.getVariationGroups();
                    const groupedVariantIDs = new Set();

                    for (let i = 0; i < variationGroups.length; i += 1) {
                        const groupVariants = variationGroups[i].getVariants();
                        for (let j = 0; j < groupVariants.length; j += 1) {
                            groupedVariantIDs.add(groupVariants[j].ID);
                        }
                    }

                    let allVariantsGrouped = true;
                    for (let k = 0; k < allVariants.length; k += 1) {
                        if (!groupedVariantIDs.has(allVariants[k].ID)) {
                            allVariantsGrouped = false;
                            break;
                        }
                    }

                    skipMasterProduct = allVariantsGrouped;
                }

                if (!skipMasterProduct) {
                    productsRequest.push(createProductObject(product, listPriceBookId));
                    productsToBeExported.push(product);
                    productsProcessedSuccessfully += 1;
                }

                // Add master product also in the list if the product is a variant and it's delta feed
                if (isDeltaFeed && product.isVariant()) {
                    productsRequest.push(createProductObject(product.masterProduct, listPriceBookId));
                    productsToBeExported.push(product.masterProduct);
                    productsProcessedSuccessfully += 1;
                }

                // Send products in chunk size and reset the list
                if (productsRequest.length >= 10) {
                    if (!sendRequest(productsRequest, productsToBeExported, listPriceBookId)) {
                        return {
                            productsProcessedSuccessfully: productsProcessedSuccessfully
                        };
                    }
                    productsRequest = [];
                    productsToBeExported = [];
                    return {
                        productsProcessedSuccessfully: productsProcessedSuccessfully
                    };
                }
            }
        }
    }

    // Send the remaining product in the list
    if (productsRequest.length > 0) {
        if (!sendRequest(productsRequest, productsToBeExported, listPriceBookId)) {
            return {
                productsProcessedSuccessfully: productsProcessedSuccessfully
            };
        }
    }

    return {
        productsProcessedSuccessfully: productsProcessedSuccessfully
    };
}

// eslint-disable-next-line valid-jsdoc
/**
 * Baseline ingestion function.
 * @param {Object} parameters - Parameters for the job.@param parameters
 */
function baselineIngestion(parameters) {
    Logger.info('***** Baseline Product Export Job Started *****');

    const listPriceBookId = parameters.listPriceBookId || getPriceBookId();

    try {
        processProducts(ProductMgr.queryAllSiteProducts(), false, listPriceBookId);
    } catch (error) {
        Logger.error('Error in Full Product Export Job: {0}', error.message);
    }
    Logger.info('***** Baseline Product Export Job Finished *****');
}

/**
 * Partial ingestion function.
 */
function partialIngestion() {
    Logger.info('***** Partial Product Export Job Started *****');
    const siteID = Site.getCurrent().getID();
    Logger.info('Partial Ingestion - Site ID: ' + siteID);
    Logger.info('***** Partial Product Export Job Finished *****');
}

/**
 * Extract and submit product data to Rezolve SNPd.
 * @param {Object} parameters - Parameters for the job.@param parameters
 * @returns {Status} Status object indicating job completion.
 */
function extractAndSubmit(parameters) {
    if (parameters.indexerUploadType) {
        switch (parameters.indexerUploadType) {
            case 'BASELINE':
                baselineIngestion(parameters);
                break;
            case 'PARTIAL_CATALOG':
                partialIngestion();
                break;
            default:
                Logger.error('Invalid indexerUploadType parameter: ' + parameters.indexerUploadType);
                return new Status(Status.ERROR, 'FAILED');
        }
    }

    return new Status(Status.OK, 'FINISHED');
}

module.exports = { extractAndSubmit: extractAndSubmit };
