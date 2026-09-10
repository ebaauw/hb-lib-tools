// hb-lib-tools/src/OptionParser.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

/** Parser and validator for options and other parameters.
  * @module 
  */

import type { integer } from 'hb-lib-tools'

export type hostname = string
export interface Host { hostname: hostname, port?: integer }
export type host = string
export type path = string

import { EventEmitter } from 'node:events'
import { posix } from 'node:path'
import { isIPv4, isIPv6 } from 'node:net'

/** User input error. */
export class UserInputError extends Error {}

// Create a new RangeError or UserInputError, depending on userInput.
function newRangeError (message: string, options: { key?: string, userInput?: boolean } = {}): RangeError | UserInputError {
  const m = (options.key == null) ? message : `${options.key}: ${message}`
  return (options.userInput ?? false) ? new UserInputError(m) : new RangeError(m)
}

// Create a new SyntaxError or UserInputError, depending on userInput.
function newSyntaxError (message: string, options: { key?: string, userInput?: boolean } = {}): SyntaxError | UserInputError {
  const m = (options.key == null) ? message : `${options.key}: ${message}`
  return (options.userInput ?? false) ? new UserInputError(m) : new SyntaxError(m)
}

// Create a new TypeError or UserInputError, depending on userInput.
function newTypeError (message: string, options: { key?: string, userInput?: boolean } = {}): TypeError | UserInputError {
  const m = (options.key == null) ? message : `${options.key}: ${message}`
  return (options.userInput ?? false) ? new UserInputError(m) : new TypeError(m)
}

const patterns = {
  host: /^(?:\[(?<ipv6>.+)\]|(?<hostname>[^:]+))(?::(?<port>[0-9]{1,5}))?$/,
  hostname: /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
  int: /^\s*(?:[+-]?)(?:[0-9]+(?:\.0*)?)\s*$/,
  intBin: /^\s*(?<sign>[+-]?)(?:0[bB])(?<digits>[01]+)\s*$/,
  intOct: /^\s*(?<sign>[+-]?)(?:0[oO])(?<digits>[0-8]+)\s*$/,
  intHex: /^\s*(?<sign>[+-]?)(?:0[xX])(?<digits>[0-9A-Fa-f]+)\s*$/,
  ipv4: /^\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5]\.(?:\d{1,2}|[01]\d{2}|2[0-4]\d|25[0-5]){3}$/,
  number: /^\s*[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\s*$/,
  mac: /^[0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5}$/,
  mac64: /^[0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){7}$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
}

function validateOptions (options: { key?: unknown, nonEmpty?: unknown, userInput?: unknown } = {}): void {
  if (options.key !== undefined) {
    if (options.key == null) {
      throw new TypeError('options.key: missing string value')
    }
    if (typeof options.key !== 'string') {
      throw new TypeError('options.key: not a string')
    }
    if (options.key === '') {
      throw new RangeError('options.key: not a non-empty string')
    }
  }
  if (options.nonEmpty !== undefined) {
    if (options.nonEmpty == null) {
      throw new TypeError('options.nonEmpty: missing boolean value')
    }
    if (typeof options.nonEmpty !== 'boolean') {
      throw new TypeError('options.nonEmpty: not a boolean')
    }
  }
  if (options.userInput !== undefined) {
    if (options.userInput == null) {
      throw new TypeError('options.userInput: missing boolean value')
    }
    if (typeof options.userInput !== 'boolean') {
      throw new TypeError('options.userInput: not a boolean')
    }
  }
}

/** Casts input value to boolean.
  *
  * Valid input values are:
  * - A boolean;
  * - A number with value 0 (false) or 1 (true);
  * - A string with value 'false', 'no', 'off', or '0' (false); or
  * with value 'true', 'yes', 'on', or '1' (true).
  * @return The input value as boolean.
  * @throws On invalid input.
  */
export function toBool (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): boolean {
  validateOptions(options)
  let v = value
  if (v == null) {
    throw newTypeError('missing boolean value', options)
  }
  if (typeof v === 'boolean') {
    return v
  }
  if (typeof v === 'number') {
    v = `${v}`
  }
  if (typeof v === 'string') {
    const s = v.toLowerCase()
    if (['true', 'yes', 'on', '1'].includes(s)) {
      return true
    }
    if (['false', 'no', 'off', '0'].includes(s)) {
      return false
    }
  }
  throw newTypeError('not a boolean', options)
}

