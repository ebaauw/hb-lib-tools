// hb-lib-tools/index.js
//
// Library for Homebridge plugins.
// Copyright © 2017-2025 Erik Baauw. All rights reserved.

import { isIPv6 } from 'node:net'

import { chalk } from 'hb-lib-tools/chalk'
import { OptionParser } from 'hb-lib-tools/OptionParser'

/** Library for Homebridge plugins.
  * see the {@tutorial hb-lib-tools} tutorial.
  *
  * Homebridge Lib provides:
  * - A base class to building command-line tools:
  * {@link CommandLineTool}.
  * - A series of helper classes for building homebridge plugins (of any type)
  * and/or command-line utilities:
  * {@link Colour},
  * {@link CommandLineParser},
  * {@link HttpClient},
  * {@link JsonFormatter},
  * {@link OptionParser},
  * {@link SystemInfo}, and
  * {@link UpnpClient}.
  * - A series of command-line utilities for troubleshooting Homebridge setups:
  * `hap`, `json`, `sysinfo`, `upnp`.
  * For more information on these, start the tool from the command-line
  * with `-h` or `--help`.
  *
  * To access the classes provided by Homebridge Lib from your module,
  * simply load it by:
  * ```javascript
  * import hb-lib-tools from 'hb-lib-tools'
  * ```
  *
  * Note that each class provided by Homebridge Lib is implemented as a
  * separate Javascript module, that is loaded lazily on first use.
  * Due to the way NodeJS deals with circular module dependencies, these modules
  * might not yet be initialised while your module is loading.
  *
  * @module hb-lib-tools
  */

// Check of e is a JavaScript runtime error.
function isJavaScriptError (e) {
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
function isNodejsError (e) {
  return typeof e.code === 'string' && e.code.startsWith('ERR_')
}

/** Convert Error to string.
  *
  * Include the stack trace only for programming errors (JavaScript and NodeJS
  * runtime errors).
  * Translate system errors into more readable messages.
  * @param {Error} e - The error.
  * @param {boolean} [useChalk=false] - Use chalk to grey out the stack trace.
  * @returns {string} - The error as string.
  * @memberof module:hb-lib-tools
  */
function formatError (e, useChalk = false) {
  if (isJavaScriptError(e) || isNodejsError(e)) {
    if (useChalk) {
      const lines = e.stack.split('\n')
      const firstLine = lines.shift()
      return firstLine + '\n' + chalk.reset.grey(lines.join('\n'))
    }
    return e.stack
  }
  if (e.errno != null) { // SystemError
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
    let message = ''
    const a = /[A-Z0-9_-]*:( .*),/.exec(e.message)
    if (a?.[1] != null) {
      message = a[1]
    }
    if (label != null && message != null) {
      return `${label}: cannot ${e.syscall}: ${e.code}${message}`
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
  * @param {string} packageJson - The contents of package.json
  * @returns {string} - The recommended version of NodeJS.
  * @memberof module:hb-lib-tools
  */
function recommendedNodeVersion (packageJson) {
  return packageJson?.engines?.node?.split('||')?.[0] ?? process.version.slice(1)
}

/** Resolve after given period, delaying execution.
  *
  * E.g. to delay execution for 1.5 seconds, issue:
  * ```javascript
  *   import { timeout } from 'hb-lib-tools'
  *
  *   await timeout(1500)
  * ```
  *
  * @param {integer} msec - Period (in msec) to wait.
  * @throws {TypeError} On invalid parameter type.
  * @throws {RangeError} On invalid parameter value.
  * @memberof module:hb-lib-tools
  */
async function timeout (msec) {
  msec = OptionParser.toInt('msec', msec, 0)
  return new Promise((resolve, reject) => {
    setTimeout(() => { resolve() }, msec)
  })
}

const zeroes = '00000000000000000000000000000000'

/** Convert integer or Buffer to hex string.
  * @param {integer|Buffer} i - The integer or Buffer.
  * @param {?integer} length - The (minimum) number of digits in the hex string.
  * The hex string is left padded with `0`s, to reach the length.
  * @returns {string} - The hex string.
  * @memberof module:hb-lib-tools
  */
function toHexString (i, length) {
  if (Buffer.isBuffer(i)) {
    return i.toString('hex').toUpperCase().replace(/..\B/g, '$&:')
  }
  const s = i.toString(16).toUpperCase()
  if (length == null || s.length >= length) {
    return s
  }
  return (zeroes + s).slice(-length)
}

export { formatError, recommendedNodeVersion, timeout, toHexString }
