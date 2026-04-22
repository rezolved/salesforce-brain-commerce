const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');
const ProductMgr = require('dw/catalog/ProductMgr');
const PriceBookMgr = require('dw/catalog/PriceBookMgr');
const rzlvSnpdConfigsHelpers = require('*/cartridge/scripts/helpers/rzlvSnpdConfigsHelpers');
const defaultCurrency = Site.current.getDefaultCurrency();
const URLUtils = require('dw/web/URLUtils');
const mappingConfigValue = Site.current.getCustomPreferenceValue('rzlvSnpdProductAttributeMapping');
const collectionName = Site.current.getCustomPreferenceValue('rezolveCollectionName');
const mappingConfig = rzlvSnpdConfigsHelpers.parseContent(mappingConfigValue || '{}');
const locale = require('dw/util/Locale');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');
const constants = require('*/cartridge/scripts/constants');
const priceInventoryDataAttr = 'rzlvLastExportedPriceAndInventory';
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
let rzlvSnpdLastRun;

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
    const rzlvSnpdUtils = require('*/cartridge/scripts/util/rzlvSnpdUtils');
    let attributeValue = '';

    // Check if the attribute is a system attribute
    let variationAttribute = getVariationAttribute(product, attribute.sfccAttr);
    if (variationAttribute && typeof variationAttribute !== 'boolean') {
        const varationAttributeValue = product.variationModel && product.variationModel.getSelectedValue(variationAttribute);
        if (varationAttributeValue) {
            attributeValue = varationAttributeValue.displayValue || varationAttributeValue.value || '';
        }
    } else if (isCustomAttribute) { // Check if the attribute is a custom attribute
        const customAttributeValue = rzlvSnpdUtils.safeGetProp(product.custom, attribute.sfccAttr, attribute.defaultValue);
        attributeValue = !empty(customAttributeValue) ? customAttributeValue : '';
    } else { // If the attribute is a system attribute
        attributeValue = rzlvSnpdUtils.safeGetProp(product, attribute.sfccAttr, attribute.defaultValue) || '';
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
    const result = pathList.join(',');
    return result === '' ? '-' : result;
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
            if (variant.priceModel) {
                let listPrice = variant.priceModel.getPriceBookPrice(priceBookId).value || 0;
                if (priceObj.listPrice === 0 || priceObj.listPrice > listPrice) {
                    priceObj.listPrice = listPrice;
                }
            }
        });
    } else if (product.priceModel) {
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
    const arrayAttributes = ['brands', 'tags', 'colors', 'sizes', 'materials'];

    if (!product) {
        return productData;
    }

    if (mappingConfig.baseData && Array.isArray(mappingConfig.baseData)) {
        mappingConfig.baseData.forEach(function (baseDataItem) {
            if (baseDataItem.systemAttributes && Array.isArray(baseDataItem.systemAttributes)) {
                baseDataItem.systemAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        let value = getAttributeValue(product, attribute, false);
                        if (attribute.snpdAttr === 'brands' && (!value || value === '')) {
                            value = '-';
                        }
                        if (arrayAttributes.indexOf(attribute.snpdAttr) !== -1 && typeof value === 'string') {
                            value = [value];
                        }
                        productData[attribute.snpdAttr] = value;
                    }
                });
            }

            if (baseDataItem.customAttributes && Array.isArray(baseDataItem.customAttributes)) {
                baseDataItem.customAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        let value = getAttributeValue(product, attribute, true);
                        if (arrayAttributes.indexOf(attribute.snpdAttr) !== -1 && typeof value === 'string') {
                            value = [value];
                        }
                        productData[attribute.snpdAttr] = value;
                    }
                });
            }
        });
    }

    if (mappingConfig.attributes && Array.isArray(mappingConfig.attributes)) {
        productData.attributes = [];

        mappingConfig.attributes.forEach(function (attributeItem) {
            if (attributeItem.systemAttributes && Array.isArray(attributeItem.systemAttributes)) {
                attributeItem.systemAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        let value = getAttributeValue(product, attribute, false);
                        if (arrayAttributes.indexOf(attribute.snpdAttr) !== -1 && typeof value === 'string') {
                            value = [value];
                        }
                        productData.attributes.push({
                            key: attribute.snpdAttr,
                            value: {
                                text: Array.isArray(value) ? value : [value]
                            }
                        });
                    }
                });
            }

            if (attributeItem.customAttributes && Array.isArray(attributeItem.customAttributes)) {
                attributeItem.customAttributes.forEach(function (attribute) {
                    if (attribute && attribute.snpdAttr && attribute.sfccAttr) {
                        let value = getAttributeValue(product, attribute, true);
                        if (arrayAttributes.indexOf(attribute.snpdAttr) !== -1 && typeof value === 'string') {
                            value = [value];
                        }
                        productData.attributes.push({
                            key: attribute.snpdAttr,
                            value: {
                                text: Array.isArray(value) ? value : [value]
                            }
                        });
                    }
                });
            }
        });
    }

    /** Add Additional Product Data * */

    // Fetch product category paths
    productData.categories = [getProductCategories(categories)];

    // Fetch product prices and currency
    const productPrices = getProductPrices(product, listPriceBookId);
    if (productPrices.listPrice === 0 && productPrices.salePrice > 0) {
        productPrices.listPrice = productPrices.salePrice;
    }

    productData.priceInfo = {
        currencyCode: productPrices.currency || defaultCurrency,
        price: productPrices.salePrice || productPrices.listPrice || 0,
        originalPrice: productPrices.listPrice || 0,
        cost: 0
    };

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