/** Casts input value to integer, optionally clamped between min and max.
  *
  * Valid input values are:
  * - A boolean: false (0) or true (1);
  * - A number with an integer value;
  * - A string holding an integer value in decimal, binary, octal or hexadecimal notation.
  * @return The input value as integer.
  * @throws On invalid input.
  */
export function toInt (
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Minimum value. */
    min?: integer,
    /** Maximum value. */
    max?: integer,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): integer {
  validateOptions(options)
  const min = options.min === undefined ? Number.MIN_SAFE_INTEGER : toInt(options.min, { key: 'options.min' })
  const max = options.max === undefined ? Number.MAX_SAFE_INTEGER : toInt(options.max, { key: 'options.max' })
  if (max < min) {
    throw newRangeError('options.max: smaller than options.min')
  }

  let i: integer
  if (value == null) {
    throw newTypeError('missing integer value', options)
  }
  if (typeof value === 'number') {
    value = String(value) // eslint-disable-line no-param-reassign -- ignore
  }
  if (typeof value === 'boolean') {
    i = value ? 1 : 0
  } else if (typeof value === 'string') {
    if (patterns.int.test(value)) {
      i = parseInt(value, 10)
    } else if (patterns.intHex.test(value)) {
      i = parseInt(value, 16)
    } else if (patterns.intOct.test(value)) {
      const a = patterns.intOct.exec(value)
      if (a?.groups == null) {
        throw newTypeError('not an integer', options)
      }
      i = parseInt(a.groups.sign + a.groups.digits, 8)
    } else if (patterns.intBin.test(value)) {
      const a = patterns.intBin.exec(value)
      if (a?.groups == null) {
        throw newTypeError('not an integer', options)
      }
      i = parseInt(a.groups.sign + a.groups.digits, 2)
    } else {
      throw newTypeError('not an integer', options)
    }
  } else {
    throw newTypeError('not an integer', options)
  }
  return Math.min(Math.max(i, min), max)
}

/** Converts an integer value to a formatted string.
  *
  * The integer value is converted to a string in the specified radix.
  * The string is prepended with spaces (radix 10) or zeroes (other radix
  * values) to match the minimum length.
  * @return The input value as integer, formatted as string.
  * @throws On invalid input.
  */
export function toIntString (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Minimum value. */
    min?: integer,
    /** Maximum value. */
    max?: integer,
    /** The radix, default: 10. */
    radix?: integer,
    /** The minimum length of the formatted string, default: 0. */
    length?: integer,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): string {
  validateOptions(options)
  const radix = options.radix === undefined ? 10 : toInt(options.radix, { key: 'options.radix', min: 2, max: 36 })
  const length: number = options.length === undefined ? 0 : toInt(options.length, { key: 'options.length', min: 0, max: 32 })

  const i = toInt(value, options)
  if (i < 0 && radix !== 10) {
    throw newRangeError('not an unsigned integer', options)
  }
  const s = i.toString(radix).toUpperCase()
  if (s.length > length) {
    return s
  }
  const prefix = radix === 10
    ? '                                '
    : '00000000000000000000000000000000'
  return (prefix + s).slice(-length)
}

/** Casts input value to number, optionally clamped between min and max.
  *
  * Valid input values are:
  * - A boolean: false (0) or true (1);
  * - A real number (not: NaN, -Infinity, Infinity);
  * - A string holding a number value.
  * @return The input value as number.
  * @throws On invalid input.
  */
