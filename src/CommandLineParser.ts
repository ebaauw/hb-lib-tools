// hb-lib-tools/src/CommandLineParser.ts
//
// Library for Homebridge plugins.
// Copyright © 2017-2026 Erik Baauw. All rights reserved.

/** Parser and validator for command-line arguments.
  * To use `CommandLineParser`, issue:
  * ```typescript
  * import { CommandLineParser, UsageError } from 'hb-lib-tools/CommandLineParser'
  * ```
  * @module
  */
import type { jsonMap } from 'hb-lib-tools'

import { createRequire } from 'node:module'

import { recommendedNodeVersion } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'

const require = createRequire(import.meta.url)
const packageJson: jsonMap = require('../package.json')

/** Usage error. */
export class UsageError extends Error {}

/** Parser and validator for command-line arguments. */
export class CommandLineParser {
  private _tool: CommandLineTool
  private _packageJson: jsonMap
  private _callbacks: {
    flags: { [key: string]: (key: string) => void }
    options: { [key: string]: (value: string, key: string) => void }
    parameters: { key: string, callback: (value: string, key: string) => void, optional: boolean }[]
    remaining: ((values: string[]) => void) | null
  }

  /** Create a new parser instance.
    * @param {CommandLineTool} tool = The parent command-line tool,
    * which will be used to set the debug level.
    * @param {jsonMap} pkgJson - The contents of `package.json` to retrieve
    * the version and homepage for the command-line tool.
    */
  constructor (tool: CommandLineTool, pkgJson: jsonMap = packageJson) {
    this._tool = tool
    this._packageJson = pkgJson
    this._callbacks = {
      flags: {},
      options: {},
      parameters: [],
      remaining: null
    }
  }

  #toShortKey (key: unknown): string | null {
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

  #toLongKey (key: unknown): string | null {
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
    * @param shortKey - The short key (e.g. `h` for `-h`).
    * @param longKey - The long key (e.g. `help` for `--help`).
    * @param helpText - The help text.
    */
  help (shortKey: string | null, longKey: string | null, helpText: string): this {
    helpText = OptionParser.toString('helpText', helpText, { nonEmpty: true })
    this.flag(shortKey, longKey, () => {
      const recommendedVersion = recommendedNodeVersion(this._packageJson)
      const warning = (process.version.slice(1) !== recommendedVersion)
        ? `, recommended version: node v${recommendedVersion}`
        : ''
      this._tool.print(helpText)
      this._tool.print(`
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
    */
  version (shortKey: string | null, longKey: string | null): this {
    this.flag(shortKey, longKey, () => {
      this._tool.print(this._packageJson.version as string)
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
    * @return {CommandLineParser} this - For chaining.
    */
  debug (shortKey: string | null, longKey: string | null): this {
    this.flag(shortKey, longKey, () => {
      if (this._tool.vdebugEnabled) {
        this._tool.setOptions({ vvdebug: true })
      } else if (this._tool.debugEnabled) {
        this._tool.setOptions({ vdebug: true })
      } else {
        this._tool.setOptions({ debug: true, chalk: true })
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
    * @param shortKey - The short key (e.g. `v` for `-v`).
    * @param longKey - The long key (e.g. `verbose` for `--verbose`).
    * @param callback - The callback function.<br>
    * The function will be called when the flag is present, with the
    * following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `key` | string | | The key.
    */
  flag (shortKey: string | null, longKey: string | null, callback: (key: string) => void): this {
    shortKey = this.#toShortKey(shortKey)
    longKey = this.#toLongKey(longKey)
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
    * @param shortKey - The short key (e.g. `t` for `-t`).
    * @param longKey - The long key (e.g. `timeout` for `--timeout`).
    * @param callback - The callback function.<br>
    * The function will be called when the option is present, with the
    * following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `value` | string | | The value.
    * `key` | string | | The (short or long) key.
    */
  option (shortKey: string | null, longKey: string | null, callback: (value: string, key: string) => void): this {
    shortKey = this.#toShortKey(shortKey)
    longKey = this.#toLongKey(longKey)
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
    * @param key - The parameter key (e.g. `command`).
    * @param callback - The callback function.<br>
    * The function will be called with the following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `value` | string | | The parameter value.
    * `key` | string | | The parameter key.
    * @param {boolean} [optional=false] - Whether the parameter is optional.
    */
  parameter (key: string, callback: (value: string, key: string) => void, optional: boolean = false): this {
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
    * @param callback - The callback function.<br>
    * This function will be called with the following parameters:
    *
    * Name | Type | Attributes | Description
    * ---- | ---- | ---------- | -----------
    * `values` | string[] | | A list of values of the remaining parameters.
    */
  remaining (callback: (values: string[]) => void): this {
    callback = OptionParser.toFunction('callback', callback)
    this._callbacks.remaining = callback
    return this
  }

  /** Parse the command-line parameters.
    *
    * @throws {@link UsageError} In case of invalid command-line parameters.
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
