'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('brainCommerceSDKHelpers', function () {
    var mockSite = {
        getCurrent: function () {
            return {
                getCustomPreferenceValue: function (key) {
                    var preferences = {
                        brainCommerceSDKURL: 'testSDKURL',
                        brainCommerceFrontendAPIUrl: 'testBaseAPIURL',
                        brainCommerceFrontendAPIKey: 'testSDKAPIKey'
                    };
                    return preferences[key] || null; // Simulating cases where preference is not set
                }
            };
        }
    };

    var brainCommerceSDKHelpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceSDKHelpers', {
        'dw/system/Site': mockSite
    });

    describe('getBrainCommerceSDKHeadData', function () {
        it('should return a Brain Commerce SDK Head data object with sdkURL', function () {
            var result = brainCommerceSDKHelpers.getBrainCommerceSDKHeadData();

            assert.isObject(result);
            assert.property(result, 'sdkURL');
            assert.isString(result.sdkURL);
            assert.equal(result.sdkURL, 'testSDKURL');
        });

        it('should return empty sdkURL if preference is not set', function () {
            var mockSiteWithoutSDKURL = {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function (key) {
                            return key === 'brainCommerceSDKURL' ? null : 'testValue';
                        }
                    };
                }
            };

            var brainCommerceSDKHelpersWithoutSDKURL = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceSDKHelpers', {
                'dw/system/Site': mockSiteWithoutSDKURL
            });

            var result = brainCommerceSDKHelpersWithoutSDKURL.getBrainCommerceSDKHeadData();
            assert.equal(result.sdkURL, '');
        });
    });

    describe('getBrainCommerceSDKConfigData', function () {
        it('should return a Brain Commerce SDK Config data object', function () {
            var result = brainCommerceSDKHelpers.getBrainCommerceSDKConfigData();

            assert.isObject(result);
            assert.property(result, 'baseAPIURL');
            assert.isString(result.baseAPIURL);
            assert.equal(result.baseAPIURL, 'testBaseAPIURL');

            assert.property(result, 'sdkAPIKey');
            assert.isString(result.sdkAPIKey);
            assert.equal(result.sdkAPIKey, 'testSDKAPIKey');

            assert.property(result, 'loadBrainCommerceSDK');
            assert.isBoolean(result.loadBrainCommerceSDK);
            assert.isTrue(result.loadBrainCommerceSDK); // Should be true when both values exist
        });

        it('should return empty baseAPIURL and sdkAPIKey when preferences are not set', function () {
            var mockSiteWithoutConfig = {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return null; // Simulating no values set
                        }
                    };
                }
            };

            var brainCommerceSDKHelpersWithoutConfig = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceSDKHelpers', {
                'dw/system/Site': mockSiteWithoutConfig
            });

            var result = brainCommerceSDKHelpersWithoutConfig.getBrainCommerceSDKConfigData();

            assert.equal(result.baseAPIURL, '');
            assert.equal(result.sdkAPIKey, '');
            assert.isFalse(result.loadBrainCommerceSDK); // Should be false when values are missing
        });

        it('should return loadBrainCommerceSDK as false if one of the required values is missing', function () {
            var mockSitePartialConfig = {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function (key) {
                            if (key === 'brainCommerceFrontendAPIUrl') return 'testBaseAPIURL';
                            return null; // Simulating one missing value
                        }
                    };
                }
            };

            var brainCommerceSDKHelpersPartialConfig = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceSDKHelpers', {
                'dw/system/Site': mockSitePartialConfig
            });

            var result = brainCommerceSDKHelpersPartialConfig.getBrainCommerceSDKConfigData();

            assert.equal(result.baseAPIURL, 'testBaseAPIURL');
            assert.equal(result.sdkAPIKey, '');
            assert.isFalse(result.loadBrainCommerceSDK); // Should be false when sdkAPIKey is missing
        });
    });
});
