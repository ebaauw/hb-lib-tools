// hb-lib-tools/src/MdnsClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer, jsonObject } from 'hb-lib-tools'

import { EventEmitter } from 'node:events'

import Bonjour from 'bonjour-service'

import { Logger, timeout } from 'hb-lib-tools'
import { OptionParser } from 'hb-lib-tools/OptionParser'

/** Multicast DNS (Bonjour) client.
  * <br>See {@link MdnsClient}.
  * @name MdnsClient
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** Multicast DNS (Bonjour) client.
  * @extends EventEmitter
  */
class MdnsClient extends EventEmitter {
  debug: (format: string | Error, ...args: unknown[]) => void
  vdebug: (format: string | Error, ...args: unknown[]) => void
  vvdebug: (format: string | Error, ...args: unknown[]) => void

  private _options
  private bonjour?: Bonjour.Bonjour
  private browser?: Bonjour.Browser

  /** Create a new instance of an mDNS client.
    * @param {object} params - Paramters.
    * @param {function} [params.filter=() => { return true }] - Function to
    * filter mDNS messages.
    * @param {instance} params.logger - Logger instance to log to.
    * @param {string} [params.serviceType='http'] - Filter on mDNS service type.
    * @param {integer} [params.timemout=5] - Timeout (in seconds) for
    * {@link MdnsClient@search search()} to listen for responses.
    */
  constructor (params: {
    filter?: (message: jsonObject) => boolean,
    logger: Logger,
    serviceType?: string, 
    timeout?: integer
  }) {
    super()
    this.debug = params.logger.debug.bind(params.logger)
    this.vdebug = params.logger.vdebug.bind(params.logger)
    this.vvdebug = params.logger.vvdebug.bind(params.logger)
    this._options = {
      filter: params.filter ?? (() => { return true }) as (message: jsonObject) => boolean,
      host: '224.0.0.251:5353',
      timeout: params.timeout === null ? 5 : OptionParser.toInt('params.timeout', params.timeout, { min: 1, max: 60 }),
      serviceType: params.serviceType ?? 'hap'
    }
  }

  /** Listen for mDNS up announcements.
    *
    * A {@link MdnsClient#event:serviceUp serviceUp} event will be emitted on each
    * service up announcement received, that passes the filters.
    */
  listen (): void {
    if (this.browser != null) {
      this.stopListen()
    }
    this.debug(
      'mdns: listening on %s for %s',
      this._options.host, this._options.serviceType ?? 'all'
    )
    this.bonjour = new Bonjour()
    this.browser = this.bonjour.find({ type: this._options.serviceType })
    this.browser.on('up', (message) => {
      // this.vvvdebug('mdns: found %j: %j', message.fqdn, message)
      if (!this._options.filter(message as unknown as jsonObject)) {
        return
      }
      this.vvdebug('mdns: found %j: %j', message.fqdn, message)
      this.vdebug('mdns: found %j at %s:%d', message.fqdn, message.referer!.address, message.port)
      /** Emitted for each response received, that passes the filters.
        * @event MdnsClient#serviceUp
        * @param {string} address - IP address of the device.
        * @param {object} message - The parsed message.
        */
      this.emit('serviceUp', message.referer!.address, message)
    })
  }

  /** Stop listening for mDNS up announcements.
    */
  stopListen () {
    if (this.browser == null) {
      return
    }
    this.debug('mdns: stop listening on %s', this._options.host)
    this.browser?.removeAllListeners()
    this.browser?.stop()
    this.bonjour?.destroy()
    delete this.browser
    delete this.bonjour
  }

  /** Issue an mDNS query and return the responses.
    *
    * A {@link MdnsClient#event:serviceUp serviceUp} event will be emitted on each
    * service up announcement received, that passes the filters.
    * @returns {Promise} Promise that resolves to an object with the found services.
    */
  async search (): Promise<jsonObject> {
    const result: jsonObject = {}

    function addResult (address: string, message: jsonObject): void {
      result[message.fqdn as string] = message
    }

    const noListener = this.browser == null
    this.on('serviceUp', addResult)
    this.debug(
      'mdns: searching %ds for %s',
      this._options.timeout, this._options.serviceType ?? 'all'
    )
    this.listen()
    await timeout(this._options.timeout * 1000)
    if (noListener) {
      this.stopListen()
    }
    this.removeListener('serviceUp', addResult)
    return result
  }
}

export { MdnsClient }
