// hb-lib-tools/lib/UpnpClient.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { createSocket } from 'node:dgram'
import { EventEmitter, once } from 'node:events'

import { OptionParser } from 'hb-lib-tools/OptionParser'

const listener = {}

// Convert raw UPnP message to message object.
function convert (rawMessage) {
  const message = {}
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
  /** Create a new instance of a Universal Plug and Play client.
    * @param {object} params - Paramters.
    * @param {string} [params.class='upnp:rootdevice'] - Filter on class which UPnP
    * messages should result in a
    * {@link UpnpClient#event:deviceAlive deviceAlive} or a
    * {@link UpnpClient#event:deviceFound deviceFound} event.
    * @param {function} [params.filter=() => { return true }] - Function to
    * filter which UPnP messages should result in a
    * {@link UpnpClient#event:deviceAlive deviceAlive} or a
    * {@link UpnpClient#event:deviceFound deviceFound} event.
    * @param {instance} [params.logger] - Logger instance to log to.
    * @param {integer} [params.timemout=5] - Timeout (in seconds) for
    * {@link UpnpClient@search search()} to listen for responses.
    */
  constructor (params = {}) {
    super()
    this._options = {
      filter: () => { return true },
      hostname: '239.255.255.250',
      port: 1900,
      timeout: 5,
      class: 'upnp:rootdevice'
    }
    const optionParser = new OptionParser(this._options)
    optionParser
      .functionKey('filter')
      // .hostKey() // TODO: need global listener per hostname.
      .stringKey('class', true)
      .instanceKey('logger')
      .intKey('timeout', 1, 60)
      .parse(params)
    for (const f of ['warn', 'log', 'debug', 'vdebug', 'vvdebug']) {
      this[f] = params?.logger?.[f]?.bind(params?.logger) ?? (() => {})
    }
    this.requestId = 0
  }

  _onError (error) {
    listener.socket = null
    // /** Emitted in case of error.
    //   * @event UpnpClient#error
    //   * @param {Error} error - The error.
    //   */
    // this.emit('error', error)
    this.warn(error)
  }

  _onListening () {
    if (listener.init === this) {
      listener.host = listener.socket.address().address +
        ':' + listener.socket.address().port
      listener.socket.addMembership(this._options.hostname)
      delete listener.init
    }
    // /** Emitted when listening to UPnP alive broadcasts.
    //   * @event UpnpClient#listening
    //   * @param {string} host - IP address and port listening on.
    //   */
    // this.emit('listening', listener.host)
    this.debug('listening on %s', listener.host)
  }

  _onMessage (buffer, rinfo) {
    const rawMessage = buffer.toString().trim()
    const message = convert(rawMessage)
    if (
      message.status !== 'NOTIFY * HTTP/1.1' ||
      message.nts !== 'ssdp:alive'
    ) {
      return
    }
    if (
      this._options.class !== 'ssdp:all' &&
      message.nt !== this._options.class
    ) {
      return
    }
    if (this._options.filter(message)) {
      /** Emitted for each alive message received, that passes the filers.
        * @event UpnpClient#deviceAlive
        * @param {string} address - IP address of the device.
        * @param {object} message - The parsed message.
        * @param {string} rawMessage - The raw message.
        */
      this.emit('deviceAlive', rinfo.address, message, rawMessage)
    }
  }

  /** Listen for UPnP alive broadcast messages.
    */
  async listen () {
    if (listener.socket == null) {
      listener.socket = createSocket({ type: 'udp4', reuseAddr: true })
      listener.init = this
      listener.socket.bind(this._options.port)
    } else if (listener.init != null) {
      const [host] = await once(listener.init, 'listening')
      console.log('>>> HERE <<<')
      this.emit('listening', host)
      this.debug('listening on %s', host)
    } else {
      this.debug('listening on %s', listener.host)
    }

    listener.socket
      .on('error', this._onError.bind(this))
      .on('listening', this._onListening.bind(this))
      .on('message', this._onMessage.bind(this))
  }

  /** Stop listening for UPnP alive broadcast messages.
    */
  async stopListen () {
    if (listener.socket != null) {
      listener.socket
        .removeListener('error', this._onError.bind(this))
        .removeListener('listening', this._onListening.bind(this))
        .removeListener('message', this._onMessage.bind(this))
      this.debug('stopped listening on %s', listener.host)
    }
  }

  /** Issue a UPnP search message and listen for responses.
    */
  async search () {
    const socket = createSocket({ type: 'udp4' })
    const host = this._options.hostname + ':' + this._options.port
    const request = Buffer.from([
      'M-SEARCH * HTTP/1.1',
      `HOST: ${host}`,
      'MAN: "ssdp:discover"',
      `MX: ${this._options.timeout}`,
      `ST: ${this._options.class}`,
      ''
    ].join('\r\n'))

    socket
      .on('error', (error) => {
        this.warn(error)
      })
      .on('listening', () => {
        const host = socket.address().address + ':' + socket.address().port
        this.debug('listening on %s', host)
      })
      .on('message', (buffer, rinfo) => {
        const rawMessage = buffer.toString().trim()
        const message = convert(rawMessage)
        if (message.status !== 'HTTP/1.1 200 OK') {
          return
        }
        if (
          this._options.class !== 'ssdp:all' &&
          message.st !== this._options.class
        ) {
          return
        }
        if (this._options.filter(message)) {
          this.debug('found %s at %s', message.st, rinfo.address)
          /** Emitted for each response received, that passes the filers.
            * @event UpnpClient#deviceFound
            * @param {string} address - IP address of the device.
            * @param {object} message - The parsed message.
            * @param {string} rawMessage - The raw message.
            */
          this.emit('deviceFound', rinfo.address, message, rawMessage)
        }
      })

    this.debug('%s: request %d: search', host, ++this.requestId)
    socket.send(
      request, 0, request.length, this._options.port, this._options.hostname
    )
    setTimeout(() => {
      const host = socket.address().address + ':' + socket.address().port
      this.debug('stop listening on %s', host)
      socket.close()
    }, this._options.timeout * 1000)
    await once(socket, 'close')
    this.debug('%s: request %d: search done', host, this.requestId)
  }
}

export { UpnpClient }
