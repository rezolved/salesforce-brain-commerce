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

    it('should return defaultValue when property does not exist', function () {
        var object = {
            a: {
                b: {}
            }
        };
        var result = brainCommerceUtils.safeGetProp(object, 'a.b.c', 'default');
        assert.equal(result, 'default');
    });

    it('should return the whole object if chain is empty', function () {
        var object = {
            a: {
                b: {
                    c: 'value'
                }
            }
        };
        var result = brainCommerceUtils.safeGetProp(object, '');
        assert.deepEqual(result, object);
    });

    it('should return defaultValue when object is null', function () {
        var result = brainCommerceUtils.safeGetProp(null, 'a.b.c', 'default');
        assert.equal(result, 'default');
    });

    it('should return defaultValue when object is undefined', function () {
        var result = brainCommerceUtils.safeGetProp(undefined, 'a.b.c', 'default');
        assert.equal(result, 'default');
    });

    it('should return defaultValue when property is null', function () {
        var object = {
            a: {
                b: {
                    c: null
                }
            }
        };
        var result = brainCommerceUtils.safeGetProp(object, 'a.b.c', 'default');
        assert.equal(result, 'default');
    });

    it('should return defaultValue when property is undefined', function () {
        var object = {
            a: {
                b: {
                    c: undefined
                }
            }
        };
        var result = brainCommerceUtils.safeGetProp(object, 'a.b.c', 'default');
        assert.equal(result, 'default');
    });

    it('should return the full object when given an empty chain', function () {
        var object = { key: 'value' };
        var result = brainCommerceUtils.safeGetProp(object, '');
        assert.deepEqual(result, object);
    });

    it('should return defaultValue when a non-object is provided', function () {
        var result = brainCommerceUtils.safeGetProp('string', 'a.b.c', 'default');
        assert.equal(result, 'default');
    });
});
