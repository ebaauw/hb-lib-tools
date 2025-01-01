// hb-lib-tools/lib/SysinfoTool.js
//
// Show system info.
// Copyright © 2021-2025 Erik Baauw. All rights reserved.

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { SystemInfo } from 'hb-lib-tools/SystemInfo'

const { b } = CommandLineTool

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

class SysinfoTool extends CommandLineTool {
  constructor (pkgJson) {
    super()
    this.usage = usage
    this.options = {
      noWhiteSpace: false
    }
    this.pkgJson = pkgJson
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .flag('D', 'debug', () => { this.setOptions({ debug: true }) })
      .flag('j', 'json', () => { this.json = true })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.systemInfo = new SystemInfo()
      this.systemInfo
        .on('error', (error) => { this.error(error) })
        .on('exec', (command) => { this.debug('exec: %s', command) })
        .on('readFile', (fileName) => { this.debug('read file: %s', fileName) })
      await this.systemInfo.init()
      if (this.json) {
        const jsonFormatter = new JsonFormatter(this.options)
        this.print(jsonFormatter.stringify({
          hardware: this.systemInfo.hwInfo,
          os: this.systemInfo.osInfo
        }))
      } else {
        this.print(this.systemInfo.hwInfo.prettyName)
        this.print(this.systemInfo.osInfo.prettyName)
      }
    } catch (error) {
      await this.fatal(error)
    }
  }
}

export { SysinfoTool }
