// hb-lib-tools/src/JsonTool.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.
//
// JSON formatter.

import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { unzip } from 'node:zlib'

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { integer, OptionParser } from 'hb-lib-tools/OptionParser'

const gunzip = promisify(unzip)

const { b, u } = CommandLineTool

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

class JsonTool extends CommandLineTool {
  private options: {
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
  private pkgJson
  private stringList: string[]
  private fileList: string[]
  private jsonFormatter!: JsonFormatter
  private n!: integer

  constructor (pkgJson?: Record<string, unknown>) {
    super()
    this.usage = usage
    this.options = {
      sortKeys: false,
      noWhiteSpace: false,
      jsonArray: false,
      joinKeys: false,
      ascii: false,
      topOnly: false,
      maxDepth: Number.MAX_SAFE_INTEGER as integer,
      leavesOnly: false,
      keysOnly: false,
      valuesOnly: false
    }
    this.pkgJson = pkgJson
    this.stringList = []
    this.fileList = []
  }

  parseArguments (): void {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .flag('s', 'sortKeys', () => { this.options.sortKeys = true })
      .flag('n', 'noWhiteSpace', () => { this.options.noWhiteSpace = true })
      .flag('j', 'jsonArray', () => { this.options.jsonArray = true })
      .flag('u', 'joinKeys', () => { this.options.joinKeys = true })
      .flag('a', 'ascii', () => { this.options.ascii = true })
      .flag('t', 'topOnly', () => { this.options.topOnly = true })
      .option('d', 'maxDepth', (value) => {
        this.options.maxDepth = OptionParser.toInt(
          'maxDepth', value, { min: 0, userInput: true }
        )
      })
      .option('p', 'fromPath', (value) => {
        this.options.fromPath = OptionParser.toPath(
          'fromPath', value, { userInput: true }
        )
      })
      .flag('l', 'leavesOnly', () => { this.options.leavesOnly = true })
      .flag('k', 'keysOnly', () => { this.options.keysOnly = true })
      .flag('v', 'valuesOnly', () => { this.options.valuesOnly = true })
      .option('c', 'string', (value) => { this.stringList.push(value) })
      .remaining((list) => { this.fileList = list })
      .parse()
  }

  processString (s: string): void {
    let value
    try {
      value = JSON.parse(s)
    } catch (error) {
      throw new Error((error as Error).message, { cause: error }) // Convert SyntaxError to Error.
    }
    const output = this.jsonFormatter.stringify(value)
    if (this.n++ > 0) {
      this.print('------')
    }
    if (output !== '') {
      this.print(output)
    }
  }

  async readStdin (): Promise<string> {
    return new Promise((resolve) => {
      let s = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (data) => { s += data })
      process.stdin.on('end', () => { resolve(s) })
    })
  }

  async main () {
    try {
      this.parseArguments()
      this.jsonFormatter = new JsonFormatter(this.options)
      if (this.fileList.length === 0 && this.stringList.length === 0) {
        this.fileList = ['-']
      }
      this.n = 0
      this.stringList.forEach((s) => {
        try {
          this.processString(s)
        } catch (error) {
          this.error(error as Error)
        }
      })
      this.fileList.forEach(async (file) => {
        try {
          const s = file === '-'
            ? await this.readStdin()
            : file.endsWith('.gz')
              ? (await gunzip(await readFile(file))).toString('utf8')
              : await readFile(file, 'utf8')
          this.processString(s)
        } catch (error) {
          this.error(error as Error)
        }
      })
    } catch (error) {
      await this.fatal(error as Error)
    }
  }
}

export { JsonTool }
