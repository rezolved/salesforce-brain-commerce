'use strict';

window.addEventListener('load', () => {
    var baseAPIURL = document.querySelector('.brainCommerceSDKBaseAPIURL').value;
    var apiKey = document.querySelector('.brainCommerceSDKAPIKey').value;

    // Check if base api url and api key exist
    if (!baseAPIURL || !apiKey) {
        return;
    }

    const newConfig = {
        BASE_API_URL: baseAPIURL,
        API_KEY: apiKey
    };

    let attempts = 0;
    const maxAttempts = 10;
    const interval = 500;

    /**
     * Attempts to apply configuration by calling the global setConfig function.
     * Retries up to a maximum number of attempts if setConfig is not available.
     * Logs warnings during retries and an error if the maximum attempts are reached.
     */
    function applyConfig() {
        if (typeof window.setConfig === 'function') {
            window.setConfig(newConfig);
        } else if (attempts < maxAttempts) {
            attempts += 1;
            window.console.warn(`setConfig not available yet, retrying (${attempts}/${maxAttempts})...`);
            setTimeout(applyConfig, interval);
        } else {
            window.console.error('setConfig is not available after 10 attempts. Stopping retries.');
        }
    }

    applyConfig();
});
