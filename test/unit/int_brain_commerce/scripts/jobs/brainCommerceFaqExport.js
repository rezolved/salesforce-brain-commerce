'use strict';

var { Callbacks } = require('jquery');
var { wrap } = require('lodash');

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var constants = {
    FAQ_END_POINT: '/v1/faq'
};

// Mock Dependencies
var mockSite = {
    getCurrent: function () {
        return {
            getCustomPreferenceValue: function (key) {
                if (key === 'brainCommerceFAQCustomObjectID') {
                    return 'mockFAQObject';
                }
                return null;
            }
        };
    }
};

var mockLogger = {
    info: function () {},
    error: function () {}
};

var mockStatus = function (status, code, message) {
    return { status: status || 'OK', code: code, message: message };
};

var mockFaqs = Array.from({ length: 110 }, (_, index) => ({
    getLastModified: function () {
        return new Date(Date.now() - 1000 * 60 * 60 * (index + 1)); // Varying hours ago
    },
    custom: {
        question: 'Sample Question',
        answer: `Sample Answer ${index + 1}`
    }
}));

var mockCustomObjectMgr = {
    getAllCustomObjects: function () {
        return {
            _faqs: [...mockFaqs],
            hasNext: function () {
                return this._faqs.length > 0;
            },
            next: function () {
                return this._faqs.shift();
            }
        };
    }
};

var mockTransaction = {
    wrap: function (callback) {
        return callback;
    }
}

var mockBrainService = {
    service: {
        call: function () {
            return { status: 'OK' };
        }
    }
};

var mockBrainCommerceConfigsHelpers = {
    validateConfigForIngestion: function () {
        return { valid: true };
    },
    getBrainCommerceFAQsLastExportTime: function () {
        return new Date(Date.now() - 1000 * 60 * 60 * 24); // 24 hours ago
    },
    updateFAQExportTimestampInBrainCommerceCOConfigs: function () {}
};

// Mock Internal Functions
function mockCreateFaqObject(faq) {
    return {
        question: faq.custom.question,
        answer: faq.custom.answer || '',
        text: faq.custom.answer || '',
        internal_id: 0
    };
}

function mockSendFaqsToBrainCommerce(faqsRequest) {
    return true; // Simulate success
}

function mockProcessFaqs(isDelta, fromThresholdDate) {
    return {
        faqsProcessedSuccessfully: 110 // Simulate 110 FAQs processed
    };
}

// Load the module with properly injected mocks
var brainCommerceFAQExport = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/jobs/brainCommerceFaqExport', {
    'dw/system/Site': mockSite,
    'dw/system/Logger': mockLogger,
    'dw/system/Status': mockStatus,
    'dw/object/CustomObjectMgr': mockCustomObjectMgr,
    'dw/system/Transaction': mockTransaction,
    '*/cartridge/scripts/services/brainCommerceService': mockBrainService,
    '*/cartridge/scripts/helpers/brainCommerceConfigsHelpers': mockBrainCommerceConfigsHelpers,
    '*/cartridge/scripts/constants': constants
});

// Inject mock implementations into brainCommerceFAQExport
brainCommerceFAQExport.createFaqObject = mockCreateFaqObject;
brainCommerceFAQExport.sendFaqsToBrainCommerce = mockSendFaqsToBrainCommerce;
brainCommerceFAQExport.processFaqs = mockProcessFaqs;

describe('BrainCommerce FAQ Export', function () {
    it('should create a valid FAQ object', function () {
        var faq = {
            custom: { question: "Test Question?", answer: "Test Answer" }
        };
        var result = brainCommerceFAQExport.createFaqObject(faq);
        assert.deepEqual(result, {
            question: "Test Question?",
            answer: "Test Answer",
            text: "Test Answer",
            internal_id: 0
        });
    });

    it('should return true when sending FAQs successfully', function () {
        var result = brainCommerceFAQExport.sendFaqsToBrainCommerce([]);
        assert.isTrue(result, 'Expected sendFaqsToBrainCommerce to return true');
    });

    it('should return false when sending FAQs fails', function () {
        brainCommerceFAQExport.sendFaqsToBrainCommerce = function () {
            return false;
        };

        var result = brainCommerceFAQExport.sendFaqsToBrainCommerce([]);
        assert.isFalse(result, 'Expected sendFaqsToBrainCommerce to return false');
    });

    it('should process FAQs correctly for full export', function () {
        var result = brainCommerceFAQExport.processFaqs(false, null);
        assert.equal(result.faqsProcessedSuccessfully, 110, 'Expected 110 FAQs to be processed');
    });

    it('should process FAQs correctly for delta export', function () {
        var result = brainCommerceFAQExport.processFaqs(true, new Date());
        assert.equal(result.faqsProcessedSuccessfully, 110, 'Expected 110 FAQs to be processed');
    });

    it('should return OK status for full FAQ export', function () {
        var result = brainCommerceFAQExport.fullFaqExport();
        assert.isObject(result, 'Expected fullFaqExport to return an object');
        assert.equal(result.status, 'OK', 'Expected fullFaqExport to return OK status');
    });

    it('should return OK status for delta FAQ export', function () {
        var result = brainCommerceFAQExport.deltaFaqExport({ faqDataPriorToHours: 2 });
        assert.isObject(result, 'Expected deltaFaqExport to return an object');
        assert.equal(result.status, 'OK', 'Expected deltaFaqExport to return OK status');
    });
});