/**
 * Writes products data to a temporary file and returns the file path
 * @param {Array} productsRequest - Array of product objects
 * @returns {string} - Path to the created file
 */
function writeProductsToFile(productsRequest) {
    const impexDir = File.getRootDirectory(File.IMPEX);
    const catalogDir = new File(impexDir, 'rzlv/catalog');

    if (!catalogDir.exists()) {
        catalogDir.mkdirs();
    }

    const fileName = 'rezolve_products_' + new Date().getTime() + '.jsonld';
    const file = new File(catalogDir, fileName);

    try {
        const fileWriter = new FileWriter(file, 'UTF-8');

        productsRequest.forEach(function (product) {
            const productJson = JSON.stringify(product);
            fileWriter.writeLine(productJson);
        });

        fileWriter.close();
        Logger.info('Products data written to file: {0}', file.getFullPath());
        return file.getFullPath();
    } catch (error) {
        Logger.error('Error writing products to file: {0}', error.message);
        throw error;
    }
}

/**
 * Creates a rezolveIngestionTask custom object with the provided data.
 * @param {string} uploadType - The type of upload (BASELINE, PARTIAL_CATALOG, etc.)
 * @param {Object} response - The response object containing task information
 * @param {string} jobID - The execution ID of the job
 * @param {number} productCount - Number of products exported
 * @param {number} exportTimeSec - Export time in seconds
 * @param {number} uploadTimeSec - Upload time in seconds
 */
function createIngestionTask(uploadType, response, jobID, productCount, exportTimeSec, uploadTimeSec) {
    try {
        const taskId = response.data && response.data.id ? response.data.id : null;
        const currentStage = response.data && response.data.currentStage ? response.data.currentStage : 'INITIATED';

        if (!taskId) {
            Logger.error('No task ID found in response, cannot create ingestion task');
            return;
        }
        Transaction.wrap(function () {
            const ingestionTask = CustomObjectMgr.createCustomObject(
                constants.REZOLVE_INGESTION_TASK_CUSTOM_OBJECT_ID,
                taskId
            );

            ingestionTask.custom.sfccJobExecutionID = jobID;
            ingestionTask.custom.taskID = taskId;
            ingestionTask.custom.jobType = uploadType;
            ingestionTask.custom.currentStage = currentStage;
            ingestionTask.custom.status = 'PENDING';
            ingestionTask.custom.submittedAt = new Date();
            ingestionTask.custom.lastCheckedAt = new Date();

            ingestionTask.custom.productCount = productCount || 0;
            ingestionTask.custom.exportTimeSec = exportTimeSec || 0;
            ingestionTask.custom.uploadTimeSec = uploadTimeSec || 0;

            Logger.info(
                'Created rezolveIngestionTask with ID: {0}, productCount: {1}, exportTimeSec: {2}, uploadTimeSec: {3}',
                taskId,
                productCount,
                exportTimeSec,
                uploadTimeSec
            );
        });
    } catch (error) {
        Logger.error('Error creating rezolveIngestionTask: {0}', error.message);
    }
}

