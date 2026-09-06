// hb-lib-tools/src/SysinfoTool.ts
//
// Show system info.
// Copyright © 2021-2026 Erik Baauw. All rights reserved.

/** The `sysinfo` command line tool.
  * Issue `sysinfo -h` for more info.
  * @module
  */

import type { jsonMap, map } from 'hb-lib-tools'

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool, b } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { SystemInfo } from 'hb-lib-tools/SystemInfo'

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
  pkgJson: jsonMap
  systemInfo: SystemInfo | null = null
  json = false
  options: map<unknown> = {}

  constructor (pkgJson: jsonMap) {
    super()
    this.usage = usage
    this.options = {
      noWhiteSpace: false
    }
    this.pkgJson = pkgJson
  }

  parseArguments () {
    const parser = new CommandLineParser(this, this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .debug('D', 'debug')
      .flag('j', 'json', () => { this.json = true })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.systemInfo = new SystemInfo({ logger: this })
      await this.systemInfo.init()
      if (this.json) {
        const jsonFormatter = new JsonFormatter(this.options)
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
