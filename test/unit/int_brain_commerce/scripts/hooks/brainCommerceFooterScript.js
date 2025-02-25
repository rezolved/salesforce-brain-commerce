'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var renderTemplateCalled = false;
var renderTemplateParams = null;

var mockISML = {
    renderTemplate: function (template, params) {
        renderTemplateCalled = true;
        renderTemplateParams = { template, params };
    }
};

var mockBrainCommerceSDKHelpers = {
    getBrainCommerceSDKConfigData: function () {
        return { key: 'value' };
    }
};

var mockSite = {
    getCurrent: function () {
        return {
            getID: function () { return 'testSite'; },
            getCustomPreferenceValue: function (key) {
                var mockPreferences = {
                    isBrainCommerceFrontendEnabled: false // Default: frontend disabled
                };
                return mockPreferences[key] || null;
            }
        };
    }
};

var brainCommerceFooterScript = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/hooks/brainCommerceFooterScript', {
    'dw/system/Site': mockSite,
    'dw/template/ISML': mockISML,
    '*/cartridge/scripts/helpers/brainCommerceSDKHelpers': mockBrainCommerceSDKHelpers
});

describe('brainCommerceFooterScript', function () {
    beforeEach(function () {
        renderTemplateCalled = false;
        renderTemplateParams = null;
    });

    describe('afterFooter', function () {
        it('should not render template if isBrainCommerceFrontendEnabled is false', function () {
            brainCommerceFooterScript.afterFooter();
            assert.isFalse(renderTemplateCalled, 'ISML.renderTemplate should NOT be called');
        });

        it('should render template if isBrainCommerceFrontendEnabled is true', function () {
            // Correctly modify mockSite to return `true`
            mockSite.getCurrent = function () {
                return {
                    getID: function () { return 'testSite'; },
                    getCustomPreferenceValue: function (key) {
                        return key === 'isBrainCommerceFrontendEnabled' ? true : null;
                    }
                };
            };

            brainCommerceFooterScript.afterFooter();
            assert.isTrue(renderTemplateCalled, 'ISML.renderTemplate should be called');

            // Correctly wrap params inside an object
            assert.deepEqual(renderTemplateParams, {
                template: 'footer/brainCommerceFooter',
                params: { key: 'value' }
            }, 'ISML.renderTemplate should be called with correct parameters');
        });
    });
});
