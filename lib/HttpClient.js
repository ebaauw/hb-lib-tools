// hb-lib-tools/lib/HttpClient.js
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { EventEmitter } from 'node:events'
import http from 'node:http'
import https from 'node:https'

import { OptionParser } from 'hb-lib-tools/OptionParser'

/** HTTP error.
  * @hideconstructor
  * @extends Error
  * @memberof HttpClient
  */
class HttpError extends Error {
  constructor (message, request, statusCode, statusMessage) {
    super(message)
    /** @member {HttpClient.HttpRequest} - The request that caused the error.
      */
    this.request = request

    /** @member {?integer} - The HTTP status code.
      */
    this.statusCode = statusCode

    /** @member {?string} - The HTTP status message.
      */
    this.statusMessage = statusMessage
  }
}

/** HTTP request.
  * @hideconstructor
  * @memberof HttpClient
  */
class HttpRequest {
  constuctor (name, id, method, resource, headers, body, url) {
    /** @member {string} - The server name.
      */
    this.name = name

    /** @member {integer} - The request ID.
      */
    this.id = id

    /** @member {string} - The request method.
      */
    this.method = method

    /** @member {string} - The requested resource.
      */
    this.resource = resource

    /** @member {object} - The request headers.
      */
    this.headers = headers

    /** @member {?string} - The request body.
      */
    this.body = body

    /** @member {string} - The full request URL.
      */
    this.url = url
  }
}

/** HTTP response.
  * @hideconstructor
  * @memberof HttpClient
  */
class HttpResponse {
  constructor (request, statusCode, statusMessage, headers, body, rawBody) {
    /** @member {HttpClient.HttpRequest} - The request that generated the response.
      */
    this.request = request

    /** @member {integer} - The HTTP status code.
      */
    this.statusCode = statusCode

    /** @member {string} - The HTTP status message.
      */
    this.statusMessage = statusMessage

    /** @member {object} - The response headers.
      */
    this.headers = headers

    /** @member {?*} - The (parsed) response body.
      * - A JavaScript object in case the response body contains
      * JSON or XML and an `xmlParser` was specified;
      * - A string in case case the response body contains text;
      * - A Buffer otherwise.
      */
    this.body = body

    /** @member {?String} - The unparsed response body, in case
      * The text of the response body in case the response body contains
      * JSON or XML and an `xmlParser` was specified
      */
    this.rawBody = rawBody
  }
}

/** HTTP client.
  * <br>See {@link HttpClient}.
  * @name HttpClient
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** HTTP client.
  * @extends EventEmitter
  */
class HttpClient extends EventEmitter {
  static get HttpError () { return HttpError }
  static get HttpRequest () { return HttpRequest }
  static get HttpResponse () { return HttpResponse }

