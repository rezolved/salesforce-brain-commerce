'use strict';

var Site = require('dw/system/Site');

/**
 * Create the Brain Commerce SDK Head data object
 * @returns {Object} - The Brain Commerce SDK Head data object
 */
function getBrainCommerceSDKHeadData() {
    var sdkURL = Site.getCurrent().getCustomPreferenceValue('brainCommerceSDKURL');

    return {
        sdkURL: sdkURL
    };
}

/**
 * Create the Brain Commerce SDK Config data object
 * @returns {Object} - The Brain Commerce SDK Config data object
 */
function getBrainCommerceSDKConfigData() {
    var baseAPIURL = Site.getCurrent().getCustomPreferenceValue('brainCommerceBaseAPIURL');
    var sdkAPIKey = Site.getCurrent().getCustomPreferenceValue('brainCommerceSDKAPIKey');

    return {
        baseAPIURL: baseAPIURL,
        sdkAPIKey: sdkAPIKey,
        loadBrainCommerceSDK: !!(baseAPIURL && sdkAPIKey)
    };
}

module.exports = {
    getBrainCommerceSDKHeadData: getBrainCommerceSDKHeadData,
    getBrainCommerceSDKConfigData: getBrainCommerceSDKConfigData
};
