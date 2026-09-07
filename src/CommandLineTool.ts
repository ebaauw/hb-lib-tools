// hb-lib-tools/src/CommandLineTool.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { Logger, jsonMap, map } from 'hb-lib-tools'

import { format } from 'node:util'

import { formatError, recommendedNodeVersion, timeout } from 'hb-lib-tools'
import { chalk } from 'hb-lib-tools/chalk'
import { toString } from 'hb-lib-tools/OptionParser'

/** Make text bold.
  * @param text - The text.
  * @return The bold text.
  */
export function b (text: string): string { return chalk.bold(text) }

/** Make text underlined.
  * @param text - The text.
  * @return The underlined text.
  */
export function u (text: string): string { return chalk.underline(text) }

/** Mode in which the program tool runs. */
export enum Mode {
  /** Program runs on command line. */
  command = 'command',
  /** Program runs as standalone daemon. */
  daemon = 'daemon',
  /** Program runs as `systemctl` service. */
  service = 'service'
}

/** {@link CommandLineTool} options. */
export type Options = {
  /** Use chalk to colour messages.
    * 
    * Default: `false`.
    */
  chalk?: boolean,
  /** Output debug messages.
    * 
    * Default: `false`.
    */
  debug?: boolean,
  /** Output verbose debug messages.
    * 
    * Default: `false`.
    */
  vdebug?: boolean,
  /** Output very verbose debug messages.
    *
    * Default: `false`. 
    */
  vvdebug?: boolean,
  /** Include program name.
    *
    * Default: `true`.  
    */
  program?: boolean,
  /** Include timestamp.
    *
    * Default: `false`.
    */
  timestamp?: boolean,
  /** Mode in which utility is run.
    *
    * Default: {@link Mode.command}.
    */
  mode?: Mode
}

/** Usage error. */
export class UsageError extends Error {}

/** Command-line tool. */
export abstract class CommandLineTool implements Logger {
  private _name: string = ''
  private _options: Options = {
    chalk: false,
    debug: false,
    vdebug: false,
    vvdebug: false,
    program: true,
    timestamp: false,
    mode: Mode.command
  }
  protected abstract _packageJson: jsonMap
  private _usage: string = ''

