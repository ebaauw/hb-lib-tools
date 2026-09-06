// hb-lib-tools/src/MdnsClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer, jsonMap } from 'hb-lib-tools'

import { EventEmitter } from 'node:events'

import Bonjour from 'bonjour-service'

import { Logger, timeout } from 'hb-lib-tools'
import { toInt } from 'hb-lib-tools/OptionParser'

/** {@link MdnsClient} events. */
export interface Events {
  /** Emitted by {@link MdnsClient.listen listen()} each service up announcement received, that passes the filers.
    * @event
    * @param address - The IP address of the device.
    * @param message - The parsed mDNS service up announcement.
    */
  serviceUp: [ address: string, message: jsonMap]
}

/** Multicast DNS (Bonjour) client.
  */
class MdnsClient extends EventEmitter<Events> {
  private debug: (format: string | Error, ...args: unknown[]) => void
  private vdebug: (format: string | Error, ...args: unknown[]) => void
  private vvdebug: (format: string | Error, ...args: unknown[]) => void

  private _options
  private bonjour?: Bonjour.Bonjour
  private browser?: Bonjour.Browser

  /** Create a new instance of an mDNS client. */
  constructor (params: {
    /** Function to filter mDNS messages.
      * Default is to accept all messages.
      */
    filter?: (message: jsonMap) => boolean,
    /** Logger instance to log to. */
    logger?: Logger,
    /** Filter on mDNS service type.
      * Default is `hap`. 
      */
    serviceType?: string,
    /** Timeout (in seconds) for {@link MdnsClient@search search()} to listen for responses.
      * Default is 5 seconds.
      */
    timeout?: integer
  }) {
    super()
    this.debug = params.logger?.debug.bind(params.logger) ?? (() => {})
    this.vdebug = params.logger?.vdebug.bind(params.logger) ?? (() => {})
    this.vvdebug = params.logger?.vvdebug.bind(params.logger) ?? (() => {})
    this._options = {
      filter: params.filter ?? (() => { return true }) as (message: jsonMap) => boolean,
      host: '224.0.0.251:5353',
      serviceType: params.serviceType ?? 'hap',
      timeout: params.timeout == null ? 5 : toInt(params.timeout, { key: 'params.timeout', min: 1, max: 60 })
    }
  }

  /** Listen for mDNS up announcements.
    *
    * A {@link Events.serviceUp serviceUp} event will be emitted on each
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
      if (!this._options.filter(message as unknown as jsonMap)) {
        return
      }
      this.vvdebug('mdns: found %j: %j', message.fqdn, message)
      this.vdebug('mdns: found %j at %s:%d', message.fqdn, message.referer!.address, message.port)
      this.emit('serviceUp', message.referer!.address, message as unknown as jsonMap)
    })
  }

  /** Stop listening for mDNS up announcements. */
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
    * A {@link Events.serviceUp serviceUp} event will be emitted on each
    * service up announcement received, that passes the filters.
    * @return Promise that resolves to a map of the found services.
    */
  async search (): Promise<{ [key: string]: jsonMap }> {
    const result: { [key: string]: jsonMap } = {}

    function addResult (address: string, message: jsonMap): void {
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