export function toNumber (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Minimum value. */
    min?: number,
    /** Maximum value. */
    max?: number,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): number {
  validateOptions(options)
  const min = options.min === undefined ? Number.MIN_VALUE: toNumber(options.min, { key: 'options.min' })
  const max = options.max === undefined ? Number.MIN_VALUE : toNumber(options.max, { key: 'options.max' })
  if (max < min) {
    throw newRangeError('options.max: smaller than options.min')
  }
  let v = value

  let n: number
  if (v == null) {
    throw newTypeError('missing number value', options)
  }
  if (typeof v === 'number') {
    v = `${v}`
  }
  if (typeof v === 'boolean') {
    n = v ? 1 : 0
  } else if (typeof v === 'string') {
    if (patterns.number.test(v)) {
      n = parseFloat(v)
    } else {
      throw newTypeError('not a number', options)
    }
  } else {
    throw newTypeError('not a number', options)
  }
  return Math.min(Math.max(n, min), max)
}

/** Converts an integer value to a formatted string.
  *
  * The integer value is converted to a string, optionally with a fixed
  * number of decimals.
  * The string is prepended with `0`s to match the minimum length.
  * @return The value as number formatted asstring.
  * @throws On invalid input.
  */
export function toNumberString (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Minimum value. */
    min?: number,
    /** Maximum value. */
    max?: number,
    /** The minimum length of the formatted string.  Default: 0.*/
    length?: integer,
    /** The fixed number of decimals.  */
    decimals?: integer,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): string {
  validateOptions(options)
  const length = options.length === undefined ? 0 : toInt(options.length, { key: 'options.length', min: 0, max: 32 })
  const decimals = options.decimals === undefined ? undefined : toInt(options.decimals, { key: 'options.decimals', min: 0, max: 16 })

  let n = toNumber(value, options)
  if (decimals != null) {
    const factor = 10 ** decimals
    n = (Math.round(n * factor) / factor)
  }
  const s = n.toString(10)
  if (s.length > length) {
    return s
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-unary-minus -- integer is NumberLike
  return (`                                ${s}`).slice(-length)
}

/** Casts input value to string, optionally non-empty.
  *
  * Valid values are:
  * - A string.
  * - A boolean.
  * - A number.
  * @return The input value as string.
  * @throws On invalid input.
  */
export function toString (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Empty string is invalid value. */
    nonEmpty?: boolean,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): string {
  validateOptions(options)
  const nonEmpty = options.nonEmpty ?? false
  let v = value

  if (v == null) {
    if (nonEmpty) {
      throw newTypeError('missing string value', options)
    } else {
      return ''
    }
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    v = String(v)
  }
  if (typeof v !== 'string') {
    throw newTypeError('not a string', options)
  }
  if (nonEmpty && v === '') {
    throw newRangeError('not a non-empty string', options)
  }
  return v
}

/** Casts input value to {@link Host}.
  * @return The input value as {@link Host}.
  * @throws On invalid input.
  */
export function toHost (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): Host {
  validateOptions(options)
  const response: Host = { hostname: '' }
  const s = toString(value, { nonEmpty: true, ...options })
  const a = patterns.host.exec(s)
  if (a?.groups == null) {
    throw newRangeError('not a valid host', options)
  }
  const { ipv6, hostname, port } = a.groups as Record<string, string | null>
  if (ipv6 != null) {
    if (!isIPv6(ipv6)) {
      throw newRangeError(`[${ipv6}]: not a valid IPv6 address`, options)
    }
    response.hostname = `[${ipv6}]`
  } else if (hostname === null) {
    throw newRangeError(`${hostname}: not a valid hostname or IPv4 address`, options)
  } else if (isIPv4(hostname)) {
    response.hostname = hostname.split('.').map((byte) => parseInt(byte, 10)).join('.')
  } else if (patterns.hostname.test(hostname)) {
    response.hostname = hostname
  } else {
    throw newRangeError(`${hostname}: not a valid hostname or IPv4 address`, options)
  }
  if (port != null) {
    const p = parseInt(port, 10)
    if (p < 0 || p > 65535) {
      throw newRangeError(`${p}: not a valid port`, options)
    }
    response.port = p
  }
  return response
}

/** Casts input value to {@link host}.
  * @return The input value as {@link host}.
  * @throws On invalid input.
  */
export function toHostString (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): host {
  const { hostname, port } = toHost(value, options)
  return hostname + (port == null ? '' : `:${port}`)
}

/** Casts input value to {@link path}.
  * @return The input value as {@link path}.
  * @throws On invalid input.
  */
export function toPath (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): path {
  const path = toString(value, { nonEmpty: true, ...options })

  if (!path.startsWith('/')) {
    throw newRangeError(`${path}: not a valid path`, options)
  }
  return posix.normalize(path)
}

/** Casts input value to array.
  *
  * Valid values are:
  * - Null (empty array);
  * - A boolean, number, or string (singleton array);
  * - An array.
  * @return The input value as array.
  * @throws On invalid input.
  */
export function toArray (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): unknown[] {
  validateOptions(options)
  if (value == null) {
    return []
  }
  if (['boolean', 'number', 'string'].includes(typeof value)) {
    return [value]
  }
  if (Array.isArray(value)) {
    return value
  }
  throw newTypeError('not an array', options)
}

/** Casts input value to object.
  *
  * Valid values are:
  * - Null (empty object);
  * - A proper object (i.e. not a class instance).
  * @return The input value as object.
  * @throws On invalid input.
  */
export function toObject (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string,
    /** Whether the input value was input by the user. */
    userInput?: boolean
  } = {}): object {
  validateOptions(options)
  if (value == null) {
    return {}
  }
  if (typeof value !== 'object' || value.constructor.name !== 'Object') {
    throw newTypeError('not an object', options)
  }
  return value
}

