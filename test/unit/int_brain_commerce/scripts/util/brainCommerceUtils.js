'use strict';

var assert = require('chai').assert;

describe('brainCommerceUtils', function () {
    var brainCommerceUtils = require('../../../../../cartridges/int_brain_commerce/cartridge/scripts/util/brainCommerceUtils');

    it('should return a nested property from an object using a dot-separated string', function () {
        var object = {
            a: {
                b: {
                    c: 'value'
                }
            }
        };
        var result = brainCommerceUtils.safeGetProp(object, 'a.b.c');
        assert.equal(result, 'value');
    });
});
