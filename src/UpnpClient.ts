// hb-lib-tools/src/UpnpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer, stringMap } from 'hb-lib-tools'

import { createSocket } from 'node:dgram'
import { EventEmitter, once } from 'node:events'

import { Logger, timeout } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

// Convert raw UPnP message to message object.
function convert (rawMessage: string): stringMap {
  const message = {} as stringMap
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

/** {@link UpnpClient} events. */
export interface Events {
  /** Emitted by {@link UpnpClient.listen listen()} each alive message received, that passes the filers.
    * @event
    * @param address - The IP address of the device.
    * @param message - The parsed UPnP alive message.
    */
  deviceAlive: [ address: string, message: stringMap]
  /** Emitted by {@link UpnpClient.search search()} for each device found, that passes the filters.
    * @event
    * @param address - The IP address of the device.
    * @param message - The parsed UPnP found message.
    */
  deviceFound: [ address: string, message: stringMap]
}

/** Universal Plug and Play client. */
class UpnpClient extends EventEmitter<Events> {
  private warn: (format: string | Error, ...args: unknown[]) => void
  private debug: (format: string | Error, ...args: unknown[]) => void
  private vdebug: (format: string | Error, ...args: unknown[]) => void
  private vvdebug: (format: string | Error, ...args: unknown[]) => void
  private options
  private socket?: ReturnType<typeof createSocket>
  private host?: string

  /** Create a new instance of a Universal Plug and Play client. */
  constructor (params : {
    /** Filter on UPnP device type.
      * Default is `upnp:rootdevice` to listen for all root devices.
      */
    deviceType?: string,
    /** Function to filter UPnP messages.
      * Default is to accept all messages.
     */
    filter?: (message: stringMap) => boolean,
    logger?: Logger,
    /** Timeout (in seconds) for {@link UpnpClient.search search()}
      * to listen for responses.
      * */
    timeout?: integer
  } = {}) {
    super()
    this.warn = params.logger?.warn.bind(params.logger) ?? (() => {})
    this.debug = params.logger?.debug.bind(params.logger) ?? (() => {})
    this.vdebug = params.logger?.vdebug.bind(params.logger) ?? (() => {})
    this.vvdebug = params.logger?.vvdebug.bind(params.logger) ?? (() => {})
    this.options = {
      deviceType: params.deviceType ?? 'upnp:rootdevice',
      filter: params.filter ?? (() => { return true }) as (message: stringMap) => boolean,
      hostname: '239.255.255.250',
      port: 1900,
      timeout: params.timeout == null ? 5 : OptionParser.toInt('params.timeout', params.timeout, { min: 1, max: 60 })
    }
  }

  /** Listen for UPnP alive broadcast messages.
    *
    * A {@link Events.deviceAlive deviceAlive} event will be emitted
    * on each alive message received, that passes the filters.
    */
  listen (): void {
    if (this.socket != null) {
      this.socket.close()
    }
    this.socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket.bind(this.options.port)
    this.socket
      .on('error', (error: Error) => {
        this.warn(error)
      })
      .on('listening', () => {
        this.host = this.socket!.address().address +
          ':' + this.socket!.address().port
        this.debug(
          'upnp: listening on %s for %s',
          this.host, this.options.deviceType
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
          this.options.deviceType !== 'ssdp:all' &&
          message.nt !== this.options.deviceType
        ) {
          return
        }
        if (this.options.filter(message)) {
          this.vvdebug('upnp: %s alive at %s: %j', message.nt, message.location, message)
          this.vdebug('upnp: %s alive at %s', message.nt, message.location)
          this.emit('deviceAlive', rinfo.address, message)
        }
      })
  }

  /** Stop listening for UPnP alive broadcast messages. */
  stopListen (): void {
    this.socket?.close()
  }

  /** Issue a UPnP search message and listen for responses.
    *
    * A {@link Events.deviceFound deviceFound} event will be emitted on each
    * response received, that passes the filters.
    * @returns Promise that resolves to a map of the found devices.
    */
  async search (): Promise<{ [key: string]: stringMap }> {
    const result = {} as { [key: string]: stringMap }
    const socket = createSocket({ type: 'udp4' })
    let host
    const request = Buffer.from([
      'M-SEARCH * HTTP/1.1',
      `HOST: ${this.options.hostname}:${this.options.port}`,
      'MAN: "ssdp:discover"',
      `MX: ${this.options.timeout}`,
      `ST: ${this.options.deviceType}`,
      ''
    ].join('\r\n'))

    socket
      .on('error', (error) => { this.warn(error) })
      .on('listening', () => {
        host = socket.address().address + ':' + socket.address().port
        this.debug(
          'upnp: listening on %s for %s',
          host, this.options.deviceType
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
          this.options.deviceType !== 'ssdp:all' &&
          message.st !== this.options.deviceType
        ) {
          return
        }
        if (!this.options.filter(message)) {
          return
        }
        this.vvdebug('upnp: found %s at %s: %j', message.st, message.location, message)
        this.vdebug('upnp: found %s at %s', message.st, message.location)
        this.emit('deviceFound', rinfo.address, message)
        result[message.location] = message
      })
    this.debug(
      'upnp: searching %ds for %s',
      this.options.timeout, this.options.deviceType
    )
    socket.send(
      request, 0, request.length, this.options.port, this.options.hostname
    )
    await timeout(this.options.timeout * 1000)
    this.debug('upnp: search done')
    socket.close()
    await once(socket, 'close')
    this.debug('upnp: stop listening on %s', host)
    return result
  }
}

export { UpnpClient }