// Do we still need toFunction(), toAsyncFunction(), toClass(), and toInstance()?
// Or can these be handled by TypeScript type checking?

/** Casts input value to function.
  *
  * Valid values are:
  * - A proper function (i.e. not a class).
  * @return The input value as function.
  * @throws On invalid input.
  */
export function toFunction (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string
  }): ((...args: unknown[]) => unknown) {
  validateOptions(options)
  if (value == null) {
    throw newTypeError('missing function value', options)
  }
  if (
    typeof value === 'function' && value.prototype == null &&
    value.constructor.name === 'Function'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- value is a proper function.
    return value as (...args: unknown[]) => unknown
  }
  throw newTypeError('not a function', options)
}

/** Casts input value to async function.
  *
  * Valid values are:
  * - A proper async function.
  * @return The input value as async function.
  * @throws On invalid input.
  */
export function toAsyncFunction (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string
  }): ((...args: unknown[]) => Promise<unknown>) {
  validateOptions(options)
  if (value == null) {
    throw newTypeError('missing async function value', options)
  }
  if (
    typeof value === 'function' &&
    value.constructor.name === 'AsyncFunction'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- value is a proper function.
    return value as (...args: unknown[]) => Promise<unknown>
  }
  throw newTypeError('not an async function', options)
}

/** Casts input value to class.
  *
  * Valid values are:
  * - A proper Class or function with a prototype.
  * @return The input value as Class.
  * @throws On invalid input.
  */
