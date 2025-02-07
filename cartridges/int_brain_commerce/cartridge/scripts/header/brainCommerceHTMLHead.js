'use stict';

var Site = require('dw/system/Site');

function htmlHead(params) {
    var isBrainCommerceSDKEnabled = Site.getCurrent().getCustomPreferenceValue('isBrainCommerceSDKEnabled');
    
    if (isBrainCommerceSDKEnabled) {
        var ISML = require('dw/template/ISML');
        var brainCommerceSDKHelpers = require('*/cartridge/scripts/helpers/brainCommerceSDKHelpers');
        
        var brainCommerceSDKTemplate = 'head/brainCommerceHTMLHead';
        var templateParams = brainCommerceSDKHelpers.getBrainCommerceSDKData();
        
        // Render the Brain Commerce SDK template with the template parameters
        ISML.renderTemplate(brainCommerceHTMLHead, templateParams);
    }
}

module.exports = {
    htmlHead: htmlHead
}