'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('brainCommerceSDKHelpers', function () {
    var brainCommerceSDKHelpers = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/helpers/brainCommerceSDKHelpers', {
        'dw/system/Site': {
            getCurrent: function () {
                return {
                    getCustomPreferenceValue: function (value) {
                        switch (value) {
                            case 'brainCommerceSDKURL':
                                return 'testSDKURL';
                            case 'brainCommerceBaseAPIURL':
                                return 'testBaseAPIURL';
                            case 'brainCommerceSDKAPIKey':
                                return 'testSDKAPIKey';
                            default:
                                return value;
                        }
                    }
                };
            }
        }
    });


    it('should return a Brain Commerce SDK Head data object', function () {
        var result = brainCommerceSDKHelpers.getBrainCommerceSDKHeadData();
        // type of reult should be object
        assert.isObject(result);

        // result should have sdkURL property
        assert.property(result, 'sdkURL');

        // sdkURL property should be a string
        assert.isString(result.sdkURL);
    });

    it('should return a Brain Commerce SDK Config data object', function () {
        var result = brainCommerceSDKHelpers.getBrainCommerceSDKConfigData();
        // type of reult should be object
        assert.isObject(result);

        // result should have baseAPIURL property
        assert.property(result, 'baseAPIURL');

        // baseAPIURL property should be a string
        assert.isString(result.baseAPIURL);

        // result should have sdkAPIKey property
        assert.property(result, 'sdkAPIKey');

        // sdkAPIKey property should be a string
        assert.isString(result.sdkAPIKey);

        // result should have loadBrainCommerceSDK property
        assert.property(result, 'loadBrainCommerceSDK');

        // loadBrainCommerceSDK property should be a boolean
        assert.isBoolean(result.loadBrainCommerceSDK);
    });
});