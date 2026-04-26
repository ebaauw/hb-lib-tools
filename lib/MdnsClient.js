// hb-lib-tools/lib/MdnsClient.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { EventEmitter } from 'node:events'

import Bonjour from 'bonjour-hap'

import { timeout } from 'hb-lib-tools'
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
  /** Create a new instance of an mDNS client.
    * @param {object} params - Paramters.
    * @param {function} [params.filter=() => { return true }] - Function to
    * filter mDNS messages.
    * @param {instance} [params.logger] - Logger instance to log to.
    * @param {string} [params.serviceType='http'] - Filter on mDNS service type.
    * @param {integer} [params.timemout=5] - Timeout (in seconds) for
    * {@link MdnsClient@search search()} to listen for responses.
    */
  constructor (params = {}) {
    super()
    this._options = {
      filter: () => { return true },
      host: '224.0.0.251:5353',
      timeout: 5,
      serviceType: 'hap'
    }
    const optionParser = new OptionParser(this._options)
    optionParser
      .functionKey('filter')
      .instanceKey('logger')
      .stringKey('serviceType', true)
      .intKey('timeout', 1, 60)
      .parse(params)
    if (this._options.serviceType === '*') {
      delete this._options.serviceType
    }
    for (const f of ['warn', 'log', 'debug', 'vdebug', 'vvdebug']) {
      this[f] = params?.logger?.[f]?.bind(params?.logger) ?? (() => {})
    }
  }

  /** Listen for mDNS up announcements.
    *
    * A {@link MdnsClient#event:serviceUp serviceUp} event will be emitted on each
    * service up announcement received, that passes the filters.
    */
  listen () {
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
      delete message.rawTxt
      this.vdebug('mdns: found %j: %j', message.fqdn, message)
      if (!this._options.filter(message)) {
        return
      }
      this.debug('mdns: found %j at %s:%d', message.fqdn, message.referer.address, message.port)
      /** Emitted for each response received, that passes the filters.
        * @event MdnsClient#serviceUp
        * @param {string} address - IP address of the device.
        * @param {object} message - The parsed message.
        */
      this.emit('serviceUp', message.referer.address, message)
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
  async search () {
    function addResult (address, message) {
      result[message.fqdn] = message
    }

    const result = {}
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
