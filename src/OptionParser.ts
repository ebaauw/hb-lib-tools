// hb-lib-tools/src/OptionParser.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { EventEmitter } from 'node:events'
import { posix } from 'node:path'
import { isIPv4, isIPv6 } from 'node:net'

type integer = number
type hostname = string
type Host = { hostname: hostname, port?: integer }
type host = string
type path = string

/** User input error.
  * @hideconstructor
  * @extends Error
  * @memberof OptionParser
  */
class UserInputError extends Error {}

// Create a new RangeError or UserInputError, depending on userInput.
function newRangeError (message: string, userInput = false) {
  return userInput ? new UserInputError(message) : new RangeError(message)
}

// Create a new SyntaxError or UserInputError, depending on userInput.
function newSyntaxError (message: string, userInput = false) {
  return userInput ? new UserInputError(message) : new SyntaxError(message)
}

// Create a new TypeError or UserInputError, depending on userInput.
function newTypeError (message: string, userInput = false) {
  return userInput ? new UserInputError(message) : new TypeError(message)
}

type CallBackFunction = {
  (value: any): void
  list?: Record<string, any>
}

const patterns = {
  host: /^(?:\[(.+)\]|([^:]+))(?::([0-9]{1,5}))?$/,
  hostname: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
  int: /^\s*([+-]?)([0-9]+(?:\.0*)?)\s*$/,
  intBin: /^\s*([+-]?)(?:0[bB])([01]+)\s*$/,
  intOct: /^\s*([+-]?)(?:0[oO])([0-8]+)\s*$/,
  intHex: /^\s*([+-]?)(?:0[xX])([0-9A-Fa-f]+)\s*$/,
  ipv4: /^(\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5])\.(\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5])\.(\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5])\.(\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5])$/,
  number: /^\s*[+-]?((?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|Infinity)\s*$/,
  mac: /^([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})$/,
  mac64: /^([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})[:-]([0-9a-fA-F]{1,2})$/,
  uuid: /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([1-5][0-9a-fA-F]{3})-([89abAB][0-9a-fA-F]{3})-([0-9a-fA-F]{12})$/
}

/** Parser and validator for options and other parameters.
  * <br>See {@link OptionParser}.
  * @name OptionParser
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** Parser and validator for options and other parameters.
  *
  * @extends EventEmitter
  * @emits userInputError
  * @emits warning
  */
class OptionParser extends EventEmitter {

  static get UserInputError () { return UserInputError }

