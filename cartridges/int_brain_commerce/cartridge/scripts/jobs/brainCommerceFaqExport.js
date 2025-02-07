'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var brainService = require('*/cartridge/scripts/services/brainCommerceService');
var constants = require('*/cartridge/scripts/constants');
var Status = require('dw/system/Status');
var Logger = require('dw/system/Logger');
var Transaction = require('dw/system/Transaction');
var Site = require('dw/system/Site');
var bufferDateTime = Site.current.getCustomPreferenceValue('bufferTime');

/**
 * Creates an FAQ object from the given FAQ data.
 *
 * @param {Object} faq - The FAQ object containing custom attributes.
 * @param {Object} faq.custom - The custom attributes of the FAQ.
 * @param {string} faq.custom.question - The question of the FAQ.
 * @param {string} faq.custom.answer - The answer of the FAQ.
 * @returns {Object} Returns a formatted FAQ object with question, answer, text, and an internal ID.
 */
function createFaqObject(faq) {
    var faqs = {};

    faqs.question = faq.custom.question;
    faqs.answer = faq.custom.answer;
    faqs.text = faq.custom.answer;
    faqs.internal_id = 0;

    return faqs;
}

/**
 * Sends FAQs to Brain Commerce and updates the last export timestamp if successful.
 *
 * @param {Object} faqsRequest - The request body containing FAQ data.
 * @param {Array} faqsToBeExported - An array of FAQ objects to be updated with the last export timestamp.
 * @returns {boolean} Returns true if the request was successful, otherwise false.
 */
function sendFaqsToBrainCommerce(faqsRequest, faqsToBeExported) {
    var response = brainService.service.call({
        requestBody: faqsRequest,
        endPoint: constants.FAQ_END_POINT
    });

    // Update brainCommerceFaqLastExport faq custom attribute
    if (response && response.status === 'OK') {
        Transaction.wrap(function () {
            faqsToBeExported.forEach(function (faqLastExport) {
                var bufferDate = new Date();
                var bufferTime = bufferDate.getTime() + bufferDateTime;
                faqLastExport.custom.brainCommerceFaqLastExport = new Date(bufferTime);
            });
        });
    } else {
        Logger.error('Error in Brain commerce service: {0}', response.msg);
        return false;
    }

    return true;
}

/**
 * Processes FAQs for export to Brain Commerce, filtering based on modification time and sending them in chunks.
 *
 * @param {boolean} isDelta - Indicates whether to export only modified FAQs (delta export).
 * @param {number} totalHours - The time threshold (in hours) for filtering FAQs based on last modification.
 * @returns {boolean} Returns true if all FAQs were successfully exported, otherwise false.
 */
function processFaqs(isDelta, totalHours) {
    var faqsRequest = [];
    var faqsToBeExported = [];
    var faqList = CustomObjectMgr.getAllCustomObjects('brain_commerce_faq_list');
    var faqsProcessedSuccessfully = 0;


    while (faqList.hasNext()) {
        var faq = faqList.next();

        if (faq && isDelta) {
            var customObjectLastModified = new Date(faq.getLastModified());
            var brainCommerceFaqLastExport = (faq.custom.brainCommerceFaqLastExport && new Date(faq.custom.brainCommerceFaqLastExport)) || null;
            var faqUpdatedBeforeThreshold = (totalHours && customObjectLastModified >= totalHours) || false;
            var faqUpdatedBeforeLastExport = brainCommerceFaqLastExport && customObjectLastModified >= brainCommerceFaqLastExport;
            var isFaqEligibletoExport = totalHours ? faqUpdatedBeforeThreshold : faqUpdatedBeforeLastExport;

            // Do not send the faq if it was updated before threshold or not updated after last export
            if (!isFaqEligibletoExport) {
                faq = null;
            }
        }

        if (faq) {
            faqsRequest.push(createFaqObject(faq));
            faqsToBeExported.push(faq);
            faqsProcessedSuccessfully += 1;


            // Send faqs in chunk size and reset the list
            if (faqsRequest.length >= 100) {
                if (!sendFaqsToBrainCommerce(faqsRequest, faqsToBeExported)) {
                    return {
                        faqsProcessedSuccessfully: faqsProcessedSuccessfully
                    };
                }
                faqsRequest = [];
                faqsToBeExported = [];
            }
        }
    }

    // Send the remaining faqs in the list
    if (faqsRequest.length > 0) {
        if (!sendFaqsToBrainCommerce(faqsRequest, faqsToBeExported)) {
            return {
                faqsProcessedSuccessfully: faqsProcessedSuccessfully
            };
        }
    }

    return {
        faqsProcessedSuccessfully: faqsProcessedSuccessfully
    };
}

/**
 * Executes a full FAQ export job by processing all FAQs.
 *
 * @returns {Status} The job status after processing the FAQs.
 */
function fullFaqExport() {
    Logger.info('***** Full Faq Export Job Started *****');

    var faqsProcessedSuccessfully = 0;

    try {
        var result = processFaqs(false, null);
        faqsProcessedSuccessfully = result && result.faqsProcessedSuccessfully;
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Full Faq Export Job Finished with ERROR' + error.message);
    }
    return new Status(Status.OK, 'FINISHED', 'Full Faq Export Job Finished, Faqs Processed => ' + faqsProcessedSuccessfully);
}

/**
 * Executes a delta FAQ export job by processing only modified FAQs within a given time range.
 *
 * @param {Object} parameters - The parameters for the export job.
 * @param {number} parameters.faqDataPriorToHours - The number of hours to look back for modified FAQs.
 * @returns {Status} The job status after processing the FAQs.
 */
function deltaFaqExport(parameters) {
    Logger.info('***** Delta Faq Export Job Started *****');

    var faqsProcessedSuccessfully = 0;

    try {
        var hours = parameters.faqDataPriorToHours;
        var totalHours = hours ? new Date(Date.now() - hours * 60 * 60 * 1000) : null;
        var result = processFaqs(true, totalHours);
        faqsProcessedSuccessfully = result && result.faqsProcessedSuccessfully;
    } catch (error) {
        return new Status(Status.ERROR, 'FINISHED', 'Delta Faq Export Job Finished with ERROR ' + error.message);
    }

    return new Status(Status.OK, 'FINISHED', 'Delta Faq Export Job Finished, Faqs Processed => ' + faqsProcessedSuccessfully);
}

module.exports = { fullFaqExport: fullFaqExport, deltaFaqExport: deltaFaqExport };
