// hb-lib-tools/src/UpnpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer } from 'hb-lib-tools'

import { createSocket } from 'node:dgram'
import { EventEmitter, once } from 'node:events'

import { Logger, timeout } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

// Convert raw UPnP message to message object.
function convert (rawMessage: string): Record<string, string> {
  const message = {} as Record<string, string>
  const lines = rawMessage.toString().trim().split('\r\n')
  if (lines && lines[0]) {
    message.status = lines[0]
    for (const line of lines) {
      const fields = line.split(': ')
      if (fields.length === 2) {
        message[fields[0].toLowerCase()] = fields[1]
      }
    }
  }
  return message
}

/** Universal Plug and Play client.
  * <br>See {@link UpnpClient}.
  * @name UpnpClient
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** Universal Plug and Play client.
  * @extends EventEmitter
  */
class UpnpClient extends EventEmitter {
  warn: (format: string | Error, ...args: unknown[]) => void
  debug: (format: string | Error, ...args: unknown[]) => void
  vdebug: (format: string | Error, ...args: unknown[]) => void
  vvdebug: (format: string | Error, ...args: unknown[]) => void
  private _options
  private socket?: ReturnType<typeof createSocket>
  private host?: string

  /** Create a new instance of a Universal Plug and Play client.
    * @param {object} params - Paramters.
    * @param {string} [params.deviceType='upnp:rootdevice'] - Filter on UPnP device type.
    * @param {function} [params.filter=() => { return true }] - Function to
    * filter UPnP messages.
    * @param {instance} [params.logger] - Logger instance to log to.
    * @param {integer} [params.timemout=5] - Timeout (in seconds) for
    * {@link UpnpClient@search search()} to listen for responses.
    */
  constructor (params : {
    deviceType?: string,
    filter?: (message: Record<string, string>) => boolean,
    logger?: Logger,
    timeout?: integer
  } = {}) {
    super()
    this.warn = params.logger?.warn.bind(params.logger) ?? (() => {})
    this.debug = params.logger?.debug.bind(params.logger) ?? (() => {})
    this.vdebug = params.logger?.vdebug.bind(params.logger) ?? (() => {})
    this.vvdebug = params.logger?.vvdebug.bind(params.logger) ?? (() => {})
    this._options = {
      deviceType: params.deviceType ?? 'upnp:rootdevice',
      filter: params.filter ?? (() => { return true }) as (message: Record<string, string>) => boolean,
      hostname: '239.255.255.250',
      port: 1900,
      timeout: params.timeout == null ? 5 : OptionParser.toInt('params.timeout', params.timeout, { min: 1, max: 60 })
    }
  }

  /** Listen for UPnP alive broadcast messages.
    *
    * A {@link UpnpClient#event:deviceAlive deviceAlive} event will be emitted
    * on each alive messagae received, that passes the filers.
    */
  listen (): void {
    if (this.socket != null) {
      this.socket.close()
    }
    this.socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket.bind(this._options.port)
    this.socket
      .on('error', (error: Error) => {
        this.warn(error)
      })
      .on('listening', () => {
        this.host = this.socket!.address().address +
          ':' + this.socket!.address().port
        this.debug(
          'upnp: listening on %s for %s',
          this.host, this._options.deviceType
        )
      })
      .on('close', async () => {
        this.debug('upnp: stop listening on %s', this.host)
        this.host = undefined
        this.socket?.removeAllListeners()
        this.socket = undefined
      })
      .on('message', (buffer, rinfo) => {
        const rawMessage = buffer.toString().trim()
        const message = convert(rawMessage)
        // this.vvdebug('upnp: %s alive at %s: %j', message.nt, message.location, rawMessage)
        if (
          message.status !== 'NOTIFY * HTTP/1.1' ||
          message.nts !== 'ssdp:alive'
        ) {
          return
        }
        if (
          this._options.deviceType !== 'ssdp:all' &&
          message.nt !== this._options.deviceType
        ) {
          return
        }
        if (this._options.filter(message)) {
          this.vvdebug('upnp: %s alive at %s: %j', message.nt, message.location, message)
          this.vdebug('upnp: %s alive at %s', message.nt, message.location)
          /** Emitted for each alive message received, that passes the filers.
            * @event UpnpClient#deviceAlive
            * @param {string} address - IP address of the device.
            * @param {object} message - The parsed message.
            */
          this.emit('deviceAlive', rinfo.address, message)
        }
      })
  }

  /** Stop listening for UPnP alive broadcast messages.
    */
  stopListen (): void {
    this.socket?.close()
  }

  /** Issue a UPnP search message and listen for responses.
    *
    * A {@link UpnpClient#deviceFound deviceFound} event will be emitted on each
    * response received, that passes the filters.
    * @returns {Promise} Promise that resolves to an object with the found devices.
    */
  async search (): Promise<Record<string, Record<string, string>>> {
    const result = {} as Record<string, Record<string, string>>
    const socket = createSocket({ type: 'udp4' })
    let host
    const request = Buffer.from([
      'M-SEARCH * HTTP/1.1',
      `HOST: ${this._options.hostname}:${this._options.port}`,
      'MAN: "ssdp:discover"',
      `MX: ${this._options.timeout}`,
      `ST: ${this._options.deviceType}`,
      ''
    ].join('\r\n'))

    socket
      .on('error', (error) => { this.warn(error) })
      .on('listening', () => {
        host = socket.address().address + ':' + socket.address().port
        this.debug(
          'upnp: listening on %s for %s',
          host, this._options.deviceType
        )
      })
      .on('message', (buffer, rinfo) => {
        const rawMessage = buffer.toString().trim()
        const message = convert(rawMessage)
        this.vvdebug('upnp: found %s at %s: %j', message.st, message.location, rawMessage)
        if (message.status !== 'HTTP/1.1 200 OK') {
          return
        }
        if (
          this._options.deviceType !== 'ssdp:all' &&
          message.st !== this._options.deviceType
        ) {
          return
        }
        if (!this._options.filter(message)) {
          return
        }
        this.vvdebug('upnp: found %s at %s: %j', message.st, message.location, message)
        this.vdebug('upnp: found %s at %s', message.st, message.location)
        /** Emitted for each response received, that passes the filters.
          * @event UpnpClient#deviceFound
          * @param {string} address - IP address of the device.
          * @param {object} message - The parsed message.
          */
        this.emit('deviceFound', rinfo.address, message)
        result[message.location] = message
      })
    this.debug(
      'upnp: searching %ds for %s',
      this._options.timeout, this._options.deviceType
    )
    socket.send(
      request, 0, request.length, this._options.port, this._options.hostname
    )
    await timeout(this._options.timeout * 1000)
    this.debug('upnp: search done')
    socket.close()
    await once(socket, 'close')
    this.debug('upnp: stop listening on %s', host)
    return result
  }
}

export { UpnpClient }
