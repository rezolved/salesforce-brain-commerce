'use strict';

var Site = require('dw/system/Site');

/**
 * HTML Head hook to inject the Brain Commerce SDK script
 */
function htmlHead() {
    var isFrontendEnabled = Site.getCurrent().getCustomPreferenceValue('isBrainCommerceFrontendEnabled');

    if (isFrontendEnabled) {
        var ISML = require('dw/template/ISML');
        var brainCommerceSDKHelpers = require('*/cartridge/scripts/helpers/brainCommerceSDKHelpers');

        var brainCommerceSDKTemplate = 'head/brainCommerceHTMLHead';
        var templateParams = brainCommerceSDKHelpers.getBrainCommerceSDKHeadData();

        // Render the Brain Commerce SDK template with the template parameters
        ISML.renderTemplate(brainCommerceSDKTemplate, templateParams);
    }
}

module.exports = {
    htmlHead: htmlHead
};
