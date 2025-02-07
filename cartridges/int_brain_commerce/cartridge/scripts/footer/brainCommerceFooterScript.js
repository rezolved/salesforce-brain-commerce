'use strict';

var Site = require('dw/system/Site');

function afterFooter(params) {
    var isBrainCommerceSDKEnabled = Site.getCurrent().getCustomPreferenceValue('isBrainCommerceSDKEnabled');

    if (isBrainCommerceSDKEnabled) {
        var ISML = require('dw/template/ISML');
        var brainCommerceSDKHelpers = require('*/cartridge/scripts/helpers/brainCommerceSDKHelpers');

        var brainCommerceSDKTemplate = 'footer/brainCommerceFooter';
        var templateParams = brainCommerceSDKHelpers.getBrainCommerceSDKConfigData();

        // Render the Brain Commerce SDK template with the template parameters
        ISML.renderTemplate(brainCommerceFooter, templateParams);
    }
}

module.exports = {
    afterFooter: afterFooter
}