  /** Casts input value to boolean.
    *
    * Valid input values are:
    * - A boolean;
    * - A number with value 0 (false) or 1 (true);
    * - A string with value 'false', 'no', 'off', or '0' (false); or
    * with value 'true', 'yes', 'on', or '1' (true).
    * @param {!string} key - The key of the input value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {boolean} The value as boolean.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toBool: (key: string, value: any, options?: {
    userInput?: boolean
  }) => boolean = (key, value, options = {
    userInput: false
  }) => {
    key === 'key' || key === 'nonEmpty' || OptionParser.toString('key', key, { nonEmpty: true })
    options.userInput === false || OptionParser.toBool('userInput', options.userInput)

    if (value == null) {
      throw newTypeError(`${key}: missing boolean value`, options.userInput)
    }
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      value = value.toLowerCase()
    }
    if (['true', 'yes', 'on', '1', 1].includes(value)) {
      return true
    }
    if (['false', 'no', 'off', '0', 0].includes(value)) {
      return false
    }
    throw newTypeError(`${key}: not a boolean`, options.userInput)
  }

  /** Casts input value to integer, optionally clamped between min and max.
    *
    * Valid input values are:
    * - A boolean: false (0) or true (1);
    * - A number with an integer value;
    * - A string holding an integer value in decimal, binary, octal or hexadecimal notation.
    * @param {!string} key - The key of the input value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?integer} [options.min=Number.MIN_SAFE_INTEGER] - Minimum value returned.
    * @param {?integer} [options.max=Number.MAX_SAFE_INTEGER] - Maximum value returned.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {integer} The value as integer.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toInt: (key: string, value: any, options?: {
    min?: integer, max?: integer, userInput?: boolean
  }) => integer = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const min = options.min === undefined ? Number.MIN_SAFE_INTEGER : OptionParser.toInt('min', options.min)
    const max = options.max === undefined ? Number.MAX_SAFE_INTEGER : OptionParser.toInt('max', options.max)
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)
    if (max < min) {
      throw newRangeError('max: smaller than min')
    }

    if (value == null) {
      throw newTypeError(`${key}: missing integer value`, userInput)
    }
    if (typeof value === 'number') {
      value = '' + value
    }
    if (typeof value === 'boolean') {
      value = value ? 1 : 0
    } else if (typeof value === 'string') {
      if (patterns.int.test(value)) {
        value = parseInt(value)
      } else if (patterns.intHex.test(value)) {
        value = parseInt(value, 16)
      } else if (patterns.intOct.test(value)) {
        const a = patterns.intOct.exec(value)
        value = parseInt(a![1] + a![2], 8)
      } else if (patterns.intBin.test(value)) {
        const a = patterns.intBin.exec(value)
        value = parseInt(a![1] + a![2], 2)
      } else {
        throw newTypeError(`${key}: not an integer`, userInput)
      }
    } else {
      throw newTypeError(`${key}: not an integer`, userInput)
    }
    return Math.min(Math.max(value, min), max)
  }

  /** Converts an integer value to a formatted string.
    *
    * The integer value is converted to a string in the specified radix.
    * The string is prepended with spaces (radix 10) or zeroes (other radix
    * values) to match the minimum length.
    *
    * @param {!string} key - The key of the value (for error messages).
    * @param {integer} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?integer} [options.min=Number.MIN_SAFE_INTEGER] - Minimum value returned.
    * @param {?integer} [options.max=Number.MAX_SAFE_INTEGER] - Maximum value returned.
    * @param {integer} [options.radix=10] - The radix.
    * @param {integer} [options.length=0] - The minimum length of the formatted string.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The formatted string.
    * @throws {TypeError} On invalid input value.
    */
  static toIntString: (key: string, value: any, options?: {
    min?: integer, max?: integer, radix?: integer, length?: integer, userInput?: boolean
  }) => string = (key, value, options = {
    min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER,
    radix: 10, length: 0, userInput: false
  }) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const min = options.min === undefined ? Number.MIN_SAFE_INTEGER : OptionParser.toInt('min', options.min)
    const max = options.max === undefined ? Number.MAX_SAFE_INTEGER : OptionParser.toInt('max', options.max)
    const radix = options.radix === undefined ? 10 : OptionParser.toInt('radix', options.radix, { min: 2, max: 36 })
    const length = options.length === undefined ? 0 : OptionParser.toInt('length', options.length, { min: 0, max: 32 })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    if (value < 0 && radix !== 10) {
      throw newRangeError(`${key}: not an unsigned integer`, userInput)
    }
    value = OptionParser.toInt(key, value, { min, max, userInput }).toString(radix).toUpperCase()
    if (value.length > length) {
      return value
    }
    const prefix = radix === 10
      ? '                                '
      : '00000000000000000000000000000000'
    return (prefix + value).slice(-length)
  }

  /** Casts input value to number, optionally clamped between min and max.
    *
    * Valid input values are:
    * - A boolean: false (0) or true (1);
    * - A real number (not: NaN, -Infinity, Infinity);
    * - A string holding a number value.
    * @param {!string} key - The key of the input value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?integer} [options.min=-Infinity] - Minimum value returned.
    * @param {?integer} [options.max=Infinity] - Maximum value returned.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {number} The value as number.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toNumber: (key: string, value: any, options?: {
    min?: number, max?: number, userInput?: boolean
  }) => number = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const min = options.min === undefined ? -Infinity : OptionParser.toNumber('min', options.min)
    const max = options.max === undefined ? Infinity : OptionParser.toNumber('max', options.max)
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)
    if (max < min) {
      throw newRangeError('max: smaller than min')
    }

    if (value == null) {
      throw newTypeError(`${key}: missing number value`, userInput)
    }
    if (typeof value === 'number') {
      value = '' + value
    }
    if (typeof value === 'boolean') {
      value = value ? 1 : 0
    } else if (typeof value === 'string') {
      if (patterns.number.test(value)) {
        value = parseFloat(value)
      } else {
        throw newTypeError(`${key}: not a number`, userInput)
      }
    } else {
      throw newTypeError(`${key}: not a number`, userInput)
    }
    return Math.min(Math.max(value, min), max)
  }

  /** Converts an integer value to a formatted string.
    *
    * The integer value is converted to a string, optionally with a fixed
    * number of decimals.
    * The string is prepended with `0`s to match the minimum length.
    *
    * @param {!string} key - The key of the value (for error messages).
    * @param {integer} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?integer} [options.min=-Infinity] - Minimum value returned.
    * @param {?integer} [options.max=Infinity] - Maximum value returned.
    * @param {integer} [options.length=0] - The minimum length of the formatted string.
    * @param {?integer} options.decimals - The fixed number of decimals
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The formatted string.
    * @throws {TypeError} On invalid input value.
    */
  static toNumberString: (key: string, value: any, options?: {
    min?: number, max?: number, length?: integer, decimals?: integer, userInput?: boolean
  }) => string = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const min = options.min === undefined ? -Infinity : OptionParser.toNumber('min', options.min)
    const max = options.max === undefined ? Infinity : OptionParser.toNumber('max', options.max)
    const length = options.length === undefined ? 0 : OptionParser.toInt('options.length', options.length, { min: 0, max: 32 })
    const decimals = options.decimals === undefined ? null : OptionParser.toInt('options.decimals', options.decimals, { min: 0, max: 16 })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    value = OptionParser.toNumber(key, value, { min, max, userInput })
    if (decimals != null) {
      const factor = Math.pow(10, decimals)
      value = (Math.round(value * factor) / factor)
    }
    value = value.toString(10)
    if (value.length > length) {
      return value
    }
    return ('                                ' + value).slice(-length)
  }

  /** Casts input value to string, optionally non-empty.
    *
    * Valid values are:
    * - A string.
    * - A boolean.
    * - A number.
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.nonEmpty=false] - Empty string is invalid value.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The value as string.
    * @throws {TypeError} On invalid input value.
    * @throws {RangeError} On empty string, when options.nonEmpty has been set.
    * @throws {UserError} On error, when value was input by user.
    */
  static toString: (key: string, value: any,  options?: {
    nonEmpty?: boolean, userInput?: boolean
  }) => string = (key, value, options = {}) => {
    key === 'key' || OptionParser.toString('key', key, { nonEmpty: true })
    const nonEmpty = options.nonEmpty === undefined ? false : OptionParser.toBool('nonEmpty', options.nonEmpty)
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    if (value == null && nonEmpty) {
      throw newTypeError(`${key}: missing string value`, userInput)
    } else if (value == null) {
      value = ''
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      value = '' + value
    } else if (typeof value !== 'string') {
      throw newTypeError(`${key}: not a string`, userInput)
    }
    if (nonEmpty && value === '') {
      throw newRangeError(`${key}: not a non-empty string`, userInput)
    }
    return value
  }

  /** Casts input value to hostname[:port].
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {Host} The value as { hostname: hostname, port: port }.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toHost: (key: string, value: any, options?: {
    userInput?: boolean
  }) => Host = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    OptionParser.toString(key, value, { nonEmpty: true, userInput })
    const response: Host = { hostname: ''}
    const list = patterns.host.exec(value)
    if (list == null) {
      throw newRangeError(`${key}: not a valid host`, userInput)
    }
    if (list[1] != null) {
      if (!isIPv6(list[1])) {
        throw newRangeError(`${key}: [${list[1]}]: not a valid IPv6 address`, userInput)
      }
      response.hostname = '[' + list[1] + ']'
    } else if (isIPv4(list[2])) {
      response.hostname = list[2].split('.').map((byte) => {
        return parseInt(byte)
      }).join('.')
    } else if (patterns.hostname.test(list[2])) {
      response.hostname = list[2]
    } else {
      throw newRangeError(`${key}: ${list[2]}: not a valid hostname or IPv4 address`, userInput)
    }
    if (list[3] != null) {
      const port = parseInt(list[3], 10)
      if (port < 0 || port > 65535) {
        throw newRangeError(`${key}: ${port}: not a valid port`, userInput)
      }
      response.port = port
    }
    return response
  }

  /** Casts input value to hostname[:port].
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The value as hostname[:port].
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toHostString: (key: string, value: any, options?: {
    userInput?: boolean
  }) => host = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    const { hostname, port } = OptionParser.toHost(key, value, { userInput })
    return hostname + (port != null ? ':' + port : '')
  }

  /** Casts input value to path.
    *
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The value as normalised resource path.
    * @throws {TypeError} On invalid input value.
    * @throws {RangeError} On empty string, on string not starting with '/'.
    * @throws {UserError} On error, when value was input by user.
    */
  static toPath: (key: string, value: any, options?: {
    userInput?: boolean
  }) => path = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    const path = OptionParser.toString(key, value, { nonEmpty: true, userInput })
    if (path[0] !== '/') {
      throw newRangeError(`${key}: ${path}: not a valid path`, userInput)
    }
    return posix.normalize(path)
  }

  /** Casts input value to array.
    *
    * Valid values are:
    * - Null (empty array);
    * - A boolean, number, or string (singleton array);
    * - An array.
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {string} The value as array.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toArray: (key: string, value: any, options?: {
    userInput?: boolean
  }) => any[] = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)

    if (value == null) {
      return []
    }
    if (['boolean', 'number', 'string'].includes(typeof value)) {
      return [value]
    }
    if (Array.isArray(value)) {
      return value
    }
    throw newTypeError(`${key}: not an array`, userInput)
  }

  /** Casts input value to object.
    *
    * Valid values are:
    * - Null (empty object);
    * - A proper object (i.e. not a class instance).
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {boolean} [options.userInput=false] - Value was input by user.
    * @returns {Object} The value.
    * @throws {TypeError} On invalid input value.
    * @throws {UserError} On error, when value was input by user.
    */
  static toObject: (key: string, value: any, options?: {
    userInput?: boolean
  }) => Record<string, any> = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const userInput = options.userInput === undefined ? false : OptionParser.toBool('userInput', options.userInput)
    
    if (value == null) {
      return {}
    }
    if (
      typeof value !== 'object' || value == null ||
      value.constructor.name !== 'Object'
    ) {
      throw newTypeError(`${key}: not an object`, userInput)
    }
    return value
  }

  /** Casts input value to function.
    *
    * Valid values are:
    * - A proper function (i.e. not a class).
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @returns {function} The value.
    * @throws {TypeError} On invalid input value.
    */
  static toFunction: (key: string, value: any) => ((...args: any[]) => any) = (key, value) => {
    OptionParser.toString('key', key, { nonEmpty: true })

    if (value == null) {
      throw new TypeError(`${key}: missing function value`)
    }
    if (
      typeof value === 'function' && value.prototype == null &&
      value.constructor.name === 'Function'
    ) {
      return value
    }
    throw new TypeError(`${key}: not a function`)
  }

  /** Casts input value to function.
    *
    * Valid values are:
    * - A proper async function.
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @returns {function} The value.
    * @throws {TypeError} On invalid input value.
    */
  static toAsyncFunction: (key: string, value: any) => ((...args: any[]) => Promise<any>) = (key, value) => {
    OptionParser.toString('key', key, { nonEmpty: true })
  
    if (value == null) {
      throw new TypeError(`${key}: missing async function value`)
    }
    if (
      typeof value === 'function' &&
      value.constructor.name === 'AsyncFunction'
    ) {
      return value
    }
    throw new TypeError(`${key}: not an async function`)
  }

  /** Casts input value to class.
    *
    * Valid values are:
    * - A proper Class or function with a prototype.
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?Class} options.SuperClass - Check for subclass of SuperClass.
    * @returns {*} The value.
    * @throws {TypeError} On invalid input value.
    */
  static toClass: (key: string, value: any, options?: { SuperClass?: new (...args: any) => any }) => any = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const SuperClass: (new (...args: any) => any) | null = options.SuperClass === undefined ? null : OptionParser.toClass('SuperClass', options.SuperClass)

    if (value == null) {
      throw new TypeError(`${key}: missing class value`)
    }
    if (typeof value !== 'function' || value.prototype == null) {
      throw new TypeError(`${key}: not a class`)
    }
    if (
      SuperClass != null && value !== SuperClass &&
      !(value.prototype instanceof SuperClass)
    ) {
      throw new TypeError(`${key}: not a subclass of ${SuperClass.name}`)
    }
    return value
  }

  /** Casts input value to class instance.
    *
    * Valid values are:
    * - A class instance or a proper function.
    * @param {!string} key - The key of the value (for error messages).
    * @param {*} value - The input value.
    * @param {Object} [options] - Additional options.
    * @param {?Class} options.Class - Check for instance of Class.
    * @returns {Class} The value.
    * @throws {TypeError} On invalid input value.
    */
  static toInstance: (key: string, value: any, options?: { Class?: new (...args: any) => any }) => any = (key, value, options = {}) => {
    OptionParser.toString('key', key, { nonEmpty: true })
    const Class: (new (...args: any) => any) | null = options.Class === undefined ? null : OptionParser.toClass('Class', options.Class)

    if (Class != null) {
      if (value == null) {
        throw new TypeError(`${key}: missing instance of ${Class.name} value`)
      }
      if (value instanceof Class) {
        return value
      }
      throw new TypeError(`${key}: not an instance of ${Class.name}`)
    }
    if (value == null) {
      return null
    }
    if (typeof value === 'object' && value.constructor.name != null) {
      return value
    }
    throw new TypeError(`${key}: not an instance`)
  }

  _object: Record<string, any>
  _userInput: boolean
  _callbacks: Record<string, CallBackFunction>

  /** Creates a new OptionParser instance
    *
    * @param {boolean} [userInput=false] - Options were input by user.
    */
  constructor (object: Record<string, any> = {}, userInput: boolean = false) {
    super()
    this._object = object
    this._userInput = userInput
    this._callbacks = {}
  }

  /** Checks that key is valid and not yet in use.
    *
    * @param {!string} key - The key.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  _toKey (key: string): string {
    key = OptionParser.toString('key', key, { nonEmpty: true })
    if (this._callbacks[key] != null) {
      throw new SyntaxError(`${key}: duplicate key`)
    }
    return key
  }

  /** Defines a key that takes an array as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  arrayKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toArray(key, value, { userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes an async function as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  asyncFunctionKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toAsyncFunction(key, value)
    }
    return this
  }

  /** Defines a key that takes a boolean value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  boolKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toBool(key, value, { userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes an enum value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  enumKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      value = OptionParser.toString(
        key, value, { nonEmpty: true, userInput: this._userInput }
      )
      const callback: CallBackFunction = this._callbacks[key].list![value]
      if (callback == null) {
        throw newRangeError(`${value}: invalid ${key}`, this._userInput)
      }
      this._object[key] = value
      callback(value)
    }
    this._callbacks[key].list = {}
    return this
  }

  /** Defines a value for an enum key.
    *
    * @param {!string} key - The key.
    * @param {!string} value - The key.
    * @param {?function} callback - Function to call when enum value is present.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  enumKeyValue (key: string, value: any, callback = () => {}): OptionParser {
    key = OptionParser.toString('key', key, { nonEmpty: true })
    value = OptionParser.toString('value', value, { nonEmpty: true })
    OptionParser.toFunction(key, this._callbacks[key])
    callback = OptionParser.toFunction('callback', callback)

    this._callbacks[key].list![value] = callback
    return this
  }

  /** Defines a key that takes a function as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  functionKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toFunction(key, value)
    }
    return this
  }

  /** Defines a key that takes a hostname[:port] as value.
    *
    * @param {!string} key - The key.
    * @param {string} [hostnameKey=hostname] - The key for the hostname.
    * @param {string} [portKey=port] - The key for the port.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  hostKey (key = 'host', hostnameKey = 'hostname', portKey = 'port'): OptionParser {
    key = this._toKey(key)
    hostnameKey = OptionParser.toString('hostnameKey', hostnameKey, { nonEmpty: true })
    portKey = OptionParser.toString('portKey', portKey, { nonEmpty: true })

    this._callbacks[key] = (value) => {
      const { hostname, port }  = OptionParser.toHost(key, value, { userInput: this._userInput })
      this._object[hostnameKey] = hostname
      if (port != null) {
        this._object[portKey] = port
      }
    }
    return this
  }

  /** Defines a key that takes an integer value,
    * optionally clamped between min and max.
    *
    * @param {!string} key - The key.
    * @param {?Class} Class - Check for instance of Class.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  instanceKey (key: string, Class?: any): OptionParser {
    key = this._toKey(key)
    Class === undefined || OptionParser.toClass('Class', Class)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toInstance(key, value, Class)
    }
    return this
  }

  /** Defines a key that takes an integer value,
    * optionally clamped between min and max.
    *
    * @param {!string} key - The key.
    * @param {?integer} min - Minimum value returned.
    * @param {?integer} max - Maximum value returned.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  intKey (key: string, min?: number, max?: number): OptionParser {
    key = this._toKey(key)
    min = min == null ? -Infinity : OptionParser.toInt('min', min)
    max = max == null ? Infinity : OptionParser.toInt('max', max)
    if (max < min) {
      throw newRangeError('max: smaller than min')
    }

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toInt(key, value, { min, max, userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes a list of strings as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  listKey (key: string): OptionParser {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      const array = []
      const map: Record<string, boolean> = {}
      for (const element of OptionParser.toArray(key, value)) {
        try {
          OptionParser.toString(`${key}.${element}`, element, { nonEmpty: true, userInput: this._userInput })
          if (map[element]) {
            throw newSyntaxError(`${key}.${element}: duplicate key`, this._userInput)
          }
          map[element] = true
          array.push(element)
        } catch (error) {
          if (error instanceof UserInputError) {
            this.emit('userInputError', `${key}: ${error.message}`)
          } else {
            throw error
          }
        }
      }
      this._object[key] = array
    }
    return this
  }

  /** Defines a key that takes an number value,
    * optionally clamped between min and max.
    *
    * @param {!string} key - The key.
    * @param {?number} min - Minimum value returned.
    * @param {?number} max - Maximum value returned.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  numberKey (key: string, min?: number, max?: number): OptionParser {
    key = this._toKey(key)
    min = min == null ? -Infinity : OptionParser.toNumber('min', min)
    max = max == null ? Infinity : OptionParser.toNumber('max', max)
    if (max < min) {
      throw newRangeError('max: smaller than min')
    }

    this._callbacks[key] = (value: any) => {
      this._object[key] = OptionParser.toNumber(key, value, { min, max, userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes an object as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  objectKey (key: string) {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toObject(key, value, { userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes a resource path as value.
    *
    * @param {!string} key - The key.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  pathKey (key: string) {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toPath(key, value, { userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes a string value.
    *
    * @param {!string} key - The key.
    * @param {boolean} [nonEmpty=false] - Reject empty string.
    * @return {OptionParser} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  stringKey (key: string, nonEmpty = false) {
    key = this._toKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = OptionParser.toString(
        key, value, { nonEmpty, userInput: this._userInput }
      )
    }
    return this
  }

  /** Parse options.
    *
    * @param {object} options - The input options.
    * @param {?object} defaults - The default values, to be overwritten by
    * the corresponding values in `options`.
    * @returns {object} The
    * @throws {TypeError} When option has wrong type.
    * @throws {RangeError} When option has wrong value.
    * @throws {SyntaxError} Unknown option.
    * @throws {UserInputError} On error, when value was input by user.
    */
  parse (options?: Record<string, any>) {
    options = OptionParser.toObject('options', options)

    for (const key in options) {
      try {
        const value = options[key]
        if (this._callbacks[key] == null) {
          throw newSyntaxError(`${key}: invalid key`, this._userInput)
        }
        this._callbacks[key](value)
      } catch (error) {
        if (error instanceof UserInputError) {
          // this.emit('userInputError', `${key}: ${error.message}`)
          this.emit('userInputError', error)
        } else {
          // error.message = `${key}: ${error.message}`
          throw error
        }
      }
    }
    return this._object
  }
}

export { integer, hostname, Host, host, path, OptionParser }