  /** Create a new instance of a command line utility.
    */
  constructor (options: Options = {}) {
    // Set program name
    // argv[0]: node executable, argv[1]: javascript file
    this.name = process.argv[1]
    // Set logging options.
    this.setOptions(options)

    process
      .on('SIGHUP', this.#onSignal.bind(this))
      .on('SIGINT', this.#onSignal.bind(this))
      .on('SIGTERM', this.#onSignal.bind(this))
      .on('SIGABRT', this.#onSignal.bind(this))
      .on('uncaughtException', async (error) => {
        await this.fatal('uncaught exception: %s', error.stack)
      })
      .removeAllListeners('unhandledRejection')
      .on('unhandledRejection', async (error: Error) => {
        await this.fatal('unhandled rejection: %s', error.stack)
      })
  }

  /** Set logging options.
    * @param options - the new logging options.
    * @return The old options.
    */
  setOptions (options: Options = {}): Options {
    const oldOptions = this._options
    this._options = options
    if (this._options.vvdebug) {
      this._options.vdebug = true
    }
    if (this._options.vdebug) {
      this._options.debug = true
    }
    if (this._options.debug) {
      this._options.chalk = true
    }
    return oldOptions
  }

  /** Do cleanup before exit.
    * @abstract
    */
  async destroy (): Promise<void> {}

  // Signal handler.
  async #onSignal (signal: string, signalNum: number) {
    this.log('got %s - exiting', signal)
    try {
      await this.destroy()
    } catch (error) {
      this.error(error as Error)
    }
    setImmediate(() => { process.exit(128 + signalNum) })
    // Prevent #onSignal() from returning.
    await timeout(1000)
  }

  /** Program name. */
  get name () { return this._name }
  set name (name: string) {
    const list = name.split('/')
    this._name = list[list.length - 1]
    process.title = this._name
  }

  /** Debug mode is enabled. */
  get debugEnabled (): boolean { return !!this._options.debug }

  /** The contents of `package.json`. */
  get packageJson (): jsonMap { return this._packageJson }

  /** Usage string.
    * @type {string}
    */
  get usage (): string { return this._usage }
  set usage (usage: string) {
    this._usage = usage
  }

  /** Verbose debug mode is enabled. */
  get vdebugEnabled (): boolean { return !!this._options.vdebug }

  // ===== Logging =============================================================

  /** Print debug message to stderr. */
  debug (format: string | Error, ...args: unknown[]) {
    if (this._options.debug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print error message to stderr. */
  error (format: string | Error, ...args: unknown[]) {
    this.#log({ label: 'error', chalk: chalk.bold.red }, format, ...args)
  }

  /** Print error message to stderr and abort program. */
  async fatal (format: string | Error, ...args: unknown[]): Promise<never> {
    this.#log({ label: 'fatal', chalk: chalk.bold.red }, format, ...args)
    try {
      await this.destroy()
    } catch (error) {
      this.error(error as Error)
    }
    // Prevent fatal() from returning.
    setImmediate(() => { process.exit(-1) })
    await timeout(1000)
    process.exit(-1) // never reached
  }

  // /** Print info message to stderr. */
  // info (format: string | Error, ...args: any[]): void {
  //   this.#log({ chalk: chalk.green }, format, ...args)
  // }

  /** Print log message to stderr. */
  log (format: string | Error, ...args: unknown[]) {
    this.#log({}, format, ...args)
  }

  /** Print continued log message to stderr (i.e. without label). */
  logc (format: string | Error, ...args: unknown[]) {
    this.#log({ noLabel: true }, format, ...args)
  }

  /** Print message to stdout. */
  print (format: null | string | Error, ...args: unknown[]) {
    this.#log({ noLabel: true, stdout: true }, format, ...args)
  }

  /** Print verbose debug message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  vdebug (format: string | Error, ...args: unknown[]) {
    if (this._options.vdebug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print very verbose debug message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  vvdebug (format: string | Error, ...args: unknown[]) {
    if (this._options.vvdebug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print warning message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  warn (format: string | Error, ...args: unknown[]) {
    this.#log({ label: 'warning', chalk: chalk.yellow }, format, ...args)
  }

  // Do the heavy lifting for debug(), error(), fatal(), log(), and warn(),
  // taking into account the options, and errors vs exceptions.
  #log: (params: { noLabel?: boolean, stdout?: boolean, label?: string, chalk?: (msg: string) => string }, ...args: unknown[]) => void = (params, ...args) => {
    const output = params.stdout ? process.stdout : process.stderr
    let timestamp = ''
    let message
    let usage

    // If last argument is Error convert it to string.
    if (args.length > 0) {
      let lastArg = args.pop() as string | Error
      if (lastArg instanceof Error) {
        if (lastArg instanceof UsageError) {
        // if (lastArg.constructor.name === 'UsageError') {
          usage = true
        }
        lastArg = formatError(lastArg, this._options.chalk as boolean)
      }
      args.push(lastArg)
    }

    // Format message.
    if (args[0] == null) {
      message = ''
    } else if (typeof args[0] === 'string') {
      message = format(...args)
    } else {
      message = format('%o', ...args)
    }

    // Handle newline.
    if (message.substring(message.length - 2) === '\\c') {
      message = message.substring(0, message.length - 2)
    } else {
      message += '\n'
    }

    // Handle labels.
    if (!params.noLabel) {
      if (params.label != null) {
        message = params.label + ': ' + message
      }
      if (this._options.program) {
        message = this._name + ': ' + message
      }
      if (this._options.timestamp) {
        timestamp = '[' + String(new Date()).substring(0, 24) + '] '
        if (this._options.chalk) {
          timestamp = chalk.white(timestamp)
        }
      }
    }

    // Handle colours.
    if (params.chalk != null && this._options.chalk as boolean) {
      message = params.chalk(message)
    }
    output.write(timestamp + message)
    if (usage && this._usage != null) {
      this.logc('usage: %s', this._usage)
    }
  }
}

/** Parser and validator for command-line arguments. */
export class CommandLineParser {
  private _tool: CommandLineTool
  private _packageJson: jsonMap
  private _callbacks: {
    flags: map<(key: string) => void>
    options: map<(value: string, key: string) => void>
    parameters: { key: string, callback: (value: string) => void, optional: boolean }[],
    remaining: ((values: string[]) => void) | null
  }

  /** Create a new parser instance. */
  constructor (
    /** The parent command-line tool,which will be used to set the debug level. */
    tool: CommandLineTool
  ) {
    this._tool = tool
    this._packageJson = this._tool.packageJson
    this._callbacks = {
      flags: {},
      options: {},
      parameters: [],
      remaining: null
    }
  }

  #toShortKey (key: string | null): string | null {
    if (key == null) {
      return null
    }
    if (key.length !== 1) {
      throw new TypeError(`${key}: invalid short key`)
    }
    if (this._callbacks.flags[key] != null || this._callbacks.options[key] != null) {
      throw new SyntaxError(`${key}: duplicate short key`)
    }
    return key
  }

  #toLongKey (key: string): string {
    if (key.length <= 1) {
      throw new TypeError(`${key}: invalid long key`)
    }
    if (this._callbacks.flags[key] != null || this._callbacks.options[key] != null) {
      throw new SyntaxError(`${key}: duplicate long key`)
    }
    return key
  }

  /** Define a flag to print help text and exit.
    *
    * See {@link CommandLineParser#flag flag()}.
    */
  helpFlag (
    /** The short key (e.g. `h` for `-h`). */
    shortKey: string | null = '-h',
    /** The long key (e.g. `help` for `--help`). */
    longKey: string = '--help',
    /** The help text. */
    helpText: string
  ): this {
    // TODO: get helptext from this._tool
    helpText = toString(helpText, { key: 'helpText', nonEmpty: true })
    return this.flag(shortKey, longKey, () => {
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
  }

  /** Define a flag to print the version and exit.
    *
    * See {@link CommandLineParser#flag flag()}.
    */
  versionFlag (
    /** The short key (e.g. `V` for `-V`). */
    shortKey: string | null = '-V',
    /** The long key (e.g. `version` for `--version`). */
    longKey: string = '--version'
  ): this {
    return this.flag(shortKey, longKey, () => {
      this._tool.print(this._packageJson.version as string)
      process.exit(0)
    })
  }

  /** Define a flag for debug level.
    *
    * See {@link CommandLineParser#flag flag()}.
    */
  debugFlag (
    /** The short key (e.g. `D` for `-D`). */
    shortKey: string | null,
    /** The long key (e.g. `debug` for `--debug`). */
    longKey: string
  ): this {
    return this.flag(shortKey, longKey, () => {
      if (this._tool.vdebugEnabled) {
        this._tool.setOptions({ vvdebug: true })
      } else if (this._tool.debugEnabled) {
        this._tool.setOptions({ vdebug: true })
      } else {
        this._tool.setOptions({ debug: true, chalk: true })
      }
    })
  }

  /** Define a flag.
    *
    * A flag is an optional command-line parameter, identified by a short key
    * (a single character, like `-v`), or by a long key (a word, like
    * `--verbose`).
    */
  flag (
    /** The short key (e.g. `v` for `-v`). */
    shortKey: string | null,
    /** The long key (e.g. `verbose` for `--verbose`). */
    longKey: string,
    /** The callback to invoke when the flag is set. */
    callback: (key: string) => void
  ): this {
    shortKey = this.#toShortKey(shortKey)
    longKey = this.#toLongKey(longKey)
    if (shortKey != null) {
      this._callbacks.flags[shortKey] = callback
    }
    this._callbacks.flags[longKey] = callback
    return this
  }

  /** Define an option.
    *
    * An option is an optional command-line paramater that takes a value.
    * The option is identified by a short key (a single character, like `-t`),
    * or by a long key (a word, like `--timeout`).
    * The value can specified in the next or in the same command-line parameter:
    * `-t5` `--timeout=5`, `-t 5`, or `--timeout 5`.
    */
  option (
    /** The short key (e.g. `t` for `-t`). */
    shortKey: string | null,
    /** The long key (e.g. `timeout` for `--timeout`). */
    longKey: string,
    /** The callback to invoke when the option is set. */
    callback: (value: string, key: string) => void
  ): this {
    shortKey = this.#toShortKey(shortKey)
    longKey = this.#toLongKey(longKey)
    if (shortKey != null) {
      this._callbacks.options[shortKey] = callback
    }
    this._callbacks.options[longKey] = callback
    return this
  }

  /** Add a callback for a positional parameter.
    *
    * A positional paramater is a mandatory command-line parameter.
    * It is identified by a key, e.g. `command`.
    */
  parameter (
    /** The parameter key (e.g. `command`). */
    key: string,
    /** The callback to invoke when the parameter is set. */
    callback: (value: string) => void,
    /** Whether the parameter is optional. */
    optional: boolean = false
  ): this {
    key = toString(key, { key: 'key', nonEmpty: true })
    this._callbacks.parameters.push({ key, callback, optional })
    return this
  }

  /** Add a callback for the remaining parameters.
    *
    * The remaining parameters are any additional commmand-line parameters,
    * after the positional paramers, typically indicated as `[file ...]`.
    */
  remaining (
    /** The callback to invoke when the remaining parameters are set. */
    callback: (values: string[]) => void
  ): this {
    this._callbacks.remaining = callback
    return this
  }

  /** Parse the command-line parameters.
    *
    * @throws {@link UsageError} in case of invalid command-line parameters.
    */
  parse (
    wordList: string[] = process.argv.slice(2)
  ): void {
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
      p.callback(parameter)
    }
    const remaining = wordList.slice(wordIndex, wordList.length)
    const callback = this._callbacks.remaining
    if (callback != null) {
      callback(remaining)
    } else if (remaining.length > 0) {
      throw new UsageError('too many parameters')
    }
  }
}
