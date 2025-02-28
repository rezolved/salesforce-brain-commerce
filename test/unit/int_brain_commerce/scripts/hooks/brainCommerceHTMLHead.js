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
    getBrainCommerceSDKHeadData: function () {
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

var brainCommerceHTMLHeadScript = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/hooks/brainCommerceHTMLHead', {
    'dw/system/Site': mockSite,
    'dw/template/ISML': mockISML,
    '*/cartridge/scripts/helpers/brainCommerceSDKHelpers': mockBrainCommerceSDKHelpers
});

describe('brainCommerceHTMLHeadScript', function () {
    beforeEach(function () {
        renderTemplateCalled = false;
        renderTemplateParams = null;
    });

    describe('htmlHead', function () {
        it('should not render template if isBrainCommerceFrontendEnabled is false', function () {
            brainCommerceHTMLHeadScript.htmlHead();
            assert.isFalse(renderTemplateCalled, 'ISML.renderTemplate should NOT be called');
        });

        it('should render template if isBrainCommerceFrontendEnabled is true', function () {
            // Modify mockSite to return `true` for isBrainCommerceFrontendEnabled
            mockSite.getCurrent = function () {
                return {
                    getID: function () { return 'testSite'; },
                    getCustomPreferenceValue: function (key) {
                        return key === 'isBrainCommerceFrontendEnabled' ? true : null;
                    }
                };
            };

            brainCommerceHTMLHeadScript.htmlHead();
            assert.isTrue(renderTemplateCalled, 'ISML.renderTemplate should be called');

            assert.deepEqual(renderTemplateParams, {
                template: 'head/brainCommerceHTMLHead',
                params: { key: 'value' }
            }, 'ISML.renderTemplate should be called with correct parameters');
        });
    });
});