  /** Create a new instance of a client to an HTTP server.
    *
    * @param {object} params - Parameters.
    * @param {string|string[]} [params.ca] - Certificate authority for the server.
    * @param {function} [params.checkServerIdentity] - Custom function to check
    * the server identity.
    * @param {object} [params.headers={}] - Default HTTP headers for each request.
    * @param {string} [params.host='localhost:80'] - Server hostname and port.
    * @param {boolean} [params.https=false] - Use HTTPS (instead of HTTP).
    * @param {boolean} [params.ipv6=false] - Use IPv6 (instead of IPv4).
    * @param {boolean} [params.json=false] - Use JSON, i.e. request and response
    * bodies are JSON strings.
    * @param {boolean} [params.keepAlive=false] - Keep server connection(s) open.
    * @param {integer} [params.maxSockets=Infinity] - Throttle requests to
    * maximum number of parallel connections.
    * @param {?string} params.name - The name of the server.  Defaults to hostname.
    * @param {string} [params.path=''] - Server base path.
    * @param {boolean} [params.selfSignedCertificate=false] - Server uses a
    * self-signed SSL certificate.
    * @param {string} [params.suffix=''] - Base suffix to append after resource
    * e.g. for authentication of the request.
    * @param {boolean} [params.text=false] - Convert response body to text.
    * @param {integer} [params.timeout=5] - Request timeout (in seconds).
    * @param {integer[]} [params.validStatusCodes=[200]] - List of valid HTTP status codes.
    * @param {?function} params.xmlParser - Parser for XML response body.
    */
  constructor (params) {
    super()
    this.__params = {
      headers: {},
      hostname: 'localhost',
      keepAlive: false,
      maxSockets: Infinity,
      path: '',
      suffix: '',
      timeout: 5,
      validStatusCodes: [200]
    }
    const optionParser = new OptionParser(this.__params)
    optionParser
      .arrayKey('ca')
      .functionKey('checkServerIdentity')
      .hostKey()
      .boolKey('https')
      .boolKey('ipv6')
      .objectKey('headers')
      .boolKey('json')
      .boolKey('keepAlive')
      .intKey('maxSockets', 1)
      .stringKey('name', true)
      .stringKey('path')
      .boolKey('selfSignedCertificate')
      .stringKey('suffix')
      .boolKey('text', true)
      .intKey('timeout', 1, 60)
      .arrayKey('validStatusCodes')
      .asyncFunctionKey('xmlParser')
      .parse(params)
    if (
      this.__params.ca || this.__params.checkServerIdentity ||
      this.__params.selfSignedCertificate
    ) {
      this.__params.https = true
    }
    this._http = this.__params.https ? https : http
    const agentOptions = {
      keepAlive: this.__params.keepAlive,
      maxSockets: this.__params.maxSockets
    }
    if (this.__params.ca != null) {
      agentOptions.ca = this.__params.ca
    }
    if (this.__params.selfSignedCertificate) {
      agentOptions.rejectUnauthorized = false
    } else if (this.__params.checkServerIdentity != null) {
      agentOptions.checkServerIdentity = this.__params.checkServerIdentity
    }
    this.__options = {
      agent: new this._http.Agent(agentOptions),
      family: this.__params.ipv6 ? 6 : 4,
      headers: Object.assign({}, this.__params.headers),
      timeout: 1000 * this.__params.timeout
    }
    if (this.__params.json) {
      const json = 'application/json;charset=utf-8'
      if (this.__options.headers == null) {
        this.__options.headers = {}
      }
      this.__options.headers['Content-Type'] = json
      if (this.__options.headers.Accept == null) {
        this.__options.headers.Accept = json
      } else {
        this.__options.headers.Accept += ',' + json
      }
    }
    this._setUrl()
    this.__requestId = 0
  }

  _setUrl () {
    this.__params.url = this.__params.https ? 'https://' : 'http://'
    this.__params.url += this.__params.hostname
    if (this.__params.port != null) {
      this.__params.url += ':' + this.__params.port
    }
    this.__params.url += this.__params.path
  }

  /** Server IP address.
    * @type {string}
    * @readonly
    */
  get address () { return this.__params.address }

  /** Server hostname and port.
    * @type {string}
    */
  get host () {
    let host = this.__params.hostname
    if (this.__params.port != null) {
      host += ':' + this.__params.port
    }
    return host
  }

  set host (value) {
    const obj = OptionParser.toHost('host', value)
    this.__params.hostname = obj.hostname
    this.__params.port = obj.port
    this._setUrl()
  }

  /** Local IP address used for the connection.
    * @type {string}
    * @readonly
    */
  get localAddress () { return this.__params.localAddress }

  /** Server frienly name.
    * Defaults to the hostname.
    * @type {string}
    */
  get name () {
    return this.__params.name == null
      ? this.__params.hostname
      : this.__params.name
  }

  set name (name) {
    this.__params.name = name
  }

  /** Server (base) path.
    * @type {string}
    */
  get path () { return this.__params.path }
  set path (value) {
    this.__params.path = value == null
      ? ''
      : OptionParser.toPath('path', value)
    this._setUrl()
  }

  /** Server (base) url.
    * @type {string}
    * @readonly
    */
  get url () { return this.__params.url }

