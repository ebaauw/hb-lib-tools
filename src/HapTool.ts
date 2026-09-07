// hb-lib-tools/src/HapTool.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.
//
// Logger for HomeKit accessory announcements.

/** The `hap` command line tool.
  * Issue `hap -h` for more info.
  * @module
  */

import type { integer, jsonMap } from 'hb-lib-tools'

import { createRequire } from 'node:module'

import { CommandLineTool, CommandLineParser, Mode, b, u } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { MdnsClient } from 'hb-lib-tools/MdnsClient'
import { toInt } from 'hb-lib-tools/OptionParser'

const require = createRequire(import.meta.url)

const usage = `${b('hap')} [${b('-hVDads')}] [${b('-T')} ${u('serviceType')}] [${b('-t')} ${u('timeout')}]`
const help = `HAP tool.

Usage: ${usage}

Search for mDNS (Bonjour) services and print found service as JSON.
When running as daemon or service, log mDNS up announcements as JSON.

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.
  
  ${b('-D')}, ${b('--debug')}
  Print debug messages.

  ${b('-a')}, ${b('--all')}
  Search for all service types instead of the default ${b('hap')}.

  ${b('-d')}, ${b('--daemon')}
  Run as daemon.  Listen for mDNS up announcements instead of searching.

  ${b('-s')}, ${b('--service')}
  Run as service.  Listen for mDNS up announcements instead of searching.
  Do not output timestamps.

  ${b('-T')} ${u('serviceType')}, ${b('--serviceType=')}${u('serviceType')}
  Search for service type ${u('serviceType')} instead of the default ${b('hap')}.

  ${b('-t')} ${u('timeout')}, ${b('--timeout=')}${u('timeout')}
  Search for ${u('timeout')} seconds instead of default ${b('5')}.`

/** @ignore */
class HapTool extends CommandLineTool {
  protected _packageJson: jsonMap
  client: MdnsClient | null = null
  jsonFormatter!: JsonFormatter
  options: {
    mode?: Mode,
    serviceType: string,
    timeout: integer
  }


  constructor (packageJson?: jsonMap) {
    super()
    this._packageJson = packageJson ?? require('../package.json')
    this.usage = usage
    this.options = {
      serviceType: 'hap',
      timeout: 5
    }
  }

  parseArguments () {
    const parser = new CommandLineParser(this)
    parser
      .helpFlag('h', 'help', help)
      .versionFlag('V', 'version')
      .debugFlag('D', 'debug')
      .flag('a', 'all', () => { this.options.serviceType = '*' })
      .flag('d', 'daemon', () => { this.options.mode = Mode.daemon })
      .flag('s', 'service', () => { this.options.mode = Mode.service })
      .option('T', 'serviceType', (value) => { this.options.serviceType = value })
      .option('t', 'timeout', (value) => {
        this.options.timeout = toInt(value, { key: 'timeout', min: 1, max: 60, userInput: true })
      })
      .parse()
    this.jsonFormatter = new JsonFormatter(
      this.options.mode === Mode.service
        ? { noWhiteSpace: true, sortKeys: true }
        : { sortKeys: true }
    )
  }

  async main () {
    try {
      this.parseArguments()
      this.client = new MdnsClient({
        logger: this,
        serviceType: this.options.serviceType as string,
        timeout: this.options.timeout as integer
      })
      if (this.options.mode != null) {
        this.setOptions({ mode: this.options.mode })
        this.client.on('serviceUp', (address, obj) => {
          this.log('found %j at %s: %s', obj.name, address, this.jsonFormatter.stringify(obj))
        })
        this.client.listen()
        return
      }
      const result = await this.client.search()
      this.print(this.jsonFormatter.stringify(result))
    } catch (error) {
      await this.fatal(error as Error)
    }
  }

  async destroy () {
    this.client?.stopListen()
  }
}

export { HapTool }
