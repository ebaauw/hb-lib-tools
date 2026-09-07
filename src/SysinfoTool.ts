// hb-lib-tools/src/SysinfoTool.ts
//
// Show system info.
// Copyright © 2021-2026 Erik Baauw. All rights reserved.

/** The `sysinfo` command line tool.
  * Issue `sysinfo -h` for more info.
  * @module
  */

import type { jsonMap } from 'hb-lib-tools'

import { createRequire } from 'node:module'

import { CommandLineTool, CommandLineParser, b } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { SystemInfo } from 'hb-lib-tools/SystemInfo'

const require = createRequire(import.meta.url)

const usage = `${b('sysinfo')} [${b('-hVDj')}]`
const help = `System information tool.

Print Hardware and Operating System information.

Usage: ${usage}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages.

  ${b('-j')}, ${b('--json')}
  Print full info in json.`

/** @ignore */
class SysinfoTool extends CommandLineTool {
  _packageJson: jsonMap
  systemInfo: SystemInfo | null = null
  json = false

  constructor (packageJson?: jsonMap) {
    super()
    this._packageJson = packageJson ?? require('../package.json')
    this.usage = usage
  }

  parseArguments () {
    const parser = new CommandLineParser(this)
    parser
      .helpFlag('h', 'help', help)
      .versionFlag('V', 'version')
      .debugFlag('D', 'debug')
      .flag('j', 'json', () => { this.json = true })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.systemInfo = new SystemInfo({ logger: this })
      await this.systemInfo.init()
      if (this.json) {
        const jsonFormatter = new JsonFormatter({ noWhiteSpace: false })
        this.print(jsonFormatter.stringify({
          hardware: this.systemInfo.hwInfo,
          os: this.systemInfo.osInfo
        }))
      } else {
        this.print(this.systemInfo.hwInfo.prettyName as string)
        this.print(this.systemInfo.osInfo.prettyName as string)
      }
    } catch (error) {
      await this.fatal(error as Error)
    }
  }
}

export { SysinfoTool }