  /** GET request.
    * @param {string} [resource='/'] - The resource.
    * @param {?object} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @return {HttpClient.HttpResponse} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async get (resource = '/', headers, suffix) {
    return this.request('GET', resource, undefined, headers, suffix)
  }

  /** PUT request.
    * @param {!string} resource - The resource.
    * @param {?*} body - The body for the request.
    * @param {?object} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @return {HttpClient.HttpResponse} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async put (resource, body, headers, suffix) {
    return this.request('PUT', resource, body, headers, suffix)
  }

  /** POST request.
    * @param {!string} resource - The resource.
    * @param {?*} body - The body for the request.
    * @param {?object} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @return {HttpClient.HttpResponse} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async post (resource, body, headers, suffix) {
    return this.request('POST', resource, body, headers, suffix)
  }

  /** DELETE request.
    * @param {!string} resource - The resource.
    * @param {?*} body - The body for the request.
    * @param {?object} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @return {object} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async delete (resource, body, headers, suffix) {
    return this.request('DELETE', resource, body, headers, suffix)
  }

  /** Issue an HTTP request.
    * @param {string} method - The method for the request.
    * @param {!string} resource - The resource for the request.
    * @param {?*} body - The body for the request.
    * @param {?object} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @param {?object} info - Additional key/value pairs to include in the
    * for the `HttpRequest` of the `request`, `response`, and `error` events.
    * @return {HttpClient.HttpResponse} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async request (method, resource, body, headers = {}, suffix = '', info = {}) {
    return new Promise((resolve, reject) => {
      method = OptionParser.toString('method', method, true)
      if (!http.METHODS.includes(method)) {
        throw new TypeError(`${method}: invalid method`)
      }
      resource = OptionParser.toString('resource', resource, true)
      if (body != null && !Buffer.isBuffer(body)) {
        body = this.__params.json
          ? JSON.stringify(body)
          : OptionParser.toString('body', body)
      }
      const requestId = ++this.__requestId
      const url = this.__params.url + (resource === '/' ? '' : resource) +
                  this.__params.suffix + suffix
      const options = Object.assign({ method }, this.__options)
      const requestInfo = Object.assign({
        name: this.name,
        id: requestId,
        method,
        resource,
        body,
        url
      }, info)
      const request = this._http.request(url, options)
      request
        .on('error', (error) => {
          if (!(error instanceof HttpError)) {
            error = new HttpError(error.message, requestInfo)
          }
          /** Emitted in case of error.
            * @event HttpClient#error
            * @param {HttpClient.HttpError} error - The error.
            */
          this.emit('error', error)
          reject(error)
        })
        .on('timeout', () => {
          const error = new HttpError(
            `timeout after ${this.__params.timeout} seconds`,
            requestInfo, 408, 'Request Timeout'
          )
          request.destroy(error)
        })
        .on('socket', (socket) => {
          if (
            this.__params.address == null || this.__params.localAddress == null
          ) {
            socket.once('connect', () => {
              this.__params.address = socket.remoteAddress
              this.__params.localAddress = socket.localAddress
            })
          }
          /** Emitted when a request has been sent to the HTTP server.
            * @event HttpClient#request
            * @param {HttpClient.HttpRequest} request - The request.
            */
          this.emit('request', requestInfo)
          if (
            this.__params.selfSignedCertificate &&
            this.__params.checkServerIdentity != null
          ) {
            socket.once('secureConnect', () => {
              const cert = socket.getPeerCertificate()
              if (Object.keys(cert).length === 0) {
                return
              }
              const error = this.__params.checkServerIdentity(this.__params.hostname, cert)
              if (error != null) {
                request.destroy(error)
              }
            })
          }
        })
        .on('response', (response) => {
          const a = []
          response
            .on('data', (chunk) => { a.push(chunk) })
            .on('end', async () => {
              const buffer = Buffer.concat(a)
              const responseInfo = {
                request: requestInfo,
                headers: response.headers,
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
                body: buffer.length > 0 ? buffer : null
              }
              if (
                response.headers['content-type']?.startsWith('text') ||
                response.headers['content-type']?.startsWith('application/json') ||
                response.headers['content-type']?.includes('/xml')
              ) {
                responseInfo.body = responseInfo.body?.toString('utf-8')
              }

              let errorMessage
              if (!this.__params.validStatusCodes.includes(response.statusCode)) {
                errorMessage = `http status ${response.statusCode} ${response.statusMessage}`
              }
              if (responseInfo.body != null) {
                if (
                  response.headers['content-type']?.startsWith('application/json')
                ) {
                  try {
                    responseInfo.rawBody = responseInfo.body
                    responseInfo.body = JSON.parse(responseInfo.body)
                  } catch (error) {
                    errorMessage = 'response contains invalid json: ' + error.message
                  }
                } else if (
                  response.headers['content-type']?.includes('/xml') &&
                  this.__params.xmlParser != null
                ) {
                  try {
                    responseInfo.rawBody = responseInfo.body
                    responseInfo.body = await this.__params.xmlParser(
                      responseInfo.body
                    )
                  } catch (error) {
                    errorMessage = 'response contains invalid xml: ' + error.message
                  }
                }
              }

              /** Emitted when a valid response has been received from the HTTP server.
                * @event HttpClient#response
                * @param {HttpClient.HttpResponse} response - The response.
                */
              this.emit('response', responseInfo)

              if (errorMessage != null) {
                request.emit('error', new HttpError(
                  errorMessage, requestInfo, response.statusCode, response.statusMessage
                ))
                return
              }
              resolve(responseInfo)
            })
        })

      if (headers != null) {
        headers = OptionParser.toObject('headers', headers)
        for (const header in headers) {
          request.setHeader(header, headers[header])
        }
      }
      requestInfo.headers = request.getHeaders()
      request.end(body)
    })
  }
}

export { HttpClient }
