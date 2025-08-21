'use strict';

window.addEventListener('load', () => {
    var baseAPIURL = document.querySelector('.brainCommerceSDKBaseAPIURL').value;
    var apiKey = document.querySelector('.brainCommerceSDKAPIKey').value;

    // Check if base api url and api key exist
    if (!baseAPIURL || !apiKey) {
        return;
    }

    // eslint-disable-next-line require-jsdoc
    function initRezolveChat(attempts = 0, maxAttempts = 10, interval = 500) {
        if (window.RezolveSDK && typeof window.RezolveSDK.initializeRezolveChat === 'function') {
            window.RezolveSDK.initializeRezolveChat({
                apiUrl: baseAPIURL,
                apiKey: apiKey
            });
        } else if (attempts < maxAttempts) {
            console.warn(`RezolveSDK not available yet, retrying (${attempts + 1}/${maxAttempts})...`);
            setTimeout(() => initRezolveChat(attempts + 1, maxAttempts, interval), interval);
        } else {
            console.error('RezolveSDK is not available after max attempts. Stopping retries.');
        }
    }

    initRezolveChat();
});
