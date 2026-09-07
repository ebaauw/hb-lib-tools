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
export type map<T> = { [key: string]: T }
export type json = null | boolean | number | string | json[] | jsonMap
export type jsonMap = { [key: string]: json }

import { isIPv6 } from 'node:net'
import { getSystemErrorMessage } from 'node:util'

import { chalk } from 'hb-lib-tools/chalk'
import { toInt, toIntString } from 'hb-lib-tools/OptionParser'

/** Logger interface.
  * 
  * This interface defines a number of methods for logging messages of various severities.
  * Each of these methods uses `printf`-style arguments.
  * In case the last (or only) argument is an `Error`,
  * {@link formatError formatError()} is called to convert it to a string.
  */
export interface Logger {
  /** Log error message. */
  error (format: string | Error, ...args: unknown[]): void,
  /** Log warning message. */
  warn (format: string | Error, ...args: unknown[]): void,
  /** Log regular log message. */
  log (format: string | Error, ...args: unknown[]): void,
  /** Log debug message. */
  debug (format: string | Error, ...args: unknown[]): void,
  /** Log verbose debug message. */
  vdebug (format: string | Error, ...args: unknown[]): void,
  /** Log very verbose debug message. */
  vvdebug (format: string | Error, ...args: unknown[]): void,
}

interface SystemError extends Error {
  errno?: number
  path?: string
  dest?: string
  address?: string
  port?: number
  hostname?: string
  syscall?: string
  code?: string
  cmd?: string
}

// Check of e is a JavaScript runtime error.
function isJavaScriptError (e: Error) {
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
function isNodejsError (e: SystemError) {
  return typeof e.code === 'string' && e.code.startsWith('ERR_')
}


/** Convert Error to string.
  *
  * Include the stack trace only for programming errors (JavaScript and NodeJS
  * runtime errors).
  * Translate system errors into more readable messages.
  * @param error - The error.
  * @param useChalk - Use chalk to grey out the stack trace.
  * @return The error as string.
  */
export function formatError (error: Error, useChalk = false) {
  if (isJavaScriptError(error) || isNodejsError(error)) {
    if (error.stack != null) {
      if (useChalk) {
        const lines = error.stack.split('\n')
        const firstLine = lines.shift()
        return firstLine + '\n' + chalk.reset.gray(lines.join('\n'))
      }
      return error.stack
    }
  }
  const e = error as SystemError
  if (e.errno != null) {
    let label = ''
    if (e.path != null) {
      label = e.path
    } else if (e.dest != null) {
      label = e.dest
    } else if (e.address != null) {
      label = e.address
      if (isIPv6(label)) {
        label = '[' + label + ']'
      }
      if (e.port != null) {
        label += ':' + e.port
      }
    } else if (e.port != null) {
      label = '' + e.port
    } else if (e.hostname != null) {
      label = e.hostname
    }
    const message = getSystemErrorMessage(e.errno)
    if (label != null && message != null) {
      return `${label}: cannot ${e.syscall}: ${e.code}: ${message}`
    }
  }
  if (e.cmd != null && e.message.slice(-1) === '\n') { // exec error
    return e.message.slice(0, e.message.length - 1)
  }
  return e.message
}

/** Return the recommended version of NodeJS from package.json.
  * This is the version used to develop and test the software,
  * typically the latest LTS version.
  * @param packageJson - The contents of `package.json`.
  * @return The recommended version of NodeJS.
  */
export function recommendedNodeVersion (packageJson: jsonMap) {
  const engines = packageJson.engines as jsonMap
  const node = engines.node as string
  return node.split('||')?.[0] ?? process.version.slice(1)
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
  msec = toInt(msec, { key: 'msec', min: 0 })
  return new Promise((resolve: () => void) => {
    setTimeout(() => {
      resolve()
    }, msec)
  })
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
    return value.toString('hex').toUpperCase().replace(/..\B/g, '$&:')
  }
  const length = options.length == null ? 0 : toInt(options.length, { key: 'options.length', min: 0, max: 32 })
  return toIntString(value, { key: 'value', radix: 16, length })
}
