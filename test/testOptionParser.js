// hb-lib-tools/test/testOptionParser.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

/* global describe, it */

import assert from 'node:assert'
import util from 'node:util'

import { OptionParser } from 'hb-lib-tools/OptionParser'

const { UserInputError } = OptionParser

// ===== TEST SETUP ============================================================

/** Test parameters.
  * @typedef
  * @property {*} v - The value to test.
  * @property {?*} p1 - The options to test.
  * @property {?*} p2 - The options to test.
  * @property {?*} p3 - The options to test.
  * @property {?*} r - The test result should be strictEqual to `r`.
  * @property {?*} s - The test result should be deepStrictEqual to `s`.
  * @property {?Error} e - The should throw e.
  */
let TestParams /* eslint-disable-line */

/** Format a test value.
  * @param {*} value - The test value.
  * @return {string} - A representation of the test value.
  */
function fmt (value) {
  let format = '%j'
  if (Array.isArray(value)) {
    format = '[%s]'
  } else if (typeof value === 'function') {
    if (value.prototype != null) {
      format = 'class %s'
    } else if (value.constructor.name === 'AsyncFunction') {
      format = 'async %s'
    } else {
      format = 'function %s'
    }
    value = value.name
  } else if (typeof value === 'object' && value != null) {
    if (typeof value.constructor === 'function' &&
      !['Object', 'Array'].includes(value.constructor.name)
    ) {
      format = 'instance %s'
      value = value.constructor.name
    }
  }
  return util.format(format, value)
}

/** Format a message for a test.
  * @params {!TestParams} t - The test parameters.
  * @param {!integer} n - Number of paramters to `f`.
  * @params {!string} msg - The printf-style message.
  * @params {...string} args - Arguments to the printf-style message.
  */
function format (t, msg, ...args) {
  let vmsg = fmt(t.v)
  vmsg = vmsg.length < 12
    ? `${vmsg}${' '.repeat(12)}`.substr(0, 12)
    : `${vmsg}\n${' '.repeat(20)}`
  let omsg = fmt(t.p ?? {})
  omsg = omsg.length < 12
    ? `${omsg}${' '.repeat(12)}`.substr(0, 12)
    : `${omsg}\n${' '.repeat(32)}`
  vmsg += omsg
  return util.format(vmsg + msg, ...args)
}

/** Run a test
  * @param {!function} f - The function to test.
  * @param {!integer} n - Number of paramters to `f`.
  * @param {!TestParams[]} tests - The parameters for the tests to run.
  */
function test (f, tests) {
  tests.forEach((t) => {
    if (t.r !== undefined) {
      it(format(t, 'should return %s', fmt(t.r)), () =>{
        assert.strictEqual(f('key', t.v, t.p), t.r)
      })
    } else if (t.s !== undefined) {
      it(format(t, 'should return %s', fmt(t.s)), () => {
        assert.deepStrictEqual(f('key', t.v, t.p), t.s)
      })
    } else if (t.e != null) {
      it(format(t, 'should throw %s \'%s\'', t.e.name, t.e.message), () => {
        assert.throws(() => { f('key', t.v, t.p) }, t.e)
      })
    }
  })
}

// Standard test values.
const bool = true
const boolString = '' + bool
const int = 42
const intString = '' + int
const num = 42.1
const numString = '' + num
const str = 'supercalifragilisticexpialidocious'
const array = [1, 2]
const object = { a: 1, b: 2 }
const f = () => {}
const g = async () => {}
class A {}
const a = new A()
class B extends A {}
class C extends B {}
const b = new B()
const c = new C()

// ===== RUN TESTS =============================================================

