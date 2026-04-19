// hb-lib-tools/lib/SystemInfo.js
//
// Library for Homebridge plugins.
// Copyright © 2019-2026 Erik Baauw. All rights reserved.

import { exec, execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { cpus } from 'node:os'

import { toHexString } from 'hb-lib-tools'
import { semver } from 'hb-lib-tools/semver'

const rpiInfo = {
  manufacturers: {
    0: 'Sony UK',
    1: 'Egoman',
    2: 'Embest',
    3: 'Sony Japan',
    4: 'Embest',
    5: 'Stadium'
  },
  memorySizes: {
    0: '256MB',
    1: '512MB',
    2: '1GB',
    3: '2GB',
    4: '4GB',
    5: '8GB',
    6: '16GB'
  },
  models: {
    0: { name: 'A' },
    1: { name: 'B' },
    2: { name: 'A+', led: true },
    3: { name: 'B+', led: true, usb: true },
    4: { name: '2B', led: true, usb: true },
    5: { name: 'Alpha', led: true }, // early prototype
    6: { name: 'CM1', led: true },
    8: { name: '3B', led: true, usb: true },
    9: { name: 'Zero' },
    10: { name: 'CM3', led: true },
    12: { name: 'Zero W' },
    13: { name: '3B+', led: true, usb: true },
    14: { name: '3A+', led: true },
    // 15: { name: '' }, // Internal use only
    16: { name: 'CM3+', led: true },
    17: { name: '4B', led: true },
    18: { name: 'Zero 2 W' },
    19: { name: '400', led: true },
    20: { name: 'CM4', led: true },
    21: { name: 'CM4S', led: true },
    // 22: { name: '' }, // Internal use only
    23: { name: '5', fan: true },
    24: { name: 'CM5', fan: true, led: true },
    25: { name: '500', fan: true, led: true },
    26: { name: 'CM5 Lite', fan: true, led: true }
  },
  processors: {
    0: 'BCM2835',
    1: 'BCM2836',
    2: 'BCM2837',
    3: 'BCM2711',
    4: 'BCM2712'
  },
  oldRevisions: {
    2: { model: 'B', revision: '1.0', memory: '256MB', manufacturer: 'Egoman' },
    3: { model: 'B', revision: '1.0', memory: '256MB', manufacturer: 'Egoman' },
    4: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Sony UK' },
    5: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Qisda' },
    6: { model: 'B', revision: '2.0', memory: '256MB', manufacturer: 'Egoman' },
    7: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Egoman' },
    8: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Sony UK' },
    9: { model: 'A', revision: '2.0', memory: '256MB', manufacturer: 'Qisda' },
    13: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Egoman' },
    14: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Sony UK' },
    15: { model: 'B', revision: '2.0', memory: '512MB', manufacturer: 'Egoman' },
    16: { model: 'B+', revision: '1.2', memory: '512MB', manufacturer: 'Sony UK', led: true, usb: true },
    17: { model: 'CM1', revision: '1.0', memory: '512MB', manufacturer: 'Sony UK', led: true },
    18: { model: 'A+', revision: '1.1', memory: '256MB', manufacturer: 'Sony UK', led: true },
    19: { model: 'B+', revision: '1.2', memory: '512MB', manufacturer: 'Embest', led: true, usb: true },
    20: { model: 'CM1', revision: '1.0', memory: '512MB', manufacturer: 'Embest', led: true },
    21: { model: 'A+', revision: '1.1', memory: '256MB/512MB', manufacturer: 'Embest', led: true }
  }
}

// See: https://en.wikipedia.org/wiki/MacOS_version_history
const macOsInfo = {
  versionNames: {
    '10.0': 'Cheetah',
    10.1: 'Puma',
    10.2: 'Jaguar',
    10.3: 'Panther',
    10.4: 'Tiger',
    10.5: 'Leopard',
    10.6: 'Snow Leopard',
    10.7: 'Lion',
    10.8: 'Mountain Lion',
    10.9: 'Mavericks',
    '10.10': 'Yosemite',
    10.11: 'El Capitan',
    10.12: 'Sierra',
    10.13: 'High Sierra',
    10.14: 'Mojave',
    10.15: 'Catalina',
    11: 'Big Sur',
    12: 'Monterey',
    13: 'Ventura',
    14: 'Sonoma',
    15: 'Sequoia',
    26: 'Tahoe'
  }
}

/** System information.
  * <br>See {@link SystemInfo}.
  * @name SystemInfo
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** System information.
  */
class SystemInfo {
  /** Parse a text into key/value pairs.
    * @param {string} text - The text.
    * @return {Object} - The parsed text.
    */
  static parseText (text, delimiter = '=') {
    const response = {}
    const lines = text?.split('\n') ?? []
    for (const line of lines) {
      const fields = line.split(delimiter)
      if (fields.length === 2) {
        response[fields[0].trim()] = fields[1].replace(/"/g, '').trim()
      }
    }
    return response
  }

  /** Parse Raspberry Pi hardware revision.
    * @param {int} revision - The Raspberry Pi hardware revision.
    * @return {Object} response - The parsed revision information.
    */
  static parseRpiRevision (revision) {
    revision &= 0x00FFFFFF
    const response = {
      gpioMask: 0,
      gpioMaskSerial: (1 << 15) | (1 << 14),
      isRpi: true,
      manufacturer: null,
      memory: null,
      model: null,
      modelRevision: null,
      prettyName: 'Raspberry Pi',
      processor: null,
      supportsFan: false,
      supportsPowerLed: false,
      supportsUsbPower: false,
      revision: toHexString(revision, 6)
    }
    if ((revision & 0x00800000) !== 0) { // New revision scheme.
      const modelId = (revision & 0x00000FF0) >> 4
      response.manufacturer = rpiInfo.manufacturers[(revision & 0x000F0000) >> 16]
      response.memory = rpiInfo.memorySizes[(revision & 0x00700000) >> 20]
      response.model = rpiInfo.models[modelId]?.name
      response.modelRevision = '1.' + ((revision & 0x0000000F) >> 0).toString()
      response.processor = rpiInfo.processors[(revision & 0x0000F000) >> 12]
      response.supportsFan = rpiInfo.models[modelId]?.fan ?? false
      response.supportsPowerLed = rpiInfo.models[modelId]?.led ?? false
      response.supportsUsbPower = rpiInfo.models[modelId]?.usb ?? false
    } else if (rpiInfo.oldRevisions[revision] != null) { // Old incremental revisions.
      const oldRevision = rpiInfo.oldRevisions[revision]
      response.manufacturer = oldRevision?.manufacturer
      response.memory = oldRevision?.memory
      response.model = oldRevision?.model
      response.modelRevision = oldRevision?.revision
      response.processor = rpiInfo.processors[0]
      response.supportsPowerLed = oldRevision?.led ?? false
      response.supportsUsbPower = oldRevision?.usb ?? false
    }
    if (response.model?.startsWith('CM')) {
      // Compute module
      response.gpioMask = 0xFFFFFFFF // 0-31
    } else if (revision >= 16) {
      // Type 3
      response.gpioMask = 0x0FFFFFFC // 2-27
    } else if (revision >= 4) {
      // Type 2
      response.gpioMask = 0xFBC6CF9C // 2-4, 7-11, 14-15, 17-18, 22-25, 27-31
    } else {
      // Type 1
      response.gpioMask = 0x03E6CF93 // 0-1, 4, 7-11, 14-15, 17-18, 21-25
    }
    response.prettyName = [
      response.prettyName, response.model, response.modelRevision, '(' + response.memory + ')'
    ].join(' ')
    return response
  }

  /** Extract Raspberry Pi serial number and hardware revision info from the
    * contents of `/proc/cpuinfo` and parse the revision.
    * @param {string} cpuInfo - The contents of `/proc/cpuinfo`.
    * @return {object} - The extracted info.
    */
  static parseRpiCpuInfo (cpuInfo) {
    let a = /Serial\s*: ([0-9a-f]{16})/.exec(cpuInfo)
    if (a == null || a.length < 2) {
      return null
    }
    const id = a[1].toUpperCase()
    a = /Revision\s*: ([0-9a-f]{4,})/.exec(cpuInfo)
    if (a == null || a.length < 2) {
      return null
    }
    const revision = parseInt(a[1], 16) & 0x00FFFFFF
    return Object.assign({ id }, SystemInfo.parseRpiRevision(revision))
  }

  /** Creates a new instance of SystemInfo.
    * @param {object} params - Parameters.
    * @param {instance} [params.logger] - An instance of a logger class.
    * Typically this would be subclass of `Delegate` from `homebridge-lib`
    * or of `CommandLineTool`.
    */
  constructor (params = {}) {
    for (const f of ['warn', 'log', 'debug', 'vdebug', 'vvdebug']) {
      this[f] = params?.logger?.[f]?.bind(params?.logger) ?? (() => {})
    }
  }

  /** Initialise SystemInfo instance.
    */
  async init () {
    switch (process.platform) {
      case 'linux':
        if (await this.existsFile('/etc/synoinfo.conf')) {
          try {
            this.hwInfo = await this.getSynoInfo()
          } catch (error) { this.warn(error) }
          try {
            this.osInfo = await this.getDsmInfo()
          } catch (error) { this.warn(error) }
        } else {
          if (['arm', 'arm64'].includes(process.arch)) {
            try {
              this.hwInfo = await this.getRpiInfo()
            } catch (error) { this.warn(error) }
          }
          try {
            this.osInfo = await this.getPiOsInfo()
          } catch (error) { this.warn(error) }
        }
        break
      case 'darwin':
        try {
          this.hwInfo = await this.getMacInfo()
        } catch (error) { this.warn(error) }
        try {
          this.osInfo = await this.getMacOsInfo()
        } catch (error) { this.warn(error) }
        break
      default:
        break
    }
    if (this.osInfo == null) {
      this.osInfo = {
        name: process.platform,
        platform: process.platform,
        prettyName: process.platform
      }
    }
    if (this.hwInfo == null) {
      this.hwInfo = {
        nCores: cpus().length,
        prettyName: process.arch,
        processor: process.arch
      }
    }
    this.platform = this.osInfo.platform
  }

  /** Extract serial number and hardware revision info from `/proc/cpuinfo`.
    * @return {object} - The extracted info.
    */
  async getRpiInfo () {
    const cpuInfo = await this.readTextFile('/proc/cpuinfo')
    return SystemInfo.parseRpiCpuInfo(cpuInfo)
  }

  /** Extract OS info from /etc/os-release.
    * @return {object} - The extracted info.
    */
  async getPiOsInfo () {
    const bit = (await this.exec('getconf', 'LONG_BIT')).trim()
    const text = SystemInfo.parseText(await this.readTextFile('/etc/os-release'))
    const response = {
      name: text.NAME, // e.g. 'Raspbian GNU/Linux'
      platform: text.ID, // e.g. 'raspbian'
      prettyName: text.PRETTY_NAME + ' [' + bit + ' bit]', // e.g. 'Raspbian GNU/Linux 11 (bullseye)'
      version: text.VERSION_ID, // e.g. '11'
      versionName: text.VERSION_CODENAME // e.g. 'bullseye'
    }
    return response
  }

  /** Extract Apple Mac hardware info from `system_profiler` command.
    * @return {object} - The extracted info.
    */
  async getMacInfo () {
    let prettyName
    let text = SystemInfo.parseText(await this.exec('system_profiler', 'SPHardwareDataType'), ': ')
    const id = text['Serial Number (system)'] // e.g. 'LLXPXNHGTD'
    const memory = text.Memory // e.g. '16 GB'
    const model = text['Model Name'] // e.g. 'MacBook Pro'
    const nCores = text['Total Number of Cores'].split(' ')[0] // e.g. '10 (4 Super and 6 Efficiency)'
    const processor = text.Chip ?? text['Processor Name'] // e.g. 'Apple M5'
    const revision = text['Model Identifier'] // e.g. 'Mac17,2'
    try {
      if (process.arch === 'x64') { // Intel
        text = await this.exec(
          'plutil', '-p',
          process.env.HOME + '/Library/Preferences/com.apple.SystemProfiler.plist'
        )
        const regexp = RegExp(
          '"(' + id.slice(-4) + '|' + id.slice(-3) + ').*" => "(.*)"'
        )
        const a = regexp.exec(text)
        if (a != null) {
          prettyName = a[2]
        }
      } else { // Apple silicon
        text = await this.execShell('ioreg -l | grep product-description')
        const a = /"product-description" = <"([^"]*)">/.exec(text)
        if (a != null) {
          prettyName = a[1] // e.g. MacBook Pro (14-inch, M5)
        }
      }
    } catch (error) { this.warn(error) }
    return {
      id,
      isMac: true,
      manufacturer: 'Apple Inc.',
      memory,
      model,
      nCores,
      prettyName: prettyName || model,
      processor,
      revision
    }
  }

  /** Extract macOS info from `sw_vers` command.
    * @return {object} - The extracted info.
    */
  async getMacOsInfo () {
    const text = SystemInfo.parseText(await this.exec('sw_vers'), ':')
    const name = text.ProductName // e.g. 'macOS' or 'Mac OS X'
    const version = text.ProductVersion // e.g. '12.0.1' or '12.1'
    const build = text.BuildVersion // e.g. '21A559'
    let v = semver.major(version)
    if (v === 10) {
      v += '.' + semver.minor(version)
    }
    const versionName = macOsInfo.versionNames[v] // e.g. 'Monterey'
    return {
      build,
      catalina: semver.gte(version, '10.15.0'),
      name,
      platform: process.platform,
      prettyName: [name, versionName, version, '(' + build + ')'].join(' '),
      version,
      versionName
    }
  }

  /** Extract Synology info from `/etc/synoinfo.conf`
    * @return {object} - The extracted info.
    */
  async getSynoInfo () {
    const text = SystemInfo.parseText(await this.readTextFile('/etc/synoinfo.conf'))
    const device = text.upnpdevicetype
    const id = text.pushservice_dsserial
    const model = text.upnpmodelname
    return {
      id,
      manufacturer: 'Synology',
      model: [device, model].join(' '),
      prettyName: ['Synology', device, model].join(' ')
    }
  }

  /** Extract DSM info from `/etc/VERSION`.
    * @return {object} - The extracted info.
    */
  async getDsmInfo () {
    const text = SystemInfo.parseText(await this.readTextFile('/etc/VERSION'))
    const build = text.buildnumber // e.g. 42661
    const version = text.productversion // e.g. 7.1
    const update = text.smallfixnumber // e.g. 3
    let prettyName = 'DSM'
    if (version != null) {
      prettyName += ' ' + version
      if (build != null) {
        prettyName += '-' + build
      }
      if (update != null && update !== 0) {
        prettyName += ' Update ' + update
      }
    }
    return {
      build,
      prettyName,
      update,
      version
    }
  }

  /** Execute a command on the local machine.
    * @param {string} command - The command.
    * @param {...string} ...args - The command parameters.
    * @return {string} - The output of the command.
    */
  async exec (command, ...args) {
    return new Promise((resolve, reject) => {
      const cmd = command + ' ' + args.join(' ')
      this.debug('exec: %s', cmd)
      execFile(command, args, null, (error, stdout, stderr) => {
        if (error != null) {
          reject(error)
          return
        }
        this.vvdebug('exec: %s => %j', cmd, stdout)
        resolve(stdout)
      })
    })
  }

  /** Execute a shell command on the local machine.
    * @param {string} command - The command.
    * @return {string} - The output of the command.
    */
  async execShell (command) {
    return new Promise((resolve, reject) => {
      this.debug('exec: %s', command)
      exec(command, (error, stdout, stderr) => {
        if (error != null) {
          reject(error)
          return
        }
        this.vvdebug('exec: %s => %j', command, stdout)
        resolve(stdout)
      })
    })
  }

  /** Check if file exists.
    * @param {string} fileName - The file name.
    * @return {bool} - True iff file exists,
    */
  async existsFile (fileName) {
    try {
      await access(fileName)
      return true
    } catch (error) {}
    return false
  }

  /** Read a text file.
    * @param {string} fileName - The file name.
    * @return {string} - The contents of the file.
    */
  async readTextFile (fileName) {
    this.debug('read file: %s', fileName)
    const text = await readFile(fileName, 'utf8')
    this.vvdebug('read file: %s => %j', fileName, text)
    return text
  }
}

export { SystemInfo }
