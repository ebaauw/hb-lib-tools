// hb-lib-tools/src/CommandLineParser.ts
//
// Library for Homebridge plugins.
// Copyright © 2017-2026 Erik Baauw. All rights reserved.

import { createRequire } from 'node:module'

import { recommendedNodeVersion } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

/** Usage error.
  * @hideconstructor
  * @extends Error
  * @memberof CommandLineParser
  */
class UsageError extends Error {}

/** Parser and validator for command-line arguments.
  * <br>See {@link CommandLineParser}.
  * @name CommandLineParser
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** Parser and validator for command-line arguments.
  */
class CommandLineParser {
  static get UsageError () { return UsageError }

  private _callbacks: {
    flags: Record<string, (key: string) => void>
    options: Record<string, (value: string, key: string) => void>
    parameters: { key: string, callback: (value: string, key: string) => void, optional: boolean }[]
    remaining: ((values: string[]) => void) | null
  }
  private _packageJson: Record<string, unknown>

  /** Create a new parser instance.
    * @params {string} pkgJson - The contents of `package.json` to retrieve
    * the version and homepage for the command-line tool.
    */
  constructor (pkgJson: Record<string, unknown> = packageJson) {
    this._callbacks = {
      flags: {},
      options: {},
      parameters: [],
      remaining: null
    }
    this._packageJson = pkgJson
  }

