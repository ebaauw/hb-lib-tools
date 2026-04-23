// hb-lib-tools/lib/HapTool.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.
//
// Logger for HomeKit accessory announcements.

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { MdnsClient } from 'hb-lib-tools/MdnsClient'
import { OptionParser } from 'hb-lib-tools/OptionParser'

const { b, u } = CommandLineTool

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

class HapTool extends CommandLineTool {
  constructor (pkgJson) {
    super()
    this.pkgJson = pkgJson
    this.usage = usage
    this.options = {
      serviceType: 'hap',
      timeout: 5
    }
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .debug('D', 'debug', this)
      .flag('a', 'all', (key) => { this.options.serviceType = '*' })
      .flag('d', 'daemon', (key) => { this.options.mode = 'daemon' })
      .flag('s', 'service', (key) => { this.options.mode = 'service' })
      .option('T', 'serviceType', (value, key) => { this.options.serviceType = value })
      .option('t', 'timeout', (value, key) => {
        this.options.timeout = OptionParser.toInt(
          'timeout', value, 1, 60, true
        )
      })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.client = new MdnsClient({
        logger: this,
        serviceType: this.options.serviceType,
        timeout: this.options.timeout
      })
      this.jsonFormatter = new JsonFormatter(
        this.options.mode === 'service'
          ? { noWhiteSpace: true, sortKeys: true }
          : { sortKeys: true }
      )
      if (this.options.mode) {
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
      await this.fatal(error)
    }
  }

  async destroy () {
    this.client?.stopListen()
  }
}

export { HapTool }