// eslint-disable-next-line valid-jsdoc
/**
 * Sends a batch of products to the Rezolve SNPD service.
 * @param {Array} productsRequest product request object
 * @param {Array} productsToBeExported product to be exported to Rezolve SNPD
 * @param {string} listPriceBookId list price book ID
 * @param {string} uploadType The type of upload (BASELINE, PARTIAL_CATALOG, etc.)
 * @param {string} jobID The execution ID of the job
 * @param {number} exportTimeSec Export time in seconds
 * @returns {Object} Object with success status and upload time in seconds
 */
function sendRequest(
    productsRequest,
    productsToBeExported,
    listPriceBookId,
    uploadType,
    jobID,
    exportTimeSec
) {
    const rzlvSnpdService = require('*/cartridge/scripts/services/rezolveSnpdService');
    Logger.info('Sending ' + productsRequest.length + ' products to Rezolve SNPD service.');

    try {
        const tempFilePath = writeProductsToFile(productsRequest);
        // Use binary file upload instead of string content
        const requestBody = {
            collection: collectionName,
            indexerUploadType: uploadType,
            failureCountThreshold: 1000,
            timeoutMinutes: 100,
            catalog: tempFilePath
        };

        const uploadStartTime = new Date().getTime();

        const response = rzlvSnpdService.initiateTask({
            taskType: 'PRODUCT_INGESTION',
            data: requestBody,
            options: {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            }
        });

        const uploadEndTime = new Date().getTime();
        const uploadTimeSec = Math.floor((uploadEndTime - uploadStartTime) / 10);

        if (!(response && response.success)) {
            Logger.error('Error in Rezolve SNPD product ingestion service: {0}', response && response.error && response.error.message);
            return { success: false, uploadTimeSec: uploadTimeSec };
        }
        // eslint-disable-next-line no-use-before-define
        createIngestionTask(uploadType, response, jobID, productsRequest.length, exportTimeSec, uploadTimeSec);
        productsToBeExported.forEach(function (product) {
            rzlvSnpdConfigsHelpers.updateInventoryRecordOnSuccessResponse(product, listPriceBookId, priceInventoryDataAttr);
        });
        Logger.info('Successfully sent ' + productsRequest.length + ' products to Rezolve SNPD service.');
        return { success: true, uploadTimeSec: uploadTimeSec };
    } catch (error) {
        Logger.error('Error sending catalog data: {0}', error.message);
        return { success: false, uploadTimeSec: 0 };
    }
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
    const productLastModified = new Date(product.getLastModified());
    const lastExport = (rzlvSnpdLastRun && new Date(rzlvSnpdLastRun)) || null;
    let isProductUpdated = lastExport && productLastModified > lastExport;

    // Check if the product availability or price status has changed
    if (!isProductUpdated) {
        isProductUpdated = rzlvSnpdConfigsHelpers.compareInventoryRecordIfTimeComarisonFails(
            product,
            listPriceBookId,
            priceInventoryDataAttr
        );
    }

    return isProductUpdated;
}

/**
 * Processes a collection of products, filtering based on modification time and online status,
 * then sends batched product data to the Rezolve SNPD service.
 *
 * @param {Object} products - An iterator of product objects.
 * @param {boolean} isDeltaFeed - Whether to process only recently modified products.
 * @param {string} listPriceBookId - The ID of the price book to fetch product prices.
 * @param {string} uploadType - The type of upload (e.g., 'BASELINE', 'PARTIAL').
 * @param {string} jobID - The execution ID of the job.
 * @returns {Object} - Returns data related to process such as number of successfully processed products.
 */
