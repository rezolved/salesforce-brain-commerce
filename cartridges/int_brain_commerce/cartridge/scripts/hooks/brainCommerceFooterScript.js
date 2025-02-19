'use strict';

var Site = require('dw/system/Site');

/**
 * Afer Footer hook to inject the Brain Commerce config script
 */
function afterFooter() {
    var isFrontendEnabled = Site.getCurrent().getCustomPreferenceValue('isBrainCommerceFrontendEnabled');

    if (isFrontendEnabled) {
        var ISML = require('dw/template/ISML');
        var brainCommerceSDKHelpers = require('*/cartridge/scripts/helpers/brainCommerceSDKHelpers');

        var brainCommerceSDKTemplate = 'footer/brainCommerceFooter';
        var templateParams = brainCommerceSDKHelpers.getBrainCommerceSDKConfigData();

        // Render the Brain Commerce SDK template with the template parameters
        ISML.renderTemplate(brainCommerceSDKTemplate, templateParams);
    }
}

module.exports = {
    afterFooter: afterFooter
};
