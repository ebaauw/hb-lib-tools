// hb-lib-tools/cli/upnp.js
//
// Logger for UPnP device announcements.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'
import { UpnpClient } from 'hb-lib-tools/UpnpClient'

const { b, u } = CommandLineTool

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

class UpnpTool extends CommandLineTool {
  constructor (pkgJson) {
    super()
    this.pkgJson = pkgJson
    this.usage = usage
    this.options = {}
    this.upnp = {
      logger: this
    }
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .debug('D', 'debug', this)
      .flag('a', 'all', (key) => { this.upnp.deviceType = 'ssdp:all' })
      .flag('d', 'daemon', (key) => { this.options.mode = 'daemon' })
      .flag('s', 'service', (key) => { this.options.mode = 'service' })
      .option('T', 'deviceType', (value, key) => { this.upnp.deviceType = value })
      .option('t', 'timeout', (value, key) => {
        this.upnp.timeout = OptionParser.toInt(
          'timeout', value, 1, 60, true
        )
      })
      .flag('p', 'hue', (key) => {
        this.upnp.filter = (message) => {
          return /^[0-9A-F]{16}$/.test(message['hue-bridgeid'])
        }
      })
      .flag('z', 'sonos', (key) => {
        this.upnp.deviceType = 'urn:schemas-upnp-org:device:ZonePlayer:1'
      })
      .parse()
  }

  async main () {
    try {
      this.parseArguments()
      this.jsonFormatter = new JsonFormatter(
        this.options.mode === 'service'
          ? { noWhiteSpace: true, sortKeys: true }
          : { sortKeys: true }
      )
      this.upnpClient = new UpnpClient(this.upnp)
      if (this.options.mode) {
        this.setOptions({ mode: this.options.mode })
        this.upnpClient
          .on('deviceAlive', (address, message) => {
            this.log('%s alive at %s: %j', message.nt, message.location, message)
          })
        this.upnpClient.listen()
        return
      }
      const result = await this.upnpClient.search()
      this.print(this.jsonFormatter.stringify(result))
    } catch (error) {
      await this.fatal(error)
    }
  }

  async destroy () {
    this.upnpClient?.stopListen()
  }
}

export { UpnpTool }
