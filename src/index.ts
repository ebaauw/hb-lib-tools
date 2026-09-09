// hb-lib-tools/src/index.ts
//
// Library for Homebridge plugins.
// Copyright © 2017-2026 Erik Baauw. All rights reserved.

/** Library for Homebridge plugins.
  *
  * ## Introduction
  * This library contains command-line tools and supporting utility classes, types, and functions for 
  * [homebridge-lib](https://github.com/ebaauw/homebridge-lib).
  *
  * ### Command-Line Tools
  * This library comes with a number of command-line tools for troubleshooting Homebridge installations.
  *
  * Tool                        | Description
  * --------------------------- | -----------
  * {@link HapTool! hap}         | Logger for HomeKit accessory announcements.
  * {@link JsonTool! json}       | JSON formatter.
  * {@link SysinfoTool! sysinfo} | Print hardware and operating system information.
  * {@link UpnpTool! upnp}       | Logger for UPnP device announcements.
  *
  * Each command-line tool takes a `-h` or `--help` argument to provide a brief overview
  * of its functionality and command-line arguments.
  * 
  * To install the command-line tools, issue:
  * ```bash
  * npm install -g hb-lib-tools
  * ```
  *
  * ### Utility Modules
  * This library provides a number of utility modules for Homebridge plugins and/or command-line tools.

  * Module                     | Description
  * -------------------------- | -----------
  * {@link Colour}             | Colour conversions.
  * {@link CommandLineTool}    | Abstract base class for a command-line tool.
  * {@link HttpClient}         | HTTP client.
  * {@link JsonFormatter}      | JSON formatter.
  * {@link MdnsClient}         | Multicast DNS (Bonjour) client.
  * {@link OptionParser}       | Parser and validator for options and other parameters.
  * {@link SystemInfo}         | System information.
  * {@link UpnpClient}         | Universal Plug and Play client.
  *
  * Each utility module is provided as a separate import, to enable lazy loading.
  * E.g. to use the `HttpClient` class, issue:
  * ```typescript
  * import { HttpClient } from 'hb-lib-tools/HttpClient'
  * ```
  * or, to load it lazily:
  * ```typescript
  * const { HttpClient } = await import('hb-lib-tools/HttpClient')
  * ```
  * 
  * ### Utility Types
  * This library provides a number of utility types used by the utility classes and functions.
  * Type              | Description
  * ----------------- | -----------
  * {@link integer}   | Integer number.
  * {@link json}      | JSON value.
  * {@link jsonMap}   | Map of string keys to JSON values.
  * {@link Logger}    | Logger interface.
  * {@link map}       | Map of string keys to unknown values.
  * 
  * To use the types provided by this library, issue:
  * ```typescript
  * import type { json } from 'hb-lib-tools'
  * ```
  * 
  * ### Utility Functions
  * This library provides a number of utility functions used by the utility classes and command-line tools.
  * Function                       | Description
  * ------------------------------ | -----------
  * {@link formatError}            | Convert Error to string.
  * {@link recommendedNodeVersion} | Return the recommended version of NodeJS from package.json.
  * {@link timeout}                | Resolve after given time, delaying execution.
  * {@link toHexString}            | Convert {@link integer} or `Buffer` to hex string.
  *
  * To use the utility functions, issue:
  * ```typescript
  * import { formatError, recommendedNodeVersion, timeout, toHexString } from 'hb-lib-tools'
  * ```
  * @module 
  */

export type integer = number & {}

export type json = null | boolean | number | string | json[] | jsonMap
export interface jsonMap extends Record<string, json> {}

/** Guard for {@link json}. */
export function isJson (json: unknown): json is json {
  if (json === null || typeof json === 'boolean' || typeof json === 'number' || typeof json === 'string') {
    return true
  }
  if (Array.isArray(json)) {
    return json.every((v) => isJson(v))
  }
  if (typeof json === 'object') {
    return Object.keys(json).every(k => typeof k === 'string') &&
    Object.values(json).every((v) => isJson(v))
  }
  return false
}

/** Guard for {@link jsonMap}. */
export function isJsonMap (json: unknown): json is jsonMap {
  return typeof json === 'object' && json !== null && !Array.isArray(json) && isJson(json)
}

import { isIPv6 } from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { getSystemErrorMessage } from 'node:util'

import { chalk } from 'hb-lib-tools/chalk'
import { toInt, toIntString } from 'hb-lib-tools/OptionParser'

