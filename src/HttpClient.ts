// hb-lib-tools/src/HttpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { Logger, integer, map } from 'hb-lib-tools'

import { EventEmitter, once } from 'node:events'
import http, { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import https from 'node:https'
import { TLSSocket } from 'tls'

import { toArray, toHost, toObject, toPath, toString, OptionParser } from 'hb-lib-tools/OptionParser'

export class HttpError extends Error {
  request: HttpRequest
  statusCode?: integer
  statusMessage?: string

  constructor (message: string, request: HttpRequest, statusCode?: integer, statusMessage?: string) {
    super(message)
    this.name = 'HttpError'
    this.request = request
    this.statusCode = statusCode
    this.statusMessage = statusMessage
  }
}

export class HttpRequest {
  name: string
  id: integer
  method: string
  resource: string
  headers: OutgoingHttpHeaders
  body: unknown
  jsonBody?: string
  action?: string
  url: string

  constructor (params: {
    name: string,
    id: integer,
    method: string,
    resource: string,
    headers: OutgoingHttpHeaders,
    body: unknown,
    jsonBody?: string,
    action?: string,
    url: string
  }) {
    this.name = params.name
    this.id = params.id
    this.method = params.method
    this.resource = params.resource
    this.headers = params.headers
    this.body = params.body
    this.jsonBody = params.jsonBody
    this.action = params.action
    this.url = params.url
  }
}

export class HttpResponse {
  request: HttpRequest
  statusCode?: integer
  statusMessage?: string
  headers?: IncomingHttpHeaders
  body?: unknown
  rawBody?: unknown

  constructor (request: HttpRequest, params: {
    statusCode?: integer,
    statusMessage?: string,
    headers?: IncomingHttpHeaders,
    body?: unknown,
    rawBody?: unknown
  }) {
    this.request = request
    this.statusCode = params.statusCode
    this.statusMessage = params.statusMessage
    this.headers = params.headers
    this.body = params.body
    this.rawBody = params.rawBody
  }
}

/** HTTP client.
  * @extends EventEmitter
  */
export class HttpClient extends EventEmitter {
  static get HttpError () { return HttpError }
  static get HttpRequest () { return HttpRequest }
  static get HttpResponse () { return HttpResponse }

  error: (format: string | Error, ...args: unknown[]) => void
  warn: (format: string | Error, ...args: unknown[]) => void
  log: (format: string | Error, ...args: unknown[]) => void
  debug: (format: string | Error, ...args: unknown[]) => void
  vdebug: (format: string | Error, ...args: unknown[]) => void
  vvdebug: (format: string | Error, ...args: unknown[]) => void
  private __params
  private __options
  private __requestId: integer
  private __errorRequestId?: integer
  private _http: typeof http | typeof https

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
    * @param {instance} [params.logger] - Logger instance to log to.
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
    * @param {integer[]} [params.validStatusCodes=[200]] - List of valid HTTP status codes.<br>
    * {@link HttpClient#request request()} will throw an {@link HttpClient.HttpError HttpError}
    * in case the response constains no body and the status code is not in this list.
    * @param {?function} params.xmlParser - Parser for XML response body.
    */
  constructor (params: {
    ca?: string | string[]
    checkServerIdentity?: (hostname: string, cert: unknown) => Error | undefined
    headers?: map<string>
    host?: string
    https?: boolean
    ipv6?: boolean
    json?: boolean
    keepAlive?: boolean
    logger?: Logger
    maxSockets?: integer
    name?: string
    path?: string
    selfSignedCertificate?: boolean
    suffix?: string
    text?: boolean
    timeout?: integer
    validStatusCodes?: integer[]
    xmlParser?: (xml: string) => Promise<unknown>
  }) {
    super()
    this.error = params.logger?.error.bind(params.logger) ?? (() => {})
    this.warn = params.logger?.warn.bind(params.logger) ?? (() => {})
    this.log = params.logger?.log.bind(params.logger) ?? (() => {})
    this.debug = params.logger?.debug.bind(params.logger) ?? (() => {})
    this.vdebug = params.logger?.vdebug.bind(params.logger) ?? (() => {})
    this.vvdebug = params.logger?.vvdebug.bind(params.logger) ?? (() => {})
    const { hostname, port } = toHost(params.host ?? 'localhost:80', { key: 'params.host' })
    this.__params = {
      address: undefined as string | undefined,
      ca: params.ca === undefined ? undefined : toArray(params.ca, { key: 'params.ca' }) as string[],
      checkServerIdentity: params.checkServerIdentity,
      headers: params.headers ?? {},
      hostname: hostname ?? 'localhost',
      https: false,
      ipv6: false,
      json: false,
      keepAlive: false,
      localAddress: undefined as string | undefined,
      maxSockets: Infinity,
      name: params.name ?? undefined,
      path: '',
      port: port,
      selfSignedCertificate: false,
      suffix: '',
      timeout: 5,
      url: undefined as string | undefined,
      validStatusCodes: [200] as integer[],
      xmlParser: undefined as ((xml: string) => Promise<unknown>) | undefined
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
      .instanceKey('logger')
      .intKey('maxSockets', 1)
      .stringKey('name', true)
      .stringKey('path')
      .boolKey('selfSignedCertificate')
      .stringKey('suffix')
      .boolKey('text')
      .intKey('timeout', 1, 60)
      .arrayKey('validStatusCodes')
      .asyncFunctionKey('xmlParser')
      .parse(params)

    this.on('error', (error) => { this.#logError(error) })
    this.on('request', (request) => { this.#logRequest(request) })
    this.on('response', (response) => { this.#logResponse(response) })

    if (
      this.__params.ca || this.__params.checkServerIdentity ||
      this.__params.selfSignedCertificate
    ) {
      this.__params.https = true
    }
    this._http = this.__params.https ? https : http
    const agentOptions = {
      ca: this.__params.ca ?? undefined,
      checkServerIdentity: this.__params.checkServerIdentity ?? undefined,
      keepAlive: this.__params.keepAlive,
      maxSockets: this.__params.maxSockets,
      rejectUnauthorized: !this.__params.selfSignedCertificate
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
    this.#setUrl()
    this.__requestId = 0
  }

  #setUrl (): void {
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
    const obj = toHost(value, { key: 'host' })
    this.__params.hostname = obj.hostname
    this.__params.port = obj.port
    this.#setUrl()
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
      : toPath(value, { key: 'path' })
    this.#setUrl()
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
  async get (resource = '/', headers?: map<string>, suffix?: string) {
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
  async put (resource: string, body?: unknown, headers?: map<string>, suffix?: string) {
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
  async post (resource: string, body?: unknown, headers?: map<string>, suffix?: string) {
    return this.request('POST', resource, body, headers, suffix)
  }

  /** DELETE request.
    * @param {!string} resource - The resource.
    * @param {?unknown} body - The body for the request.
    * @param {?stringMap} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @return {object} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async delete (resource: string, body?: unknown, headers?: map<string>, suffix?: string) {
    return this.request('DELETE', resource, body, headers, suffix)
  }

  /** Issue an HTTP request.
    * @param {string} method - The method for the request.
    * @param {!string} resource - The resource for the request.
    * @param {?unknown} body - The body for the request.
    * @param {?stringMap} headers - Additional headers for the request.
    * @param {?string} suffix - Additional suffix to append after resource
    * e.g. for authentication of the request.
    * @param {?object} info - Additional key/value pairs to include in the
    * for the `HttpRequest` of the `request`, `response`, and `error` events.
    * @return {HttpClient.HttpResponse} response - The response.
    * @throws {HttpClient.HttpError} In case of error.
    */
  async request (method: string, resource: string, body?: unknown, headers?: map<string>, suffix: string = '', info = {}) {
    method = toString(method, { key: 'method', nonEmpty: true }).toUpperCase()
    if (!http.METHODS.includes(method)) {
      throw new TypeError(`${method}: invalid method`)
    }
    resource = toString(resource, { key: 'resource', nonEmpty: true })
    if (body != null && !Buffer.isBuffer(body)) {
      body = this.__params.json
        ? JSON.stringify(body)
        : toString(body, { key: 'body' })
    }
    const requestId = ++this.__requestId
    const url = this.__params.url + (resource === '/' ? '' : resource) +
                this.__params.suffix + suffix
    const options = Object.assign({ method }, this.__options)
    const requestInfo = Object.assign({
      name: this.name,
      headers: headers ?? {},
      id: requestId,
      method,
      resource,
      body,
      url
    }, info) as HttpRequest
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
            const cert = (socket as TLSSocket).getPeerCertificate()
            if (Object.keys(cert).length === 0) {
              return
            }
            const error = this.__params.checkServerIdentity!(this.__params.hostname, cert)
            if (error != null) {
              request.destroy(error)
            }
          })
        }
      })
      .on('response', (response) => {
        const chunks: Buffer[] = []
        response
          .on('data', (chunk) => { chunks.push(chunk) })
          .on('end', async () => {
            const buffer = Buffer.concat(chunks)
            const responseInfo = {
              request: requestInfo,
              headers: response.headers,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
              body: buffer.length > 0 ? buffer : null
            } as HttpResponse
            const errorMessages = []

            const a = response.headers['content-type']?.split(';')
            const contentType = a?.[0]
            const charset = (a?.[1]?.split('=')[1]?.replace(/"/g, '') ?? 'utf-8') as BufferEncoding
            if (
              contentType?.startsWith('text/') ||
              contentType?.endsWith('/json') ||
              contentType?.endsWith('/xml')
            ) {
              try {
                responseInfo.body = (responseInfo.body as Buffer)?.toString(charset)
              } catch (error) {
                errorMessages.push('response contains invalid text: ' + (error as Error).message)
              }
            }
            if (responseInfo.body != null) {
              if (contentType?.endsWith('/json')) {
                try {
                  responseInfo.body = JSON.parse(responseInfo.body as string)
                } catch (error) {
                  errorMessages.push('response contains invalid json: ' + (error as Error).message)
                }
              } else if (contentType?.endsWith('/xml') && this.__params.xmlParser != null) {
                try {
                  responseInfo.rawBody = responseInfo.body
                  responseInfo.body = await this.__params.xmlParser(responseInfo.body as string)
                } catch (error) {
                  responseInfo.rawBody = null
                  errorMessages.push('response contains invalid xml: ' + (error as Error).message)
                }
              }
            }
            /** Emitted when a valid response has been received from the HTTP server.
              * @event HttpClient#response
              * @param {HttpClient.HttpResponse} response - The response.
              */
            this.emit('response', responseInfo)

            if (
              responseInfo.body == null &&
              response.statusCode != null &&
              !this.__params.validStatusCodes.includes(response.statusCode)
            ) {
              errorMessages.push(`http status ${response.statusCode} ${response.statusMessage}`)
            }
            if (errorMessages.length > 0) {
              for (const errorMessage of errorMessages) {
                /** Emitted in case of error.
                  * @event HttpClient#error
                  * @param {HttpClient.HttpError} error - The error.
                  */
                this.emit('error', new HttpError(
                  errorMessage, requestInfo, response.statusCode, response.statusMessage
                ))
              }
              return
            }
            this.emit('' + requestId, responseInfo)
          })
      })

    if (headers != null) {
      headers = toObject(headers, { key: 'headers' }) as map<string>
      for (const header in headers) {
        request.setHeader(header, headers[header])
      }
    }
    requestInfo.headers = request.getHeaders()
    request.end(body)
    const a = await once(this, '' + requestId)
    return a[0]
  }

  #logError (error: HttpError): void {
    const { request } = error
    const body = request.jsonBody ?? request.body
    const action = request.action ?? body
    if (request.id !== this.__errorRequestId) {
      this.log(
        '%s: request %s: %s %s%s', this.name, request.id,
        request.method, request.resource,
        action == null ? '' : ' ' + action
      )
      this.__errorRequestId = error.request.id
    }
    this.warn(
      '%s: request %d: %s', request.name, request.id, error
    )
  }

  #logRequest (request: HttpRequest): void {
    const body = request.jsonBody ?? request.body
    const action = request.action ?? body
    this.debug(
      '%s: request %s: %s %s%s', this.name, request.id,
      request.method, request.resource,
      action == null ? '' : ' ' + action
    )
    this.vdebug(
      '%s: request %s: %s %s%s', this.name, request.id,
      request.method, request.url,
      body == null ? '' : ' ' + body
    )
    if (request.headers != null) {
      this.vvdebug(
        '%s: request %s: headers: %j', this.name, request.id,
        request.headers
      )
    }
    const rawBody = request.jsonBody != null ? request.body : null
    if (rawBody != null) {
      this.vvdebug(
        '%s: request %s: body: %j', this.name, request.id,
        rawBody
      )
    }
  }

  #logResponse (response: HttpResponse): void {
    const dontLogBody = response.body instanceof Buffer || (response.body as string)?.length > 1024
    const body = dontLogBody ? (response.body as string)?.length : response.body
    const rawBody = dontLogBody ? response.body : response.rawBody
    this.debug(
      '%s: request %d: http status %d %s', this.name, response.request.id,
      response.statusCode, response.statusMessage
    )
    this.vvdebug(
      '%s: request %d: response headers: %j', this.name, response.request.id,
      response.headers
    )
    if (rawBody != null) {
      this.vvdebug(
        '%s: request %d: response body: %j', this.name, response.request.id, rawBody
      )
    }
    if (body != null) {
      this.vdebug(
        '%s: request %d: response: %j', this.name, response.request.id, body
      )
    }
  }
}
