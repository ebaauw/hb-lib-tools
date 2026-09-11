// hb-lib-tools/src/MdnsClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { integer, Logger } from 'hb-lib-tools'

import { EventEmitter } from 'node:events'

import Bonjour from 'bonjour-service'

import { timeout } from 'hb-lib-tools'
import { toInt } from 'hb-lib-tools/OptionParser'

/** {@link MdnsClient} events. */
export interface Events {
  /** Emitted by {@link MdnsClient.listen listen()} each service up announcement received, that passes the filers.
    * @event
    * @param address - The IP address of the device.
    * @param message - The parsed mDNS service up announcement.
    */
  serviceUp: [ address: string, message: Bonjour.Service]
}

/** Multicast DNS (Bonjour) client.
  */
class MdnsClient extends EventEmitter<Events> {
  private readonly options
  private bonjour?: Bonjour.Bonjour
  private browser?: Bonjour.Browser

  /** Create a new instance of an mDNS client. */
  constructor (params: {
    /** Function to filter mDNS messages.
      * Default is to accept all messages.
      */
    filter?: (message: Bonjour.Service) => boolean,
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
    this.options = {
      filter: params.filter ?? (() => true ),
      host: '224.0.0.251:5353',
      logger: params.logger,
      serviceType: params.serviceType ?? 'hap',
      timeout: params.timeout == null
        ? 5 // eslint-disable-line @typescript-eslint/no-magic-numbers -- default timeout
        : toInt(params.timeout, { key: 'params.timeout', min: 1, max: 60 })
    }
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
      this.options.host, this.options.serviceType
    )
    this.bonjour = new Bonjour()
    this.browser = this.bonjour.find({ type: this.options.serviceType })
    this.browser.on('up', (message) => {
      // this.vvvdebug('mdns: found %j: %j', message.fqdn, message)
      if ('rawTxt' in message) {
        delete message.rawTxt // eslint-disable-line no-param-reassign -- no
      }
      if (!this.options.filter(message)) {
        return
      }
      this.vvdebug('mdns: found %j: %j', message.fqdn, message)
      this.vdebug('mdns: found %j at %s:%d', message.fqdn, message.referer?.address ?? '(unknown)', message.port)
      this.emit('serviceUp', message.referer?.address ?? '(unknown)', message)
    })
  }

  /** Stop listening for mDNS up announcements. */
  stopListen (): void {
    if (this.browser != null) {
      this.debug('mdns: stop listening on %s', this.options.host)
      this.browser.removeAllListeners()
      this.browser.stop()
      delete this.browser
    }
    this.bonjour?.destroy()
    delete this.bonjour
  }

  /** Issue an mDNS query and return the responses.
    *
    * A {@link Events.serviceUp serviceUp} event will be emitted on each
    * service up announcement received, that passes the filters.
    * @return Promise that resolves to a map of the found services.
    */
  async search (): Promise<Record<string, Bonjour.Service>> {
    const result: Record<string, Bonjour.Service> = {}

    function addResult (address: string, message: Bonjour.Service): void {
      result[message.fqdn] = message
    }

    const noListener = this.browser == null
    this.on('serviceUp', addResult)
    this.debug(
      'mdns: searching %ds for %s',
      this.options.timeout, this.options.serviceType
    )
    this.listen()
    await timeout(this. options.timeout * 1000)
    if (noListener) {
      this.stopListen()
    }
    this.removeListener('serviceUp', addResult)
    return result
  }
}

export { MdnsClient }