/** Logger interface.
  * 
  * This interface defines a number of methods for logging messages of various severities.
  * Each of these methods uses `printf`-style arguments.
  * In case the last (or only) argument is an `Error`,
  * {@link formatError formatError()} is called to convert it to a string.
  * In case the first (or only) argument is not a `string`, it is converted to one using `String()`.
  */
export interface Logger {
  /** Log error message. */
  error: (format: unknown, ...args: unknown[]) => void,
  /** Log warning message. */
  warn: (format: unknown, ...args: unknown[]) => void,
  /** Log regular log message. */
  log: (format: unknown, ...args: unknown[]) => void,
  /** Log debug message. */
  debug: (format: unknown, ...args: unknown[]) => void,
  /** Log verbose debug message. */
  vdebug: (format: unknown, ...args: unknown[]) => void,
  /** Log very verbose debug message. */
  vvdebug: (format: unknown, ...args: unknown[]) => void,
}

interface SystemError extends Error {
  errno?: number
  path?: string
  dest?: string
  address?: string
  port?: integer
  hostname?: string
  syscall?: string
  code?: string
  cmd?: string
}

// Check of e is a JavaScript runtime error.
function isJavaScriptError (e: Error): boolean {
  return [
    'AssertionError',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError'
  ].includes(e.constructor.name)
}

// Check if e is a NodeJs runtime error.
function isNodejsError (e: SystemError): boolean {
  return typeof e.code === 'string' && e.code.startsWith('ERR_')
}

function getLabel (e: SystemError): string | undefined {
  if (e.path != null) {
    return e.path
  }
  if (e.dest != null) {
    return e.dest
  }
  if (e.address != null) {
    let { address } = e
    if (isIPv6(address)) {
      address = `[${address}]`
    } 
    if (e.port != null) {
      return `${address}:${e.port}`
    }
    return address
  }
  if (e.port != null) {
    return `${e.port}`
  }
  if (e.hostname != null) {
    return e.hostname
  }
  return undefined
}

/** Convert Error to string.
  *
  * Include the stack trace only for programming errors (JavaScript and NodeJS
  * runtime errors).
  * 
  * Translate system errors into more readable messages.
  */
export function formatError (
  /** The error. */
  error: Error,
  /** Use chalk to grey out the stack trace. */
  useChalk = false
): string {
  if (isJavaScriptError(error) || isNodejsError(error)) {
    if (error.stack != null) {
      if (useChalk) {
        const lines = error.stack.split('\n')
        const firstLine = lines.shift()
        return `${firstLine}\n${chalk.reset.gray(lines.join('\n'))}`
      }
      return error.stack
    }
  }
  const e = error as SystemError
  if (e.errno != null) {
    const label = getLabel(e)
    if (label != null) {
      const message = getSystemErrorMessage(e.errno)
      return `${label}: cannot ${e.syscall}: ${e.code}: ${message}`
    }
  }
  if (e.cmd != null && e.message.endsWith('\n')) { // exec error
    return e.message.slice(0, e.message.length - 1)
  }
  return e.message
}

/** Return the recommended version of NodeJS from package.json.
  * This is the version used to develop and test the software,
  * typically the latest LTS version.
  */
export function recommendedNodeVersion (
  /** The contents of `package.json`. */
  packageJson: jsonMap
): string {
  if (
    packageJson.engines == null || typeof packageJson.engines != 'object' ||
    !('node' in packageJson.engines) || typeof packageJson.engines.node !== 'string'
  ) {
    return process.version.slice(1)
  }
  return packageJson.engines.node.split('||')[0]
}

/** Resolve after given time, delaying execution.
  *
  * E.g. to delay execution for 1.5 seconds, issue:
  * ```javascript
  *   import { timeout } from 'hb-lib-tools'
  *
  *   await timeout(1500)
  * ```
  *
  * @throws On invalid parameters.
  */
export async function timeout (
  /** Time (in msec) to wait. */
  msec: integer
): Promise<void> {
  const ms = toInt(msec, { key: 'msec', min: 0 })
  await setTimeout(ms)
}

/** Convert integer or Buffer to hex string.
  * @return The hex string.
  * @throws On invalid parameters.
  */
export function toHexString (
  /** The integer or Buffer to convert to a hex string. */
  value: integer | Buffer,
  /** Options. */
  options: {
    /** The (minimum) number of digits in the hex string. */
    length?: integer
  } = {}): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('hex').toUpperCase().replace(/..\B/vg, '$&:')
  }
  const length = options.length == null ? 0 : toInt(options.length, { key: 'options.length', min: 0, max: 32 })
  return toIntString(value, { key: 'value', radix: 16, length })
}
