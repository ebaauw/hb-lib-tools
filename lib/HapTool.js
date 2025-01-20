// hb-lib-tools/lib/HapTool.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2025 Erik Baauw. All rights reserved.
//
// Logger for HomeKit accessory announcements.

import { timeout } from 'hb-lib-tools'
import { CommandLineParser } from 'hb-lib-tools/CommandLineParser'
import { CommandLineTool } from 'hb-lib-tools/CommandLineTool'
import { JsonFormatter } from 'hb-lib-tools/JsonFormatter'
import { OptionParser } from 'hb-lib-tools/OptionParser'
import { mdns } from 'hb-lib-tools/mdns'

const { b, u } = CommandLineTool

const usage = `${b('hap')} [${b('-hVlrs')}] [${b('-t')} ${u('timeout')}]`
const help = `Logger for HomeKit accessory announcements.

Usage: ${usage}

Search for HomeKit accessory announcements
Parameters:
  ${b('-h')}          Print this help and exit.
  ${b('-V')}          Print version and exit.
  ${b('-d')}          Listen for mDNS alive broadcasts instead of searching.
  ${b('-s')}          Do not output timestamps (useful when running as service).
  ${b('-t')} ${u('timeout')}  Search for ${u('timeout')} seconds instead of default ${b('5')}.`

class HapTool extends CommandLineTool {
  constructor (pkgJson) {
    super()
    this.pkgJson = pkgJson
    this.usage = usage
    this.options = { timeout: 15 }
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help)
      .version('V', 'version')
      .flag('l', 'listen', (key) => { this.options.mode = 'daemon' })
      .flag('s', 'service', (key) => { this.options.mode = 'service' })
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
      this.jsonFormatter = new JsonFormatter(
        this.options.mode === 'service'
          ? { noWhiteSpace: true, sortKeys: true }
          : { sortKeys: true }
      )
      if (this.options.mode != null) {
        this.setOptions({ mode: this.options.mode })
      }

      this.log('searching for HomeKit accessories')
      const browser = mdns.createBrowser(mdns.tcp('hap'))
      browser
        .on('serviceUp', (obj) => {
          delete obj.rawTxtRecord
          this.log(
            'found accessory: %s', obj.name, this.jsonFormatter.stringify(obj)
          )
        })
        .start()

      if (this.options.mode == null) {
        await timeout(this.options.timeout * 1000)
        this.log('search done')
        browser.stop()
      }
    } catch (error) {
      await this.fatal(error)
    }
  }
}

export { HapTool }
