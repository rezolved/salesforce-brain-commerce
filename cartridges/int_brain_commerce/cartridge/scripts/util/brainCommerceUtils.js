'use strict';

/**
 * Retrieves a nested property from an object using a dot-separated string.
 *
 * @param {Object} object - The object from which to retrieve the property.
 * @param {string} chain - A dot-separated string representing the path to the property.
 * @param {*} [defaultValue] - The value to return if the property is not found or is undefined/null.
 * @returns {*} - The value of the nested property if found, otherwise the default value.
 */
function safeGetProp(object, chain, defaultValue) {
    var tempObject = object;
    if (tempObject === null || tempObject !== Object(tempObject)) {
        return defaultValue;
    }
    if (!chain) {
        return tempObject;
    }
    var prop;
    var props = chain.split('.');
    for (var q = 0, len = props.length; q < len; q += 1) {
        prop = props[q];
        if (prop in tempObject && typeof tempObject[prop] !== 'undefined' && tempObject[prop] !== null) {
            tempObject = tempObject[prop];
        } else {
            return defaultValue;
        }
    }
    return tempObject;
}

module.exports = {
    safeGetProp: safeGetProp
};