describe('OptionParser', () => {
  describe('.toBool()', () => {
    test(OptionParser.toBool, [
      // Standard values.
      { e: new TypeError('key: missing boolean value') },
      { p: { userInput: true }, e: new UserInputError('key: missing boolean value') },
      { v: null, e: new TypeError('key: missing boolean value') },
      { v: null, p: { userInput: true }, e: new UserInputError('key: missing boolean value') },
      { v: bool, r: true },
      { v: int, e: TypeError('key: not a boolean') },
      { v: int, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: num, e: TypeError('key: not a boolean') },
      { v: num, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: str, e: TypeError('key: not a boolean') },
      { v: str, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: '', e: TypeError('key: not a boolean') },
      { v: '', p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: boolString, r: true },
      { v: intString, e: TypeError('key: not a boolean') },
      { v: intString, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: numString, e: TypeError('key: not a boolean') },
      { v: numString, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: array, e: TypeError('key: not a boolean') },
      { v: array, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: object, e: TypeError('key: not a boolean') },
      { v: object, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: f, e: TypeError('key: not a boolean') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: g, e: TypeError('key: not a boolean') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: a, e: TypeError('key: not a boolean') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not a boolean') },
      { v: A, e: TypeError('key: not a boolean') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not a boolean') },

      // Specific values.
      { v: false, r: false },
      { v: 0, r: false },
      { v: '0', r: false },
      { v: 'false', r: false },
      { v: 'no', r: false },
      { v: 'off', r: false },
      { v: true, r: true },
      { v: 1, r: true },
      { v: '1', r: true },
      { v: 'true', r: true },
      { v: 'yes', r: true },
      { v: 'on', r: true },

      // Parameter checking.
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toInt()', () => {
    test(OptionParser.toInt, [
      // Standard values.
      { e: new TypeError('key: missing integer value') },
      { p: { userInput: true }, e: new UserInputError('key: missing integer value') },
      { v: null, e: new TypeError('key: missing integer value') },
      { v: null, p: { userInput: true }, e: new UserInputError('key: missing integer value') },
      { v: bool, r: 1 },
      { v: bool, p: { userInput: true }, r: 1 },
      { v: int, r: int },
      { v: int, p: { userInput: true }, r: int },
      { v: num, e: TypeError('key: not an integer') },
      { v: num, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: str, e: TypeError('key: not an integer') },
      { v: str, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: '', e: TypeError('key: not an integer') },
      { v: '', p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: boolString, e: TypeError('key: not an integer') },
      { v: boolString, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: intString, r: int },
      { v: intString, p: { userInput: true }, r: int },
      { v: numString, e: TypeError('key: not an integer') },
      { v: numString, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: array, e: TypeError('key: not an integer') },
      { v: array, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: object, e: TypeError('key: not an integer') },
      { v: object, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: f, e: TypeError('key: not an integer') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: g, e: TypeError('key: not an integer') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: a, e: TypeError('key: not an integer') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not an integer') },
      { v: A, e: TypeError('key: not an integer') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not an integer') },

      // Specific values.
      { v: false, r: 0 },
      { v: -0, r: 0 },
      { v: 0, r: 0 },
      { v: -42.0, r: -42 },
      { v: 42.0, r: 42 },
      { v: ' -42 ', r: -42 },
      { v: ' 42 ', r: 42 },
      { v: ' -42x', e: TypeError('key: not an integer') },
      { v: ' 42x', e: TypeError('key: not an integer') },
      { v: ' -42.0 ', r: -42 },
      { v: ' 42.0 ', r: 42 },
      { v: ' -0b00101010 ', r: -42 },
      { v: ' 0b00101010 ', r: 42 },
      { v: ' -0o52 ', r: -42 },
      { v: ' 0o52 ', r: 42 },
      { v: ' -0x2a ', r: -42 },
      { v: ' 0x2a ', r: 42 },
      { v: ' -0x2A ', r: -42 },
      { v: ' 0x2A ', r: 42 },

      // p1: min, p2: max
      { v: int, p: { min: 0 }, r: int },
      { v: int, p: { max: 100 }, r: int },
      { v: int, p: { min: 0, max: 100 }, r: int },
      { v: int, p: { min: 50 }, r: 50 },
      { v: int, p: { max: 100 }, r: int },
      { v: int, p: { min: 50, max: 100 }, r: 50 },
      { v: int, p: { min: 0 }, r: int },
      { v: int, p: { max: 40 }, r: 40 },
      { v: int, p: { min: 0, max: 40 }, r: 40 },

      // Parameter checking.
      { v: int, p: { min: null }, e: new TypeError('min: missing integer value') },
      { v: int, p: { min: null, userInput: true }, e: new TypeError('min: missing integer value') },
      { v: int, p: { min: '' }, e: new TypeError('min: not an integer') },
      { v: int, p: { min: '', userInput: true }, e: new TypeError('min: not an integer') },
      { v: int, p: { max: null }, e: new TypeError('max: missing integer value') },
      { v: int, p: { max: null, userInput: true }, e: new TypeError('max: missing integer value') },
      { v: int, p: { max: '' }, e: new TypeError('max: not an integer') },
      { v: int, p: { max: '', userInput: true }, e: new TypeError('max: not an integer') },
      { v: int, p: { min: 1, max: 0 }, e: new RangeError('max: smaller than min') },
      { v: int, p: { min: 1, max: 0, userInput: true }, e: new RangeError('max: smaller than min') },
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toNumber()', () => {
    test(OptionParser.toNumber, [
      // Standard values.
      { e: new TypeError('key: missing number value') },
      { p: { userInput: true }, e: new UserInputError('key: missing number value') },
      { v: null, e: new TypeError('key: missing number value') },
      { v: null, p: { userInput: true }, e: new UserInputError('key: missing number value') },
      { v: bool, r: 1 },
      { v: bool, p: { userInput: true }, r: 1 },
      { v: int, r: int },
      { v: int, p: { userInput: true }, r: int },
      { v: num, r: num },
      { v: str, e: TypeError('key: not a number') },
      { v: str, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: '', e: TypeError('key: not a number') },
      { v: '', p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: boolString, e: TypeError('key: not a number') },
      { v: boolString, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: intString, r: int },
      { v: numString, r: num },
      { v: array, e: TypeError('key: not a number') },
      { v: array, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: object, e: TypeError('key: not a number') },
      { v: object, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: f, e: TypeError('key: not a number') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: g, e: TypeError('key: not a number') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: a, e: TypeError('key: not a number') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not a number') },
      { v: A, e: TypeError('key: not a number') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not a number') },

      // specific values
      { v: false, r: 0 },
      { v: -0, r: 0 },
      { v: 0, r: 0 },
      { v: -42.0, r: -42 },
      { v: 42.0, r: 42 },
      { v: -42.1, r: -42.1 },
      { v: 42.1, r: 42.1 },
      { v: ' -42 ', r: -42 },
      { v: ' 42 ', r: 42 },
      { v: ' -42. ', r: -42 },
      { v: ' 42. ', r: 42 },
      { v: ' -42.1 ', r: -42.1 },
      { v: ' 42.1 ', r: 42.1 },
      { v: ' -.1 ', r: -0.1 },
      { v: ' .1 ', r: 0.1 },
      { v: '-0b00101010', e: TypeError('key: not a number') },
      { v: '0b00101010', e: TypeError('key: not a number') },
      { v: '-0o52', e: TypeError('key: not a number') },
      { v: '0o52', e: TypeError('key: not a number') },
      { v: '-0x2a', e: TypeError('key: not a number') },
      { v: '0x2a', e: TypeError('key: not a number') },
      { v: '-0x2A', e: TypeError('key: not a number') },
      { v: '0x2A', e: TypeError('key: not a number') },

      // p1: min, p2: max
      { v: int, p: { min: 0 }, r: int },
      { v: int, p: { max: 100 }, r: int },
      { v: int, p: { min: 0, max: 100 }, r: int },
      { v: int, p: { min: 50 }, r: 50 },
      { v: int, p: { max: 100 }, r: int },
      { v: int, p: { min: 50, max: 100 }, r: 50 },
      { v: int, p: { min: 0 }, r: int },
      { v: int, p: { max: 40 }, r: 40 },
      { v: int, p: { min: 0, max: 40 }, r: 40 },

      // Parameter checking.
      { v: int, p: { min: null }, e: new TypeError('min: missing number value') },
      { v: int, p: { min: null, userInput: true }, e: new TypeError('min: missing number value') },
      { v: int, p: { min: '' }, e: new TypeError('min: not a number') },
      { v: int, p: { min: '', userInput: true }, e: new TypeError('min: not a number') },
      { v: int, p: { max: null }, e: new TypeError('max: missing number value') },
      { v: int, p: { max: null, userInput: true }, e: new TypeError('max: missing number value') },
      { v: int, p: { max: '' }, e: new TypeError('max: not a number') },
      { v: int, p: { max: '', userInput: true }, e: new TypeError('max: not a number') },
      { v: int, p: { min: 1, max: 0 }, e: new RangeError('max: smaller than min') },
      { v: int, p: { min: 1, max: 0, userInput: true }, e: new RangeError('max: smaller than min') },
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toString()', () => {
    test(OptionParser.toString, [
      // Standard values.
      { r: '' },
      { v: null, r: '' },
      { v: bool, r: boolString },
      { v: int, r: intString },
      { v: num, r: numString },
      { v: str, r: str },
      { v: '', r: '' },
      { v: array, e: TypeError('key: not a string') },
      { v: array, p: { userInput: true }, e: new UserInputError('key: not a string') },
      { v: object, e: TypeError('key: not a string') },
      { v: object, p: { userInput: true }, e: new UserInputError('key: not a string') },
      { v: f, e: TypeError('key: not a string') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not a string') },
      { v: g, e: TypeError('key: not a string') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not a string') },
      { v: a, e: TypeError('key: not a string') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not a string') },
      { v: A, e: TypeError('key: not a string') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not a string') },

      // p1: nonEmpty
      { p: { nonEmpty: true }, e: new TypeError('key: missing string value') },
      { p: { nonEmpty: true, userInput: true }, e: new UserInputError('key: missing string value') },
      { v: null, p: { nonEmpty: true }, e: new TypeError('key: missing string value') },
      { v: null, p: { nonEmpty: true, userInput: true }, e: new UserInputError('key: missing string value') },
      { v: '', p: { nonEmpty: true }, e: new RangeError('key: not a non-empty string') },
      { v: '', p: { nonEmpty: true, userInput: true }, e: new UserInputError('key: not a non-empty string') },

      // Parameter checking.
      { v: bool, p: { nonEmpty: null }, e: new TypeError('nonEmpty: missing boolean value') },
      { v: bool, p: { nonEmpty: '' }, e: new TypeError('nonEmpty: not a boolean') },
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toArray()', () => {
    test(OptionParser.toArray, [
      // Standard values.
      { s: [] },
      { v: null, s: [] },
      { v: bool, s: [bool] },
      { v: int, s: [int] },
      { v: num, s: [num] },
      { v: str, s: [str] },
      { v: '', s: [''] },
      { v: array, s: array },
      { v: object, e: new TypeError('key: not an array') },
      { v: object, p: { userInput: true }, e: new UserInputError('key: not an array') },
      { v: f, e: new TypeError('key: not an array') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not an array') },
      { v: g, e: new TypeError('key: not an array') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not an array') },
      { v: a, e: new TypeError('key: not an array') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not an array') },
      { v: A, e: new TypeError('key: not an array') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not an array') },

      // Parameter checking.
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toObject()', () => {
    test(OptionParser.toObject, [
      // Standard values.
      { s: {} },
      { v: null, s: {} },
      { v: bool, e: new TypeError('key: not an object') },
      { v: bool, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: int, e: new TypeError('key: not an object') },
      { v: int, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: num, e: new TypeError('key: not an object') },
      { v: num, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: str, e: new TypeError('key: not an object') },
      { v: str, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: '', e: new TypeError('key: not an object') },
      { v: '', p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: array, e: new TypeError('key: not an object') },
      { v: array, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: object, s: object },
      { v: f, e: new TypeError('key: not an object') },
      { v: f, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: g, e: new TypeError('key: not an object') },
      { v: g, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: a, e: new TypeError('key: not an object') },
      { v: a, p: { userInput: true }, e: new UserInputError('key: not an object') },
      { v: A, e: new TypeError('key: not an object') },
      { v: A, p: { userInput: true }, e: new UserInputError('key: not an object') },

      // Parameter checking.
      { v: bool, p: { userInput: null }, e: new TypeError('userInput: missing boolean value') },
      { v: bool, p: { userInput: '' }, e: new TypeError('userInput: not a boolean') }
    ])
  })
  describe('.toFunction()', () =>{
    test(OptionParser.toFunction, [
      // Standard values.
      { e: new TypeError('key: missing function value') },
      { v: null, e: new TypeError('key: missing function value') },
      { v: bool, e: new TypeError('key: not a function') },
      { v: int, e: new TypeError('key: not a function') },
      { v: num, e: new TypeError('key: not a function') },
      { v: str, e: new TypeError('key: not a function') },
      { v: '', e: new TypeError('key: not a function') },
      { v: array, e: new TypeError('key: not a function') },
      { v: object, e: new TypeError('key: not a function') },
      { v: f, s: f },
      { v: g, e: new TypeError('key: not a function') },
      { v: a, e: new TypeError('key: not a function') },
      { v: A, e: new TypeError('key: not a function') }
    ])
  })
  describe('.toClass()', () => {
    // toString(key, value, SuperClass)
    test(OptionParser.toClass, [
      // Standard values.
      { e: new TypeError('key: missing class value') },
      { v: null, e: new TypeError('key: missing class value') },
      { v: bool, e: new TypeError('key: not a class') },
      { v: int, e: new TypeError('key: not a class') },
      { v: num, e: new TypeError('key: not a class') },
      { v: str, e: new TypeError('key: not a class') },
      { v: '', e: new TypeError('key: not a class') },
      { v: array, e: new TypeError('key: not a class') },
      { v: object, e: new TypeError('key: not a class') },
      { v: f, e: new TypeError('key: not a class') },
      { v: g, e: new TypeError('key: not a class') },
      { v: a, e: new TypeError('key: not a class') },
      { v: A, s: A },

      // Specific values.
      { v: A, p: { SuperClass: A }, s: A },
      { v: A, p: { SuperClass: B }, e: new TypeError('key: not a subclass of B') },
      { v: A, p: { SuperClass: C }, e: new TypeError('key: not a subclass of C') },
      { v: B, p: { SuperClass: A }, s: B },
      { v: B, p: { SuperClass: B }, s: B },
      { v: A, p: { SuperClass: C }, e: new TypeError('key: not a subclass of C') },
      { v: C, p: { SuperClass: A }, s: C },
      { v: C, p: { SuperClass: B }, s: C },
      { v: C, p: { SuperClass: C }, s: C },

      // Parameter checking.
      { v: A, p: { SuperClass: null }, e: new TypeError('SuperClass: missing class value') },
      { v: A, p: { SuperClass: '' }, e: new TypeError('SuperClass: not a class') }
    ])
  })
  describe('.toInstance()', () => {
    test(OptionParser.toInstance, [
      // Standard values.
      { p: { Class: A }, e: new TypeError('key: missing instance of A value') },
      { v: null, p: { Class: A }, e: new TypeError('key: missing instance of A value') },
      { v: bool, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: int, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: num, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: str, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: '', p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: array, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: object, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: f, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: g, p: { Class: A }, e: new TypeError('key: not an instance of A') },
      { v: a, p: { Class: A }, s: a },
      { v: A, p: { Class: A }, e: new TypeError('key: not an instance of A') },

      // Specific values.
      { v: a, p: { Class: A }, s: a },
      { v: a, p: { Class: B }, e: new TypeError('key: not an instance of B') },
      { v: a, p: { Class: C }, e: new TypeError('key: not an instance of C') },
      { v: b, p: { Class: A }, s: b },
      { v: b, p: { Class: B }, s: b },
      { v: b, p: { Class: C }, e: new TypeError('key: not an instance of C') },
      { v: c, p: { Class: A }, s: c },
      { v: c, p: { Class: B }, s: c },
      { v: c, p: { Class: C }, s: c },
      
      // Parameter checking.
      { v: A, p: { Class: null }, e: new TypeError('Class: missing class value') },
      { v: A, p: { Class: '' }, e: new TypeError('Class: not a class') }
    ])
  })
  describe('.toIntString()', () => {
    // toIntString(value, radix, length)
    test(OptionParser.toIntString, [
      { v: 255, r: '255' },
      { v: 255, p: { length: 4 }, r: ' 255' },
      { v: 255, p: { length: 8 }, r: '     255' },
      { v: -255, r: '-255' },
      { v: -255, p: { length: 4 }, r: '-255' },
      { v: -255, p: { length: 8 }, r: '    -255' },
      { v: 255, p: { radix: 16 }, r: 'FF' },
      { v: 255, p: { radix: 16, length: 4 }, r: '00FF' },
      { v: 255, p: { radix: 16, length: 8 }, r: '000000FF' },
      { v: 65535, p: { radix: 16 }, r: 'FFFF' },
      { v: 65535, p: { radix: 16, length: 4 }, r: 'FFFF' },
      { v: 65535, p: { radix: 16, length: 8 }, r: '0000FFFF' },
      { v: -255, p: { radix: 16 }, e: new RangeError('key: not an unsigned integer') }
    ])
  })
  describe('.toNumberString()', () => {
    // toNumberString(value, length, decimals)
    test(OptionParser.toNumberString, [
      { v: Math.PI, r: '' + Math.PI },
      { v: Math.PI, p: { length: 8, decimals: 2 }, r: '    3.14' },
      { v: Math.PI, p: { length: 8, decimals: 4 }, r: '  3.1416' },
      { v: Math.PI, p: { length: 8, decimals: 6 }, r: '3.141593' },
      { v: -Math.PI, r: '' + -Math.PI },
      { v: -Math.PI, p: { length: 8, decimals: 2 }, r: '   -3.14' },
      { v: -Math.PI, p: { length: 8, decimals: 4 }, r: ' -3.1416' },
      { v: -Math.PI, p: { length: 8, decimals: 6 }, r: '-3.141593' }
    ])
  })
  describe('.toHost()', () => {
    test(OptionParser.toHost, [
      { v: 'localhost', s: { hostname: 'localhost' } },
      { v: 'localhost:80', s: { hostname: 'localhost', port: 80 } },
      { v: '127.0.0.1', s: { hostname: '127.0.0.1' } },
      { v: '127.0.0.1:80', s: { hostname: '127.0.0.1', port: 80 } },
      { v: '[::1]', s: { hostname: '[::1]' } },
      { v: '[::1]:80', s: { hostname: '[::1]', port: 80 } },
      { e: new TypeError('key: missing string value') },
      { v: null, e: new TypeError('key: missing string value') },
      { v: '', e: new RangeError('key: not a non-empty string') },
      { v: '@', e: new RangeError('key: @: not a valid hostname or IPv4 address') },
      { v: '[0::0::1]', e: new RangeError('key: [0::0::1]: not a valid IPv6 address') },
      { v: 'localhost:80:80', e: new RangeError('key: not a valid host') },
      { v: ':80', e: new RangeError('key: not a valid host') },
      { v: 'localhost:', e: new RangeError('key: not a valid host') },
      { v: 'localhost:x', e: new RangeError('key: not a valid host') },
      { v: 'localhost:99999', e: new RangeError('key: 99999: not a valid port') }
    ])
  })
  describe('.toHostString()', () => {
    test(OptionParser.toHostString, [
      { v: 'localhost', s: 'localhost' },
      { v: 'localhost:80', s: 'localhost:80' },
      { v: '127.0.0.1', s: '127.0.0.1' },
      { v: '127.0.0.1:80', s: '127.0.0.1:80' },
      { v: '[::1]', s: '[::1]' },
      { v: '[::1]:80', s: '[::1]:80' },
      { e: new TypeError('key: missing string value') },
      { v: null, e: new TypeError('key: missing string value') },
      { v: '', e: new RangeError('key: not a non-empty string') },
      { v: '@', e: new RangeError('key: @: not a valid hostname or IPv4 address') },
      { v: '[0::0::1]', e: new RangeError('key: [0::0::1]: not a valid IPv6 address') },
      { v: 'localhost:80:80', e: new RangeError('key: not a valid host') },
      { v: ':80', e: new RangeError('key: not a valid host') },
      { v: 'localhost:', e: new RangeError('key: not a valid host') },
      { v: 'localhost:x', e: new RangeError('key: not a valid host') },
      { v: 'localhost:99999', e: new RangeError('key: 99999: not a valid port') }
    ])
  })
})
