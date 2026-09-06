// hb-lib-tools/src/UpnpTool.ts
//
// Logger for UPnP device announcements.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

/** The `upnp` command line tool.
  * Issue `upnp -h` for more info.
  * @module
  */

import type { jsonMap, map } from 'hb-lib-tools'
import { Mode } from 'hb-lib-tools/CommandLineTool'

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool, b, u } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { toInt } from 'hb-lib-tools/OptionParser'
import { UpnpClient } from 'hb-lib-tools/UpnpClient'

const usage = `${b('upnp')} [${b('-hVDadnpsz')}] [${b('-T')} ${u('deviceType')}] [${b('-t')} ${u('timeout')}]`
const help = `UPnP tool.

Search for UPnP devices and print found devices as JSON.
When running as daemon or service, log UPnP alive broadcasts as JSON.

Usage: ${usage}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages.

  ${b('-a')}, ${b('--all')}
  Short for ${b('-c ssdp:all')}.

  ${b('-d')}, ${b('--daemon')}
  Run as daemon.  Listen for UPnP alive broadcasts instead of searching.

  ${b('-n')}, ${b('--noWhiteSpace')}
  Do not include spaces nor newlines in JSON output.

  ${b('-p')}, ${b('--hue')}
  Search for Philips Hue bridges and/or deCONZ gateways.

  ${b('-s')}, ${b('--service')}
  Run as daemon.  Listen for UPnP alive broadcasts instead of searching.

  ${b('-T')} ${u('deviceType')}, ${b('--deviceType=')}${u('deviceType')}
  Search for ${u('deviceType')} instead of default ${b('upnp:rootdevice')}.

  ${b('-t')} ${u('timeout')}, ${b('--timeout=')}${u('timeout')}
  Search for ${u('timeout')} seconds instead of default ${b('5')}.

  ${b('-z')}, ${b('--sonos')}
  Search for Sonos Zone Players.`

/** @ignore */
class UpnpTool extends CommandLineTool {
  pkgJson: jsonMap
  upnpClient: UpnpClient | null = null
  jsonFormatter!: JsonFormatter
  options: {
    deviceType: string,
    filter?: (message: map<string>) => boolean,
    mode?: Mode,
    timeout: number
  }
  upnp: map<unknown>

  constructor (pkgJson: jsonMap) {
    super()
    this.pkgJson = pkgJson
    this.usage = usage
    this.options = {
      deviceType: 'upnp:rootdevice',
      timeout: 5
    }
    this.upnp = {
      logger: this
    }
  }

  parseArguments () {
    const parser = new CommandLineParser(this, this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .debug('D', 'debug')
      .flag('a', 'all', () => { this.upnp.deviceType = 'ssdp:all' })
      .flag('d', 'daemon', () => { this.options.mode = Mode.daemon })
      .flag('s', 'service', () => { this.options.mode = Mode.service })
      .option('T', 'deviceType', (value) => { this.upnp.deviceType = value })
      .option('t', 'timeout', (value) => {
        this.upnp.timeout = toInt(
          value, { key: 'timeout', min: 1, max: 60, userInput: true }
        )
      })
      .flag('p', 'hue', () => {
        this.upnp.filter = (message: map<string>) => {
          return /^[0-9A-F]{16}$/.test(message['hue-bridgeid'])
        }
      })
      .flag('z', 'sonos', () => {
        this.upnp.deviceType = 'urn:schemas-upnp-org:device:ZonePlayer:1'
      })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.jsonFormatter = new JsonFormatter(
        this.options.mode === Mode.service
          ? { noWhiteSpace: true, sortKeys: true }
          : { sortKeys: true }
      )
      this.upnpClient = new UpnpClient(this.upnp)
      if (this.options.mode != null) {
        this.setOptions({ mode: this.options.mode })
        this.upnpClient
          .on('deviceAlive', (address, message) => {
            this.log('%s alive at %s:  %j', message.nt, message.location, message)
          })
        this.upnpClient.listen()
        return
      }
      const result = await this.upnpClient.search()
      this.print(this.jsonFormatter.stringify(result))
    } catch (error) {
      await this.fatal(error as Error)
    }
  }

  async destroy () {
    this.upnpClient?.stopListen()
  }
}

export { UpnpTool }
