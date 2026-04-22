'use strict';

var assert = require('chai').assert;
var proxyquire = require('proxyquire').noCallThru().noPreserveCache();

var rzlvSnpdUtils = proxyquire('../../../../../cartridges/int_brain_commerce/cartridge/scripts/util/rzlvSnpdUtils', {});

describe('rzlvSnpdUtils', function () {
    describe('safeGetProp', function () {
        it('should retrieve a nested property via dot chain', function () {
            var obj = { a: { b: { c: 'value' } } };
            var result = rzlvSnpdUtils.safeGetProp(obj, 'a.b.c');
            assert.equal(result, 'value');
        });

        it('should return the object itself when chain is empty', function () {
            var obj = { a: 1 };
            var result = rzlvSnpdUtils.safeGetProp(obj, '');
            assert.deepEqual(result, obj);
        });

        it('should return the object itself when chain is null', function () {
            var obj = { a: 1 };
            var result = rzlvSnpdUtils.safeGetProp(obj, null);
            assert.deepEqual(result, obj);
        });

        it('should return defaultValue when property is missing', function () {
            var obj = { a: { b: 1 } };
            var result = rzlvSnpdUtils.safeGetProp(obj, 'a.x.y', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should return defaultValue when object is null', function () {
            var result = rzlvSnpdUtils.safeGetProp(null, 'a.b', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should return defaultValue when intermediate property is null', function () {
            var obj = { a: { b: null } };
            var result = rzlvSnpdUtils.safeGetProp(obj, 'a.b.c', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should return defaultValue when object is a primitive', function () {
            var result = rzlvSnpdUtils.safeGetProp(42, 'a.b', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should return defaultValue when object is a string', function () {
            var result = rzlvSnpdUtils.safeGetProp('hello', 'length', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should return defaultValue when object is undefined', function () {
            var result = rzlvSnpdUtils.safeGetProp(undefined, 'a', 'fallback');
            assert.equal(result, 'fallback');
        });

        it('should handle single-level property access', function () {
            var obj = { name: 'test' };
            var result = rzlvSnpdUtils.safeGetProp(obj, 'name');
            assert.equal(result, 'test');
        });
    });
});
