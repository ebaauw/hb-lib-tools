// hb-lib-tools/src/JsonTool.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.
//
// JSON formatter.

/** The `json` command line tool.
  * Issue `json -h` for more info.
  * @module
  */

import type { integer, jsonMap } from 'hb-lib-tools'

import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { unzip } from 'node:zlib'

import { isJson } from 'hb-lib-tools'
import { CommandLineTool, CommandLineParser, b, u } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { toInt, toPath } from 'hb-lib-tools/OptionParser'

import defaultPackageJson from '../package.json' with { type: 'json' }

const gunzip = promisify(unzip)

async function readStdin (): Promise<string> {
  let s = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    s += chunk
  }
  return s
}

const usage = `${b('json')} [${b('-hVsnjuatlkv')}] [${b('-p')} path] [${b('-d')} depth] [${b('-c')} ${u('string')}]... [${u('file')}]...`
const help = `JSON formatter.

Usage: ${usage}

By default, ${b('json')} reads JSON from stdin, formats it, and prints it to stdout.

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-s')}, ${b('--sortKeys')}
  Sort object key/value pairs alphabetically on key.

  ${b('-n')}, ${b('--noWhiteSpace')}
  Do not include spaces nor newlines in output.

  ${b('-j')}, ${b('--jsonArray')}
  Output JSON array of objects for each key/value pair.
  Each object contains two key/value pairs:
  - key ${b('keys')} with an array of keys as value;
  - key ${b('value')} with the value as value.

  ${b('-u')}, ${b('--joinKeys')}
  Output JSON array of objects for each key/value pair.
  Each object contains one key/value pair:
  the path (concatenated keys separated by ${b('/')} as key and the value as value.

  ${b('-a')}, ${b('--ascii')}
  Output ${u('path')}${b(':')}${u('value')} in plain text instead of JSON.

  ${b('-t')}, ${b('--topOnly')}
  Limit output to top-level key/values.

  ${b('-p')} ${u('path')}, ${b('--fromPath=')}${u('path')}
  Limit output to key/values under ${u('path')}. Set top level below ${u('path')}.

  ${b('-d')} ${u('depth')}, ${b('--maxDepth=')}${u('depth')}
  Limit output to levels above ${u('depth')}.

  ${b('-l')}, ${b('--leavesOnly')}
  Limit output to leaf (non-array, non-object) key/values.

  ${b('-k')}, ${b('--keysOnly')}
  Limit output to keys. With ${b('-u')} output JSON array of paths.

  ${b('-v')}, ${b('--valuesOnly')}
  Limit output to values. With ${b('-u')} output JSON array of values.

  ${b('-c')} ${u('string')}, ${b('--string=')}${u('string')}
  Read JSON from ${u('string')} instead of from stdin.

  ${u('file')}
  Read JSON from ${u('file')} instead of from stdin.
  When the file name ends in ${b('.gz')}, it is assumed to be a gzip file and
  uncompressed automatically.`

/** @ignore */
class JsonTool extends CommandLineTool {
  protected _packageJson: jsonMap
  private readonly options: {
    sortKeys: boolean,
    noWhiteSpace: boolean,
    jsonArray: boolean,
    joinKeys: boolean,
    ascii: boolean,
    topOnly: boolean,
    fromPath?: string,
    maxDepth: integer,
    leavesOnly: boolean,
    keysOnly: boolean,
    valuesOnly: boolean
  }
  private readonly stringList: string[]
  private readonly fileList: string[]
  private jsonFormatter!: JsonFormatter
  private n!: integer

  /** @hidden */
  constructor (packageJson?: jsonMap) {
    super()
    this._packageJson = packageJson ?? defaultPackageJson
    this.usage = usage
    this.options = {
      sortKeys: false,
      noWhiteSpace: false,
      jsonArray: false,
      joinKeys: false,
      ascii: false,
      topOnly: false,
      maxDepth: Number.MAX_SAFE_INTEGER,
      leavesOnly: false,
      keysOnly: false,
      valuesOnly: false
    }
    this.stringList = []
    this.fileList = []
  }

  parseArguments (): void {
    const parser = new CommandLineParser(this)
    parser
      .helpFlag('h', 'help', help)
      .versionFlag('V', 'version')
      .flag('s', 'sortKeys', () => { this.options.sortKeys = true })
      .flag('n', 'noWhiteSpace', () => { this.options.noWhiteSpace = true })
      .flag('j', 'jsonArray', () => { this.options.jsonArray = true })
      .flag('u', 'joinKeys', () => { this.options.joinKeys = true })
      .flag('a', 'ascii', () => { this.options.ascii = true })
      .flag('t', 'topOnly', () => { this.options.topOnly = true })
      .option('d', 'maxDepth', (value) => {
        this.options.maxDepth = toInt(value, { key: 'maxDepth', min: 0, userInput: true }
        )
      })
      .option('p', 'fromPath', (value) => {
        this.options.fromPath = toPath(value, { key: 'fromPath', userInput: true })
      })
      .flag('l', 'leavesOnly', () => { this.options.leavesOnly = true })
      .flag('k', 'keysOnly', () => { this.options.keysOnly = true })
      .flag('v', 'valuesOnly', () => { this.options.valuesOnly = true })
      .option('c', 'string', (value) => { this.stringList.push(value) })
      .remaining((list) => { this.fileList.push(...list) })
      .parse()
  }

  processString (s: string): void {
    try {
      const json: unknown = JSON.parse(s)
      if (!isJson(json)) {
        throw new Error('Not valid JSON')
      }
      const output = this.jsonFormatter.stringify(json)
      if (this.n > 0) {
        this.print('------')
      }
      this.n += 1
      if (output !== '') {
        this.print(output)
      }
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new Error(error.message, { cause: error }) // Convert SyntaxError to Error.
      }
      throw error
    }
  }


  async main (): Promise<void> {
    try {
      this.parseArguments()
      this.jsonFormatter = new JsonFormatter(this.options)
      if (this.fileList.length === 0 && this.stringList.length === 0) {
        this.fileList.push('-')
      }
      this.n = 0
      for (const s of this.stringList) {
        try {
          this.processString(s)
        } catch (error) { this.error(error) }
      }
      await this.fileList.reduce(async (previous, file) => {
        await previous
        try {
          const s = file === '-'
            ? await readStdin()
            : file.endsWith('.gz')
              ? (await gunzip(await readFile(file))).toString('utf8')
              : await readFile(file, 'utf8')
          this.processString(s)
        } catch (error) { this.error(error) }
      }, Promise.resolve())
    } catch (error) { this.error(error) }
  }
}

export { JsonTool }
