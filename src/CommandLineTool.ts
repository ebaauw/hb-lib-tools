// hb-lib-tools/src/CommandLineTool.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { Logger } from 'hb-lib-tools'

import { format } from 'node:util'

import { formatError, timeout } from 'hb-lib-tools'
import { chalk } from 'hb-lib-tools/chalk'
import { UsageError } from 'hb-lib-tools/CommandLineParser'
import { OptionParser } from 'hb-lib-tools/OptionParser'

export enum commandLineToolMode {
  /** Command-line program. */
  command = 'command',
  /** Program runs as standalone daemon. */
  daemon = 'daemon',
  /** Program runs as systemctl service. */
  service = 'service'
}
export type commandLineToolOptions = {
  /** Use chalk to colour messages. */
  chalk?: boolean,
  /** Output debug messages. */
  debug?: boolean,
  /** Output verbose debug messages. */
  vdebug?: boolean,
  /** Output very verbose debug messages. */
  vvdebug?: boolean,
  /** Include program name. */
  program?: boolean,
  /** Include timestamp. */
  timestamp?: boolean,
  /** Mode in which utility is run. */
  mode?: commandLineToolMode,
}

/** Command-line tool.
  * @abstract 
  */
class CommandLineTool implements Logger {
  /** Make text bold.
    * @param text - The text.
    * @returns The bold text.
    */
  static b (text: string) { return chalk.bold(text) }

  /** Make text underlined.
    * @param text - The text.
    * @returns The underlined text.
    */
  static u (text: string) { return chalk.underline(text) }
  
  private _options: commandLineToolOptions
  private optionParser?: OptionParser
  private _name?: string
  private _usage?: string

  /** Create a new instance of a command line utility.
    */
  constructor (options: commandLineToolOptions = { mode: commandLineToolMode.command }) {
    // Set program name
    // argv[0]: node executable, argv[1]: javascript file
    this.name = process.argv[1] as string
    // Use {mode: "command"} as default for logging.
    this._options = {
      chalk: false,
      debug: false,
      program: true,
      timestamp: false
    }
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
    * @returns The old options.
    */
  setOptions (options: commandLineToolOptions = {}): commandLineToolOptions {
    if (this.optionParser == null) {
      this.optionParser = new OptionParser(this._options)
      this.optionParser
        .boolKey('chalk') // Use chalk to colour messages.
        .boolKey('debug') // Show debug messages.
        .boolKey('vdebug') // Show verbose debug messages.
        .boolKey('vvdebug') // Show very verbose debug messages.
        .boolKey('program') // Include program name.
        .boolKey('timestamp') // Include timestamp.
        .enumKey('mode')
        .enumKeyValue('mode', 'command', () => {
          // Command-line program.
          this._options.chalk = false
          this._options.program = true
          this._options.timestamp = false
        })
        .enumKeyValue('mode', 'daemon', () => {
          // Program runs as standalone daemon.
          this._options.chalk = true
          this._options.program = false
          this._options.timestamp = true
        })
        .enumKeyValue('mode', 'service', () => {
          // Program runs as systemctl service.
          this._options.chalk = true
          this._options.program = false
          this._options.timestamp = false
        })
    }
    const oldOptions = this._options
    this.optionParser.parse(options)
    if (this._options.debug) {
      this._options.chalk = true
    }

    return oldOptions
  }

  /** Do cleanup before exit.
    * @abstract
    */
  async destroy () {}

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

  /** Program name.
    * @type {string}
    */
  get name () { return this._name! }
  set name (name: string) {
    const list = name.split('/')
    this._name = list[list.length - 1]
    process.title = this._name
  }

  /** Debug mode is enabled.
    * @type {boolean}
    */
  get debugEnabled () {
    return !!this._options.debug
  }

  /** Usage string.
    * @type {string}
    */
  get usage () { return this._usage }
  set usage (usage) {
    this._usage = usage
  }

  /** Verbose debug mode is enabled.
    * @type {boolean}
    */
  get vdebugEnabled () {
    return !!this._options.vdebug
  }

  // ===== Logging =============================================================

  /** Print debug message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  debug: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    if (this._options.debug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print error message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  error: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    this.#log({ label: 'error', chalk: chalk.bold.red }, format, ...args)
  }

  /** Print error message to stderr and abort program.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  fatal: (format: string | Error, ...args: unknown[]) => void = async (format, ...args) => {
    this.#log({ label: 'fatal', chalk: chalk.bold.red }, format, ...args)
    try {
      await this.destroy()
    } catch (error) {
      this.error(error as Error)
    }
    setImmediate(() => { process.exit(-1) })
    // Prevent fatal() from returning.
    await timeout(1000)
  }

  // /** Print info message to stderr.
  //   * @param format - The printf-style message or an instance of
  //   * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
  //   * @param args - Arguments to the printf-style message.
  //   */
  // info: (format: string | Error, ...args: any[]) => void = (format, ...args) => {
  //   this.#log({ chalk: chalk.green }, format, ...args)
  // }

  /** Print log message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  log: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    this.#log({}, format, ...args)
  }

  /** Print log message continuation to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  logc: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    this.#log({ noLabel: true }, format, ...args)
  }

  /** Print message to stdout.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  print: (format: null | string | Error, ...args: unknown[]) => void = (format, ...args) => {
    this.#log({ noLabel: true, stdout: true }, format, ...args)
  }

  /** Print verbose debug message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  vdebug: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    if (this._options.vdebug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print very verbose debug message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  vvdebug: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
    if (this._options.vvdebug) {
      this.#log({ chalk: chalk.gray }, format, ...args)
    }
  }

  /** Print warning message to stderr.
    * @param format - The printf-style message or an instance of
    * [Error](https://nodejs.org/dist/latest-v14.x/docs/api/errors.html#errors_class_error).
    * @param args - Arguments to the printf-style message.
    */
  warn: (format: string | Error, ...args: unknown[]) => void = (format, ...args) => {
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

export { CommandLineTool }