  #toShort (key: unknown): string | null {
    if (key == null) {
      return null
    }
    if (typeof key !== 'string' || key.length !== 1) {
      throw new TypeError(`${key}: invalid short key`)
    }
    if (this._callbacks.flags[key] != null || this._callbacks.options[key] != null) {
      throw new SyntaxError(`${key}: duplicate short key`)
    }
    return key
  }

  #toLong (key: unknown): string | null {
    if (key == null) {
      return null
    }
    if (typeof key !== 'string' || key.length <= 1) {
      throw new TypeError(`${key}: invalid long key`)
    }
    if (this._callbacks.flags[key] != null || this._callbacks.options[key] != null) {
      throw new SyntaxError(`${key}: duplicate long key`)
    }
    return key
  }

  /** Add a flag to print help text and exit.
    *
    * See {@link CommandLineParser#flag flag()}.
    *
    * @param {string} shortKey - The short key (e.g. `h` for `-h`).
    * @param {string} longKey - The long key (e.g. `help` for `--help`).
    * @param {string} helpText - The help text.
    * @return {CommandLineParser} this - For chaining.
    */
  help (shortKey: string | null, longKey: string | null, helpText: string): CommandLineParser {
    helpText = OptionParser.toString('helpText', helpText, { nonEmpty: true })
    this.flag(shortKey, longKey, () => {
      const recommendedVersion = recommendedNodeVersion(packageJson)
      const warning = (process.version.slice(1) !== recommendedVersion)
        ? `, recommended version: node v${recommendedVersion}`
        : ''
      console.log(helpText)
      console.log(`
See ${(this._packageJson.homepage as string).split('#')[0]} for more info.
(${this._packageJson.name} v${this._packageJson.version}, node ${process.version}${warning})`
      )
      process.exit(0)
    })
    return this
  }

  /** Add a flag to print the version and exit.
    *
    * See {@link CommandLineParser#flag flag()}.
    *
    * @param {string} shortKey - The short key (e.g. `V` for `-V`).
    * @param {string} longKey - The long key (e.g. `version` for `--version`).
    * @return {CommandLineParser} this - For chaining.
    */
  version (shortKey: string | null, longKey: string | null): CommandLineParser {
    this.flag(shortKey, longKey, () => {
      console.log(this._packageJson.version)
      process.exit(0)
    })
    return this
  }

  /** Add a flag for debug.
    *
    * See {@link CommandLineParser#flag flag()}.
    *
    * @param {string} shortKey - The short key (e.g. `D` for `-D`).
    * @param {string} longKey - The long key (e.g. `debug` for `--debug`).
    * @param {CommandLineTool} tool = The parent command-line tool,
    * which will be used to set the debug level.
    * @return {CommandLineParser} this - For chaining.
    */
  debug (shortKey: string | null, longKey: string | null, tool: CommandLineTool): CommandLineParser {
    this.flag(shortKey, longKey, () => {
      if (tool.vdebugEnabled) {
        tool.setOptions({ vvdebug: true })
      } else if (tool.debugEnabled) {
        tool.setOptions({ vdebug: true })
      } else {
        tool.setOptions({ debug: true, chalk: true })
      }
    })
    return this
  }

  /** Add a callback for a flag.
    *
    * A flag is an optional command-line parameter, identified by a short key
    * (a single character, like `-v`), or by a long key (a word, like
    * `--verbose`).
    *
    * @param {string} shortKey - The short key (e.g. `v` for `-v`).
    * @param {string} longKey - The long key (e.g. `verbose` for `--verbose`).
    * @param {function} callback - The callback function.<br>
    * The function will be called when the flag is present, with the
    * following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `key` | string | | The key.
    * @return {CommandLineParser} this - For chaining.
    */
  flag (shortKey: string | null, longKey: string | null, callback: (key: string) => void): CommandLineParser {
    shortKey = this.#toShort(shortKey)
    longKey = this.#toLong(longKey)
    if (shortKey != null) {
      this._callbacks.flags[shortKey] = callback
    }
    if (longKey != null) {
      this._callbacks.flags[longKey] = callback
    }
    return this
  }

  /** Add a callback for an option.
    *
    * An option is an optional command-line paramater that takes a value.
    * The option is identified by a short key (a single character, like `-t`),
    * or by a long key (a word, like `--timeout`).
    * The value can specified in the next or in the same command-line parameter:
    * `-t5` `--timeout=5`, `-t 5`, or `--timeout 5`
    *
    * @param {string} shortKey - The short key (e.g. `t` for `-t`).
    * @param {string} longKey - The long key (e.g. `timeout` for `--timeout`).
    * @param {function} callback - The callback function.<br>
    * The function will be called when the option is present, with the
    * following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `value` | string | | The value.
    * `key` | string | | The (short or long) key.
    * @return {CommandLineParser} this - For chaining.
    */
  option (shortKey: string | null, longKey: string | null, callback: (value: string, key: string) => void): CommandLineParser {
    shortKey = this.#toShort(shortKey)
    longKey = this.#toLong(longKey)
    if (shortKey != null) {
      this._callbacks.options[shortKey] = callback
    }
    if (longKey != null) {
      this._callbacks.options[longKey] = callback
    }
    return this
  }

  /** Add a callback for a positional parameter.
    *
    * A positional paramater is a mandatory command-line parameter.
    * It is specified as a single value, e.g. `get`
    *
    * @param {string} key - The parameter key (e.g. `command`).
    * @param {function} callback - The callback function.<br>
    * The function will be called with the following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `value` | string | | The parameter value.
    * `key` | string | | The parameter key.
    * @param {boolean} [optional=false] - Whether the parameter is optional.
    * @return {CommandLineParser} this - For chaining.
    */
  parameter (key: string, callback: (value: string, key: string) => void, optional: boolean = false): CommandLineParser {
    key = OptionParser.toString('key', key, { nonEmpty: true })
    this._callbacks.parameters.push({ key, callback, optional })
    return this
  }

  // * @param {string} key - The name of the remaining parameters (e.g.
  // * `file` for `[`_file_` ...]`).
  /** Add a callback for the remaining parameters.
    *
    * The remaining parameters are any additional commmand-line parameters,
    * after the positional paramers, typically indicated as `[file ...]`.
    * @param {function} callback - The callback function.<br>
    * This function will be called with the following paramters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `values` | string[] | | A list of values of the remaining parameters.
    * @return {CommandLineParser} this - For chaining.
    */
  remaining (callback: (values: string[]) => void): CommandLineParser {
    callback = OptionParser.toFunction('callback', callback)
    this._callbacks.remaining = callback
    return this
  }

  /** Parse the command-line parameters.
    *
    * @throws {UsageError} In case of invalid command-line paramters.
    */
  parse (wordList: string[] = process.argv.slice(2)) {
    // process.argv[0]: node executable, process.argv[1]: javascript file
    let wordIndex = 0
    let charIndex

    const handleWord = (word: string, long: boolean): boolean => {
      const key = long ? word.split('=')[0] : word[0]
      const option = (long ? '--' : '-') + key
      const flagCallback = this._callbacks.flags[key]
      let value = long ? word.split('=')[1] : null
      if (flagCallback) {
        if (value != null) {
          throw new UsageError(`${option}: option doesn't allow an argument`)
        }
        flagCallback(option)
        return long
      }
      const optionCallback = this._callbacks.options[key]
      if (optionCallback) {
        value = long ? word.split('=')[1] : word.substring(1)
        if (value) {
          charIndex = word.length
        } else {
          if (wordIndex >= wordList.length) {
            throw new UsageError(`${option}: option requires an argument`)
          }
          value = wordList[wordIndex++]
        }
        optionCallback(value, option)
        return long
      }
      throw new UsageError(`${option}: unknown option`)
    }

    // Parse flags and options.
    while (wordIndex < wordList.length) {
      const word = wordList[wordIndex++]
      if (word[0] !== '-' || word === '-') {
        wordIndex -= 1
        break
      }
      if (word === '--') {
        break
      }
      if (word[1] === '-') {
        handleWord(word.substring(2), true)
        continue
      }
      charIndex = 1
      while (charIndex < word.length) {
        if (handleWord(word.substring(charIndex++), false)) {
          break
        }
      }
    }
    // Parse parameters.
    for (const p of this._callbacks.parameters) {
      if (wordIndex >= wordList.length) {
        if (!p.optional) {
          throw new UsageError(`parameter ${p.key} missing`)
        }
        break
      }
      const parameter = wordList[wordIndex++]
      p.callback(parameter, p.key)
    }
    const remaining = wordList.slice(wordIndex, wordList.length)
    const callback = this._callbacks.remaining
    if (callback) {
      callback(remaining)
      return
    }
    if (remaining.length > 0) {
      throw new UsageError('too many parameters')
    }
  }
}

export { CommandLineParser }
