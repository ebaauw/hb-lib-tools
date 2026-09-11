// hb-lib-tools/src/SystemInfo.ts
//
// Library for Homebridge plugins.
// Copyright © 2019-2026 Erik Baauw. All rights reserved.

import type { Logger, jsonMap } from 'hb-lib-tools'

import { exec, execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { promisify } from 'node:util'

import type { integer } from 'hb-lib-tools'
import { toHexString } from 'hb-lib-tools'
import { semver } from 'hb-lib-tools/semver'

const execAsync = promisify(exec) // eslint-disable-line @typescript-eslint/strict-void-return -- no
const execFileAsync = promisify(execFile) // eslint-disable-line @typescript-eslint/strict-void-return -- no

export interface DefaultHwInfo {
  _kind: 'default',
  arch: string,
  cpu: string,
  nCores: integer,
  prettyName: string,
  processor: string,
  speed: number
}

export interface MacInfo {
  _kind: 'mac',
  id: string, // e.g. 'XXXXXXXXXX'
  memory: string, // e.g. '16 GB'
  model: string, // e.g. 'MacBook Pro'
  nCores: string, // e.g. '10 (4 Super and 6 Efficiency)'
  prettyName: string, // e.g. 'MacBook Pro (16 GB, Apple M5)'
  processor: string, // e.g. 'Apple M5'
  revision: string // e.g. 'Mac17,2'
}

export interface RpiInfo {
  _kind: 'rpi',
  gpioMask: number,
  id: string | null,
  // isRpi: boolean,
  manufacturer: string,
  memory: string,
  model: string,
  modelRevision: string,
  prettyName: string,
  processor: string,
  revision: string
  supportsFan: boolean,
  supportsPowerLed: boolean,
  supportsUsbPower: boolean
}

export interface SynoInfo {
  _kind: 'syno',
  model: string,
  cpu: string,
  nCores: number,
  memory: string,
  processor: string,
  prettyName: string
}

export type HwInfo = DefaultHwInfo | MacInfo | RpiInfo | SynoInfo

export interface DefaultOsInfo {
  _kind: 'default',
  name: string,
  platform: string,
  prettyName: string
}

export interface MacOsInfo {
  _kind: 'mac',
  name: string, // e.g. 'macOS'
  platform: string, // e.g. 'darwin'
  prettyName: string, // e.g. 'macOS 13.4 (Ventura)'
  version: string, // e.g. '13.4'
  versionName: string // e.g. 'Ventura'
}

export interface PiOsInfo {
  _kind: 'rpi',
  name: string, // e.g. 'Raspbian GNU/Linux'
  platform: string, // e.g. 'raspbian'
  prettyName: string, // e.g. 'Raspbian GNU/Linux 11 (bullseye)'
  version: string, // e.g. '11'
  versionName: string // e.g. 'bullseye'
}

export interface DsmInfo {
  _kind: 'syno',
  name: string,
  platform: string, // e.g. 'synology'
  prettyName: string, // e.g. 'DiskStation Manager 7.1.3-42661'
  version: string, // e.g. '7.1.3'
  versionName: string // e.g. '42661'
}

export type OsInfo = DefaultOsInfo | MacOsInfo | PiOsInfo | DsmInfo

/** Parse a text into key/value pairs.
  * @param text - The text.
  * @return The parsed text.
  */
function parseText (text: string, delimiter = '='): Record<string, string> {
  const response: Record<string, string> = {}
  const lines = text.split('\n')
  for (const line of lines) {
    const fields = line.split(delimiter)
    if (fields.length === 2) {
      response[fields[0].trim()] = fields[1].replace(/"/g, '').trim()
    }
  }
  return response
}

const macOsVersions: Record<string, string> = {
  // See: https://en.wikipedia.org/wiki/MacOS_version_history
  '10.0': 'Cheetah',
  '10.1': 'Puma',
  '10.2': 'Jaguar',
  '10.3': 'Panther',
  '10.4': 'Tiger',
  '10.5': 'Leopard',
  '10.6': 'Snow Leopard',
  '10.7': 'Lion',
  '10.8': 'Mountain Lion',
  '10.9': 'Mavericks',
  '10.10': 'Yosemite',
  '10.11': 'El Capitan',
  '10.12': 'Sierra',
  '10.13': 'High Sierra',
  '10.14': 'Mojave',
  '10.15': 'Catalina',
  '11': 'Big Sur',
  '12': 'Monterey',
  '13': 'Ventura',
  '14': 'Sonoma',
  '15': 'Sequoia',
  // '26': 'Tahoe'
  '27': 'Golden Gate'
}

const rpiManufacturers: Record<number, string> = {
  0: 'Sony UK',
  1: 'Egoman',
  2: 'Embest',
  3: 'Sony Japan',
  4: 'Embest',
  5: 'Stadium'
}

const rpiMemorySizes: Record<number, string> = {
  0: '256MB',
  1: '512MB',
  2: '1GB',
  3: '2GB',
  4: '4GB',
  5: '8GB',
  6: '16GB',
  7: '3GB' // Other?
}

const rpiModels: Record<number, { name: string, led?: boolean, usb?: boolean, fan?: boolean }> = {
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
}

const rpiProcessors: Record<number, string> = {
  0: 'BCM2835',
  1: 'BCM2836',
  2: 'BCM2837',
  3: 'BCM2711',
  4: 'BCM2712'
}

const rpiOldRevisions: Record<number, { model: string, revision: string, memory: string, manufacturer: string, led?: boolean, usb?: boolean }> = {
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

/** Parse Raspberry Pi hardware revision.
  * @param revision - The Raspberry Pi hardware revision.
  * @return The parsed revision information.
  */
export function parseRpiRevision (revision: integer): RpiInfo {
  /* eslint-disable @typescript-eslint/no-magic-numbers -- decode RPi revision */

  function gpioMask(model: string, revision: integer): integer {
    if (model.startsWith('CM')) {
      return 0xFFFFFFFF // Compute module: 0-31
    }
    if (revision >= 16) {
      return 0x0FFFFFFC // Type 3: 2-27
    }
    if (revision >= 4) {
      return 0xFBC6CF9C // Type 2: 2-4, 7-11, 14-15, 17-18, 22-25, 27-31
    }
    return 0x03E6CF93 // Type 1: 0-1, 4, 7-11, 14-15, 17-18, 21-25
  }

  const rev = revision & 0x00FFFFFF
  if ((rev & 0x00800000) === 0) {
    const r = rpiOldRevisions[rev] ?? { model: '(unknown)', revision: '(unknown)', memory: '(unknown)', manufacturer: '(unknown)', led: false, usb: false }
    return {
      _kind: 'rpi',
      gpioMask: gpioMask(r.model, rev),
      id: null,
      manufacturer: r.manufacturer,
      memory: r.memory,
      model: r.model,
      modelRevision: r.revision,
      prettyName: `Raspberry Pi ${r.model} ${r.revision} '(${r.memory})'`,
      processor: rpiProcessors[0],
      revision: toHexString(rev, { length: 6 }),
      supportsPowerLed: r.led ?? false,
      supportsUsbPower: r.usb ?? false,
      supportsFan: false
    }
  }
  const manufacturerId = (rev & 0x000F0000) >> 16
  const modelId = (rev & 0x00000FF0) >> 4
  const memoryId = (rev & 0x00700000) >> 20
  const processorId = (rev & 0x0000F000) >> 12
  const model = rpiModels[modelId] ?? { name: `model ${modelId}`, led: false, usb: false, fan: false }
  const response: RpiInfo = {
    _kind: 'rpi',
    gpioMask: gpioMask(model.name, rev),
    id: null,
    manufacturer: rpiManufacturers[manufacturerId] ?? `(unknown ${manufacturerId})`,
    memory: rpiMemorySizes[memoryId] ?? `(unknown ${memoryId})`,
    model: model.name,
    modelRevision: `1.${((rev & 0x0000000F) >> 0).toString()}`,
    prettyName: '',
    processor: rpiProcessors[processorId] ?? `(unknown ${processorId})`,
    revision: toHexString(rev, { length: 6 }),
    supportsFan: model.fan ?? false,
    supportsPowerLed: model.led ?? false,
    supportsUsbPower: model.usb ?? false
  }
  response.prettyName = `Raspberry Pi ${response.model} ${response.modelRevision} (${response.memory})`
  return response
  /* eslint-enable @typescript-eslint/no-magic-numbers */
}

/** Extract Raspberry Pi serial number and hardware revision info from the
  * contents of `/proc/cpuinfo` and parse the revision.
  * @param cpuInfo - The contents of `/proc/cpuinfo`.
  * @return The extracted info.
  */
export function parseRpiCpuInfo (cpuInfo: string): RpiInfo {
  let a = /Revision\s*: (?<rev>[0-9a-f]{4,})/.exec(cpuInfo)
  if (a?.groups == null) {
    throw new Error('/proc/cpuinfo: Revision: not found')
  }
  const revision = parseInt(a.groups.rev, 16)
  const rpiInfo = parseRpiRevision(revision)

  a = /Serial\s*: (?<id>[0-9a-f]{16})/.exec(cpuInfo)
  if (a?.groups == null) {
    throw new Error('/proc/cpuinfo: Serial: not found')
  }
  rpiInfo.id = a.groups.id.toUpperCase()
  return rpiInfo
}

/** System information. */
class SystemInfo {
  options: {
    logger?: Logger
  }
  hwInfo: HwInfo
  osInfo: OsInfo

  /** Creates a new instance of SystemInfo.
    * @param params - Parameters.
    * @param params.logger - An instance of a logger class.
    * Typically this would be subclass of `Delegate` from `homebridge-lib`
    * or of `CommandLineTool`.
    */
  constructor (params: { logger?: Logger }) {
    this.options = {
      logger: params.logger
    }
    this.osInfo = {
      _kind: 'default',
      name: process.platform,
      platform: process.platform,
      prettyName: process.platform
    }
    this.hwInfo = {
      _kind: 'default',
      arch: process.arch,
      cpu: cpus()[0].model,
      nCores: cpus().length,
      prettyName: process.arch,
      processor: process.arch,
      speed: cpus()[0].speed
    }
  }

  private warn (format: unknown, ...args: unknown[]): void {
    this.options.logger?.warn(format, ...args)
  }

  private debug (format: unknown, ...args: unknown[]): void {
    this.options.logger?.debug(format, ...args)
  }

  // private vdebug (format: unknown, ...args: unknown[]): void {
  //   this.options.logger?.vdebug(format, ...args)
  // }

  private vvdebug (format: unknown, ...args: unknown[]): void {
    this.options.logger?.vvdebug(format, ...args)
  }

  /** Initialise SystemInfo instance.
    */
  async init (): Promise<void> {
    switch (process.platform) {
      case 'linux':
        if (await this.existsFile('/etc/synoinfo.conf')) {
          try {
            this.hwInfo = { ...this.hwInfo, ...await this.getSynoInfo() }
          } catch (error) { this.warn(error) }
          try {
            this.osInfo = { ...this.osInfo, ...await this.getDsmInfo() }
          } catch (error) { this.warn(error) }
        } else {
          if (['arm', 'arm64'].includes(process.arch)) {
            try {
              this.hwInfo = { ...this.hwInfo, ...await this.getRpiInfo() }
            } catch (error) { this.warn(error) }
          }
          try {
            this.osInfo = { ...this.osInfo, ...await this.getPiOsInfo() }
          } catch (error) { this.warn(error) }
        }
        break
      case 'darwin':
        try {
          this.hwInfo = { ...this.hwInfo, ...await this.getMacInfo() }
        } catch (error) { this.warn(error) }
        try {
          this.osInfo = { ...this.osInfo, ...await this.getMacOsInfo() }
        } catch (error) { this.warn(error) }
        break
      default:
        break
    }
  }

  /** Extract serial number and hardware revision info from `/proc/cpuinfo`.
    * @return The extracted info.
    */
  async getRpiInfo (): Promise<RpiInfo> {
    const cpuInfo = await this.readTextFile('/proc/cpuinfo')
    return parseRpiCpuInfo(cpuInfo)
  }

  /** Extract OS info from /etc/os-release.
    * @return The extracted info.
    */
  async getPiOsInfo (): Promise<PiOsInfo> {
    const bit = (await this.exec('getconf', 'LONG_BIT')).trim()
    const text = parseText(await this.readTextFile('/etc/os-release'))
    for (const key of ['NAME', 'ID', 'PRETTY_NAMEx', 'VERSION_ID', 'VERSION_CODENAME']) {
      if (!(key in text)) {
        throw new Error(`/etc/os-release: ${key}: not found`)
      }
    }
    return {
      _kind: 'rpi',
      name: text.NAME, // e.g. 'Raspbian GNU/Linux'
      platform: text.ID, // e.g. 'raspbian'
      prettyName: `${text.PRETTY_NAME} [${bit} bit]`, // e.g. 'Raspbian GNU/Linux 11 (bullseye)'
      version: text.VERSION_ID, // e.g. '11'
      versionName: text.VERSION_CODENAME // e.g. 'bullseye'
    }
  }

  /** Extract Apple Mac hardware info from `system_profiler` command.
    * @return The extracted info.
    */
  async getMacInfo (): Promise<jsonMap> {
    const text = parseText(await this.exec('system_profiler', 'SPHardwareDataType'), ': ')
    for (const key of ['Serial Number (system)', 'Model Name', 'Memory', 'Total Number of Cores', 'Model Identifier']) {
      if (!(key in text)) {
        throw new Error(`/etc/synoinfo.conf: ${key}: not found`)
      }
    }
    /* eslint-disable @typescript-eslint/prefer-destructuring -- sic */
    let processor = this.hwInfo.processor
    if ('Chip' in text) {
      processor = text.Chip
    } else if ('Processor Name' in text) {
      processor = text['Processor Name']
    }
    /* eslint-enable @typescript-eslint/prefer-destructuring */
    const { 'Serial Number (system)': id } = text
    let { 'Model Name': prettyName } = text
    try {
      if (process.arch === 'x64') { // Intel
        const text = await this.exec(
          'plutil', '-p',
          `${process.env.HOME}/Library/Preferences/com.apple.SystemProfiler.plist`
        )
        const regexp = RegExp(
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers -- no
          `"(?:${id.slice(-4)}|${id.slice(-3)}).*" => "(?<name>.*)"`
        )
        const a = regexp.exec(text)
        if (a?.groups != null) {
          // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- no
          prettyName = a.groups.name
        }
      } else { // Apple silicon
        const text = await this.execShell('ioreg -l | grep product-description')
        const a = /"product-description" = <"(?<descr>[^"]*)">/.exec(text)
        if (a?.groups != null) {
          // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- no
          prettyName = a.groups.descr
        }
      }
    } catch (error) { this.warn(error) }
    return {
      _kind: 'mac',
      id,
      isMac: true,
      manufacturer: 'Apple Inc.',
      memory: text.Memory,
      model: text['Model Name'],
      nCores: text['Total Number of Cores'].split(' ')[0],
      prettyName,
      processor,
      revision: text['Model Identifier']
    }
  }

  /** Extract macOS info from `sw_vers` command.
    * @return The extracted info.
    */
  async getMacOsInfo (): Promise<jsonMap> {
    const text = parseText(await this.exec('sw_vers'), ':')
    let { ProductVersion: version } = text
    const ver = semver.coerce(version)
    version = ver?.version ?? version // e.g. '12.0.1' or '12.1'
    let v = String(semver.major(version))
    if (v === '10') {
      v += `.${semver.minor(version)}`
    }
    const versionName = macOsVersions[v] ?? `(unknown ${v})`// e.g. 'Monterey'
    return {
      _kind: 'mac',
      build: text.BuildVersion,
      catalina: semver.gte(version, '10.15.0'),
      name: text.ProductName,
      platform: process.platform,
      prettyName: `${text.ProductName} ${versionName} ${version} (${text.BuildVersion})`,
      version,
      versionName
    }
  }

  /** Extract Synology info from `/etc/synoinfo.conf`
    * @return The extracted info.
    */
  async getSynoInfo (): Promise<jsonMap> {
    const text = parseText(await this.readTextFile('/etc/synoinfo.conf'))
    for (const key of ['upnpdevicetype', 'pushservice_dsserial', 'upnpmodelname']) {
      if (!(key in text)) {
        throw new Error(`/etc/synoinfo.conf: ${key}: not found`)
      }
    }
    const { upnpdevicetype: device, pushservice_dsserial: id, upnpmodelname: model } = text
    return {
      id,
      manufacturer: 'Synology',
      model: `${device} ${model}`,
      prettyName: `Synology ${device} ${model}`
    }
  }

  /** Extract DSM info from `/etc/VERSION`.
    * @return The extracted info.
    */
  async getDsmInfo (): Promise<jsonMap> {
    const text = parseText(await this.readTextFile('/etc/VERSION'))
    for (const key of ['buildnumber', 'productversion', 'smallfixnumber']) {
      if (!(key in text)) {
        throw new Error(`/etc/VERSION: ${key}: not found`)
      }
    }
    const { buildnumber: build, productversion: version, smallfixnumber: update } = text
    const prettyName = `DSM ${version}-${build} Update ${update}`
    return {
      build,
      prettyName,
      update,
      version
    }
  }

  /** Execute a command on the local machine.
    * @param command - The command.
    * @param args - The command parameters.
    * @return The output of the command.
    */
  async exec (command: string, ...args: string[]): Promise<string> {
    const cmd = `${command} ${args.join(' ')}`
    this.debug('exec: %s', cmd)
    const { stdout } = await execFileAsync(command, args)
    this.vvdebug('exec: %s => %j', cmd, stdout)
    return stdout
  }

  /** Execute a shell command on the local machine.
    * @param command - The command.
    * @return The output of the command.
    */
  async execShell (command: string): Promise<string> {
    this.debug('exec: %s', command)
    const { stdout } = await execAsync(command)
    this.vvdebug('exec: %s => %j', command, stdout)
    return stdout
  }

  /** Check if file exists.
    * @param fileName - The file name.
    * @return True iff file exists,
    */
  async existsFile (fileName: string): Promise<boolean> {
    try {
      this.debug('check file: %s', fileName)
      await access(fileName)
      this.debug('check file: %s => true', fileName)
      return true
    } catch (error) {}  
    this.debug('check file: %s => false', fileName)
    return false
  }

  /** Read a text file.
    * @param fileName - The file name.
    * @return The contents of the file.
    */
  async readTextFile (fileName: string): Promise<string> {
    this.debug('read file: %s', fileName)
    const text = await readFile(fileName, 'utf8')
    this.vvdebug('read file: %s => %j', fileName, text)
    return text
  }
}

export { SystemInfo }