export function toClass (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string
    /** The superclass that the input value must extend. */
    SuperClass?: unknown
} = {}): new (...args: unknown[]) => unknown {
  validateOptions(options)
  const SuperClass = options.SuperClass === undefined ? undefined : toClass(options.SuperClass, { key: 'options.SuperClass' })

  if (value == null) {
    throw newTypeError('missing class value', options)
  }
  if (typeof value !== 'function' || value.prototype == null) {
    throw newTypeError('not a class', options)
  }
  if (
    SuperClass != null && value !== SuperClass &&
    !(value.prototype instanceof SuperClass)
  ) {
    throw newTypeError(`not a subclass of ${SuperClass.name}`, options)
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- value is a proper function.
  return value as new (...args: unknown[]) => unknown
}

/** Casts input value to class instance.
  *
  * Valid values are:
  * - A class instance.
  * @return The input value as Class.
  * @throws On invalid input.
  */
export function toInstance (
  /** The input value. */
  value: unknown,
  /** Options. */
  options: {
    /** The key of the input value (for error messages). */
    key?: string
    /** Check for instance of Class. */
    Class?: unknown
  } = {}): unknown {
  validateOptions(options)
  const Class = options.Class === undefined ? undefined : toClass(options.Class, { key: 'options.Class' })

  if (Class != null) {
    if (value == null) {
      throw newTypeError(`missing instance of ${Class.name} value`, options)
    }
    if (value instanceof Class) {
      return value
    }
    throw newTypeError(`not an instance of ${Class.name}`, options)
  }
  if (value == null) {
    throw newTypeError('missing instance value', options)
  }
  if (typeof value === 'object' && value.constructor.name !== 'Object' && !Array.isArray(value)) {
    return value
  }
  throw newTypeError('not an instance', options)
}

/** {@link OptionParser} events. */
export interface Events {
  /** Emitted when {@link OptionParser.parse parse()} encounters a user input error.
    * @event
    * @param error - The user input error.
    */
  userInputError: [error: UserInputError]
}


/** Callback function type. */
export type ValidationFunction = (value: unknown) => void

/** Parser and validator for options and other parameters. */
class OptionParser extends EventEmitter<Events> {
  _object: Record<string, unknown>
  _userInput: boolean
  _callbacks: Record<string, (value: unknown) => void>
  _enumValues: Record<string, Record<string, ((value: string) => void) | null>>

  /** Creates a new OptionParser instance
    *
    * @param {boolean} [userInput=false] - Options were input by user.
    */
  constructor (object: Record<string, unknown> = {}, userInput = false) {
    super()
    this._object = object
    this._userInput = userInput
    this._callbacks = {}
    this._enumValues = {}
  }

  /** Checks that key is valid and not yet in use. */
  #checkKey (
    /** The key. */
    key: string
  ): void {
    const k = toString(key, { key: 'key', nonEmpty: true })
    if (k in this._callbacks) {
      throw new SyntaxError(`${k}: duplicate key`)
    }
  }

  /** Defines a key that takes an array as value. */
  arrayKey (
    /** The key. */
    key: string
  ): this {
    this.#checkKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = toArray(value, { key, userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes an async function as value. */
  asyncFunctionKey (
    /** The key. */
    key: string
  ): this {
    this.#checkKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = toAsyncFunction(value, { key })
    }
    return this
  }

  /** Defines a key that takes a boolean value. */
  boolKey (
    /** The key. */
    key: string
  ): this {
    this.#checkKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = toBool(value, { key, userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes an enum value. */
  enumKey (
    /** The key. */
    key: string
  ): this {
    this.#checkKey(key)

    this._enumValues[key] = {}
    this._callbacks[key] = (value) => {
      const v = toString(value, { key, nonEmpty: true, userInput: this._userInput })
      if (!(v in this._enumValues[key])) {
        throw newRangeError(`${key}: ${v}: invalid value`, { userInput: this._userInput })
      }
      this._enumValues[key][v]?.(v)
    }
    return this
  }

  /** Defines a value for an enum key. */
  enumKeyValue (
    /** The enum key. */
    key: string,
    /** The enum value. */
    value: string,
    /** Function to call when enum value is present. */
    callback?: (value: string) => void
  ): this {
    if (!(key in this._enumValues)) {
      throw newRangeError(`${key}: not an enum key`)
    }
    const v = toString(value, { key, nonEmpty: true })
    if (v in this._enumValues[key]) {
      throw new SyntaxError(`${key}: ${v}: duplicate value`)
    }
    this._enumValues[key][v] = callback ?? null
    return this
  }

  /** Defines a key that takes a function as value. */
  functionKey (
    /** The key. */
    key: string
  ): this {
    this.#checkKey(key)

    this._callbacks[key] = (value) => {
      this._object[key] = toFunction(value, { key })
    }
    return this
  }

  /** Defines a key that takes a hostname[:port] as value. */
  hostKey (
    /** The key.  Default: 'host'. */
    key = 'host',
    options: {
      /** The key for the hostname.  Default: 'hostname'. */
      hostnameKey?: string,
      /** The key for the port.  Default: 'port'. */
      portKey?: string
    } = {}): this {
    this.#checkKey(key)
    const hostnameKey = options.hostnameKey === undefined ? 'hostname' : toString(options.hostnameKey, { key: 'hostnameKey', nonEmpty: true })
    const portKey = options.portKey === undefined ? 'port' : toString(options.portKey, { key: 'portKey', nonEmpty: true })

    this._callbacks[key] = (value) => {
      const { hostname, port }  = toHost(value, { key, userInput: this._userInput })
      this._object[hostnameKey] = hostname
      if (port != null) {
        this._object[portKey] = port
      }
    }
    return this
  }

  /** Defines a key that takes an instance value */
  instanceKey (key: string, Class?: unknown): this {
    this.#checkKey(key)
    const C = Class === undefined ? undefined : toClass(Class, { key: 'Class' })

    this._callbacks[key] = (value) => {
      this._object[key] = toInstance(value, { key, Class: C })
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
  intKey (key: string, min?: integer, max?: integer): this {
    this.#checkKey(key)
    min = min == null ? Number.MIN_SAFE_INTEGER : toInt(min, { key: 'options.min' }) // eslint-disable-line no-param-reassign -- TODO
    max = max == null ? Number.MAX_SAFE_INTEGER : toInt(max, { key: 'options.max' }) // eslint-disable-line no-param-reassign -- TODO
    if (max < min) {
      throw newRangeError('options.max: smaller than options.min')
    }

    this._callbacks[key] = (value) => {
      this._object[key] = toInt(value, { key, min, max, userInput: this._userInput })
    }
    return this
  }

  /** Defines a key that takes a list of strings as value.
    *
    * @param {!string} key - The key.
    * @return {this} this - For chaining.
    * @throws {TypeError} When key is not a string.
    * @throws {RangeError} When key is empty string.
    * @throws {SyntaxError} On duplicate key.
    */
  listKey (key: string): this {
    this.#checkKey(key)

    this._callbacks[key] = (value) => {
      const array: string[] = []
      const map: Record<string, boolean> = {}
      const a = toArray(value, { key, userInput: this._userInput })
      a.forEach((element, index) => {
        try {
          const e = toString(element, { key: `${key}.${index}`, nonEmpty: true, userInput: this._userInput })
          if (map[e]) {
            throw newSyntaxError(`duplicate key: ${e}`, { key: `${key}.${index}`, userInput: this._userInput })
          }
          map[e] = true
          array.push(e)
        } catch (error) {
          if (error instanceof UserInputError) {
            this.emit('userInputError', error)
          } else {
            throw error
          }
        }
      })
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
  numberKey (key: string, min?: number, max?: number): this {
    this.#checkKey(key)
    min = min == null ? Number.MIN_VALUE : toNumber(min, { key: 'min' }) // eslint-disable-line no-param-reassign -- TODO
    max = max == null ? Number.MAX_VALUE : toNumber(max, { key: 'max' }) // eslint-disable-line no-param-reassign -- TODO
    if (max < min) {
      throw newRangeError('max: smaller than min')
    }

    this._callbacks[key] = (value: unknown) => {
      this._object[key] = toNumber(value, { key, min, max, userInput: this._userInput })
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
  objectKey (key: string): this {
    this.#checkKey(key)

    this._callbacks[key] = (value: unknown) => {
      this._object[key] = toObject(value, { key, userInput: this._userInput })
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
  pathKey (key: string): this {
    this.#checkKey(key)

    this._callbacks[key] = (value: unknown) => {
      this._object[key] = toPath(value, { key, userInput: this._userInput })
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
  stringKey (key: string, nonEmpty = false): this {
    this.#checkKey(key)

    this._callbacks[key] = (value: unknown) => {
      this._object[key] = toString(value, { key, nonEmpty, userInput: this._userInput })
    }
    return this
  }

  /** Parse options.
    *
    * @param options - The input options.
    * @return The parsed options.
    * @throws {TypeError} When option has wrong type.
    * @throws {RangeError} When option has wrong value.
    * @throws {SyntaxError} Unknown option.
    * @throws {UserInputError} On error, when value was input by user.
    */
  parse (options: Record<string, unknown>): Record<string, unknown> {
    Object.keys(options).forEach(key => {
      try {
        if (!( key in this._callbacks[key])) {
          throw newSyntaxError('invalid key', { key, userInput: this._userInput })
        }
        this._callbacks[key](options[key])
      } catch (error) {
        if (error instanceof UserInputError) {
          this.emit('userInputError', error)
        } else {
          throw error
        }
      }
    })
    return this._object
  }
}

export { OptionParser }
