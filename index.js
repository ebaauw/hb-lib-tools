// hb-lib-tools/index.js
//
// Library for Homebridge plugins.
// Copyright © 2017-2023 Erik Baauw. All rights reserved.

'use strict'

const net = require('net')

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

const zeroes = '00000000000000000000000000000000'

/** Library for Homebridge plugins.
  * see the {@tutorial hbLibTools} tutorial.
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
  * const hbLibTools = require('hb-lib-tools')
  * ```
  *
  * Note that each class provided by Homebridge Lib is implemented as a
  * separate Javascript module, that is loaded lazily on first use.
  * Due to the way NodeJS deals with circular module dependencies, these modules
  * might not yet be initialised while your module is loading.
  *
  * @module hbLibTools
  */
class hbLibTools {
  /** Return the `Bonjour` class from [`bonjour-hap`](https://github.com/homebridge/bonjour),
    * so plugins don't have to list this as a separate dependency.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get Bonjour () { return require('bonjour-hap') }

  /** Colour conversions.
    * <br>See {@link Colour}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get Colour () { return require('./lib/Colour') }

  /** Parser and validator for command-line arguments.
    * <br>See {@link CommandLineParser}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get CommandLineParser () { return require('./lib/CommandLineParser') }

  /** Command-line tool.
    * <br>See {@link CommandLineTool}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get CommandLineTool () { return require('./lib/CommandLineTool') }

  /** HTTP client.
    * <br>See {@link HttpClient}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get HttpClient () { return require('./lib/HttpClient') }

  /** JSON formatter.
    * <br>See {@link JsonFormatter}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get JsonFormatter () { return require('./lib/JsonFormatter') }

  /** Parser and validator for options and other parameters.
    * <br>See {@link OptionParser}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get OptionParser () { return require('./lib/OptionParser') }

  /** System information.
    * <br>See {@link SystemInfo}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get SystemInfo () { return require('./lib/SystemInfo') }

  /** Universal Plug and Play client.
    * <br>See {@link UpnpClient}.
    * @type {Class}
    * @memberof module:hbLibTools
    */
  static get UpnpClient () { return require('./lib/UpnpClient') }

  // Command-line tools.
  static get HapTool () { return require('./lib/HapTool') }
  static get JsonTool () { return require('./lib/JsonTool') }
  static get SysinfoTool () { return require('./lib/SysinfoTool') }
  static get UpnpTool () { return require('./lib/UpnpTool') }

  /** Resolve after given period, delaying execution.
    *
    * E.g. to delay execution for 1.5 seconds, issue:
    * ```javascript
    *   await hbLibTools.timeout(1500)
    * ```
    *
    * @param {integer} msec - Period (in msec) to wait.
    * @throws {TypeError} On invalid parameter type.
    * @throws {RangeError} On invalid parameter value.
    * @memberof module:hbLibTools
    */
  static async timeout (msec) {
    msec = hbLibTools.OptionParser.toInt('msec', msec, 0)
    return new Promise((resolve, reject) => {
      setTimeout(() => { resolve() }, msec)
    })
  }

  /** Convert Error to string.
    *
    * Include the stack trace only for programming errors (JavaScript and NodeJS
    * runtime errors).
    * Translate system errors into more readable messages.
    * @param {Error} e - The error.
    * @param {boolean} [useChalk=false] - Use chalk to grey out the stack trace.
    * @returns {string} - The error as string.
    * @memberof module:hbLibTools
    */
  static formatError (e, useChalk = false) {
    if (isJavaScriptError(e) || isNodejsError(e)) {
      if (useChalk) {
        const lines = e.stack.split('\n')
        const firstLine = lines.shift()
        return firstLine + '\n' + hbLibTools.chalk.reset.grey(lines.join('\n'))
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
        if (net.isIPv6(label)) {
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

  /** Convert integer to hex string.
    * @param {integer} i - The integer.
    * @param {?integer} length - The (minimum) number of digits in the hex string.
    * The hex string is left padded with `0`s, to reach the length.
    * @returns {string} - The hex string.
    * @memberof module:hbLibTools
    */
  static toHexString (i, length) {
    const s = i.toString(16).toUpperCase()
    if (length == null || s.length >= length) {
      return s
    }
    return (zeroes + s).slice(-length)
  }

  /** Return the [`chalk`](https://github.com/chalk/chalk) module,
    * so plugins don't have to list this as a separate dependency.
    * @memberof module:hbLibTools
    */
  static get chalk () {
    const chalk = require('chalk')
    // Force colors when output is re-directed.
    chalk.enabled = true
    chalk.level = 1
    return chalk
  }

  /** Return the recommended version of NodeJS from package.json.
    * This is the version used to develop and test the software,
    * typically the latest LTS version.
    * @param {string} packageJson - The contents of package.json
    * #return {string} - The recommended version.
    * @memberof module:hbLibTools
    */
  static recommendedNodeVersion (packageJson) {
    return packageJson?.engines?.node?.split('||')?.[0] ?? process.version.slice(1)
  }

  /** Return the [`semver`](https://github.com/npm/node-semver) module,
    * so plugins don't have to list this as a separate dependency.
    * @memberof module:hbLibTools
    */
  static get semver () { return require('semver') }
}

module.exports = hbLibTools