function processProducts(products, isDeltaFeed, listPriceBookId, uploadType, jobID) {
    const exportStartTime = new Date().getTime();

    const productsRequest = [];
    const productsToBeExported = [];
    let productsProcessedSuccessfully = 0;

    while (products.hasNext()) {
        let product = products.next();
        // Only process products that are type of product, master or variant
        const eligibleProduct = product && (
            (!product.isProductSet() && !product.isBundle())
            || (product.isMaster() && product.isOptionProduct())
        ) && product.isOnline();
        if (eligibleProduct) {
            if (isDeltaFeed) {
                const isProductEligibletoExport = isProductEligibleForDeltaExport(product, listPriceBookId);
                // Do not send the product if it was updated before updated after last export
                if (!isProductEligibletoExport) {
                    product = null;
                }
            }
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
            }
        }
    }

    const exportEndTime = new Date().getTime();
    const exportTimeSec = Math.floor((exportEndTime - exportStartTime) / 1000);

    // Send the remaining product in the list
    if (productsRequest.length > 0) {
        const result = sendRequest(productsRequest, productsToBeExported, listPriceBookId, uploadType, jobID, exportTimeSec);
        if (!result.success) {
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
 * @param {string} jobID - The execution ID of the job
 */
function baselineIngestion(parameters, jobID) {
    Logger.info('***** Baseline Product Export Job Started *****');
    const jobStartTime = new Date();
    const listPriceBookId = parameters.listPriceBookId || getPriceBookId();
    try {
        processProducts(ProductMgr.queryAllSiteProducts(), false, listPriceBookId, 'BASELINE', jobID);
        rzlvSnpdConfigsHelpers.updateLastBaselineRun(jobStartTime);
        rzlvSnpdConfigsHelpers.updateProductExportTimestampInRzlvCOConfigs(jobStartTime);
    } catch (error) {
        Logger.error('Error in Full Product Export Job: {0}', error.message);
    }
    Logger.info('***** Baseline Product Export Job Finished *****');
}

/**
 * Partial ingestion function.
 * @param {Object} parameters - Parameters for the job.@param parameters
 * @param {string} jobID - The execution ID of the job
 */
function partialIngestion(parameters, jobID) {
    const jobStartTime = new Date();
    Logger.info('***** Partial Product Export Job Started *****');
    const listPriceBookId = parameters.listPriceBookId || getPriceBookId();
    rzlvSnpdLastRun = rzlvSnpdConfigsHelpers.getRzlvProductsLastExportTime();
    try {
        processProducts(ProductMgr.queryAllSiteProducts(), true, listPriceBookId, 'PARTIAL', jobID);
        rzlvSnpdConfigsHelpers.updateLastIncrementalRun(jobStartTime);
        rzlvSnpdConfigsHelpers.updateProductExportTimestampInRzlvCOConfigs(jobStartTime);
    } catch (error) {
        Logger.error('Error in Full Product Export Job: {0}', error.message);
    }
    Logger.info('***** Partial Product Export Job Finished *****');
}

/**
 * Extract and submit product data to Rezolve SNPd.
 * @param {Object} parameters - Parameters for the job.@param parameters
 * @param {Object} jobExecution - JobExecution object
 * @returns {Status} Status object indicating job completion.
 */
function extractAndSubmit(parameters, jobExecution) {
    if (parameters.indexerUploadType) {
        switch (parameters.indexerUploadType) {
            case 'BASELINE':
                baselineIngestion(parameters, jobExecution.getID());
                break;
            case 'PARTIAL_CATALOG':
                partialIngestion(parameters, jobExecution.getID());
                break;
            default:
                Logger.error('Invalid indexerUploadType parameter: ' + parameters.indexerUploadType);
                return new Status(Status.ERROR, 'FAILED');
        }
    }

    return new Status(Status.OK, 'FINISHED');
}

module.exports = {
    extractAndSubmit: extractAndSubmit
};
