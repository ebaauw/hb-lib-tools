// hb-lib-tools/src/UpnpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer, Logger } from 'hb-lib-tools'

import { createSocket } from 'node:dgram'
import { EventEmitter, once } from 'node:events'

import { timeout } from 'hb-lib-tools'
import { toInt } from 'hb-lib-tools/OptionParser'

const TIMEOUT = 5

// Convert raw UPnP message to message object.
function convert (rawMessage: string): Record<string, string> {
  const message: Record<string, string> = {}
  const lines: string[] = rawMessage.trim().split('\r\n')
  if (lines.length > 0) {
    [ message.status ] = lines
    for (const line of lines) {
      const fields = line.split(': ')
      if (fields.length === 2) {
        const [key, value] = fields
        message[key.toLocaleLowerCase()] = value
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
  deviceAlive: [ address: string, message: Record<string, string>]
  /** Emitted by {@link UpnpClient.search search()} for each device found, that passes the filters.
    * @event
    * @param address - The IP address of the device.
    * @param message - The parsed UPnP found message.
    */
  deviceFound: [ address: string, message: Record<string, string>]
}

/** Universal Plug and Play client. */
class UpnpClient extends EventEmitter<Events> {
  private readonly options
  private readonly socket: ReturnType<typeof createSocket>
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
    filter?: (message: Record<string, string>) => boolean,
    logger?: Logger,
    /** Timeout (in seconds) for {@link UpnpClient.search search()}
      * to listen for responses.
      * 
      * Default is 5 seconds.
      */
    timeout?: integer
  } = {}) {
    super()
    this.options = {
      deviceType: params.deviceType ?? 'upnp:rootdevice',
      filter: params.filter?.bind(this) ?? (() => true),
      logger: params.logger,
      hostname: '239.255.255.250',
      port: 1900,
      timeout: params.timeout == null
        ? TIMEOUT
        : toInt(params.timeout, { key: 'params.timeout', min: 1, max: 60 }) 
    }
    this.socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket
      .on('error', (error: Error) => {
        this.warn(error)
      })
      .on('listening', () => {
        const { address, port } = this.socket.address()
        this.host = `${address}:${port}`
        this.debug(
          'upnp: listening on %s for %s',
          this.host, this.options.deviceType
        )
      })
      .on('close', () => {
        this.debug('upnp: stop listening on %s', this.host)
        this.host = undefined
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

  private warn (format: unknown, ...args: unknown[]): void {
    this.options.logger?.warn(format, ...args)
  }

  private debug (format: unknown, ...args: unknown[]): void {
    this.options.logger?.debug(format, ...args)
  }

  private vdebug (format: unknown, ...args: unknown[]): void {
    this.options.logger?.vdebug(format, ...args)
  }

  private vvdebug (format: unknown, ...args: unknown[]): void {
    this.options.logger?.vvdebug(format, ...args)
  }

  /** Listen for UPnP alive broadcast messages.
    *
    * A {@link Events.deviceAlive deviceAlive} event will be emitted
    * on each alive message received, that passes the filters.
    */
  async listen (): Promise<void> {
    if (this.host != null) {
      return
    }
    this.socket.bind(this.options.port)
    await once(this.socket, 'listening')
  }

  /** Stop listening for UPnP alive broadcast messages. */
  async stopListen (): Promise<void> {
    this.socket.close()
    await once(this.socket, 'close')
  }

  /** Issue a UPnP search message and listen for responses.
    *
    * A {@link Events.deviceFound deviceFound} event will be emitted on each
    * response received, that passes the filters.
    * @return Promise that resolves to a map of the found devices.
    */
  async search (): Promise<Record<string, Record<string, string>>> {
    const result: Record<string, Record<string, string>> = {}
    const socket = createSocket({ type: 'udp4' })
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
        const { address, port } = socket.address()
        this.host = `${address}:${port}`
        this.debug(
          'upnp: listening on %s for %s',
          this.host, this.options.deviceType
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
    this.debug('upnp: stop listening on %s', this.host)
    return result
  }
}

export { UpnpClient }
