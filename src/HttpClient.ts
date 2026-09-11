// hb-lib-tools/src/HttpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { PeerCertificate, TLSSocket } from 'node:tls'
import type { Logger, integer, json, jsonMap } from 'hb-lib-tools'
import type { host, path } from 'hb-lib-tools/OptionParser'

import { EventEmitter, once } from 'node:events'
import http from 'node:http'
import https from 'node:https'

import { isJson, toHexString } from 'hb-lib-tools'
import { toHost, toInt, toPath } from 'hb-lib-tools/OptionParser'

const IPV4 = 4
const IPV6 = 6
const HTTP_PORT = 80
const HTTPS_PORT = 443
const HTTP_STATUS_OK = 200
const TIMEOUT = 5

/** HTTP request information. */
export interface HttpRequest {
  /** Name of the HTTP server. */
  name: string,
  /** Request ID. */
  id: integer,
  /** Request method. */
  method: string,
  /** Request resource. */
  resource: string,
  /** Request headers. */
  headers: OutgoingHttpHeaders,
  /** The raw HTTP request body. */
  rawBody?: Buffer,
  /** Request body. */
  body?: string,
  /** Request body as JSON. */
  jsonBody?: json,
  /** Request action (for SOAP requests). */
  action?: string,
  /** Request URL. */
  url: string
  /** Additional key/value pairs to include in the request info. */
  info?: jsonMap
}

/** HTTP response information. */
export interface HttpResponse {
  /** Information about the corresponding HTTP request. */
  request: HttpRequest
  /** The HTTP status code. */
  statusCode?: integer
  /** The HTTP status message. */
  statusMessage?: string
  /** The HTTP response headers. */
  headers?: IncomingHttpHeaders
  /** The raw HTTP response body. */
  rawBody?: Buffer
  /** The HTTP response body as text. */
  body?: string,
  /** The HTTP body response parsed as JSON. */
  jsonBody?: json,
  /** The HTTP response body parsed as XML. */
  xmlBody?: json
}

function isHttpResponse (obj: unknown): obj is HttpResponse {
  return typeof obj === 'object' && obj !== null && 'request' in obj
}

/** HTTP error. */
export class HttpError extends Error {
  /** Information about the corresponding HTTP request. */
  request: HttpRequest
  /** Information about the corresponding HTTP response, if available. */
  response?: HttpResponse

  constructor (
    /** The error message. */
    message: string,
    /** Information about the corresponding HTTP request. */
    request: HttpRequest,
    /** Information about the corresponding HTTP response, if available. */
    response?: HttpResponse
  ) {
    super(message)
    this.name = 'HttpError'
    this.request = request
    this.response = response
  }
}

/** {@link HttpClient} events. */
export interface Events {
  /** Emitted by {@link HttpClient.request request()} when a request is made.
    * @event
    * @param request - The HTTP request.
    */
  request: [request: HttpRequest]
  /** Emitted by {@link HttpClient.request request()} when a response is received.
    * @event
    * @param response - The HTTP response.
    */
  response: [response: HttpResponse]
  /** Emitted by {@link HttpClient.request request()} when an error occurs.
    * @event
    * @param error - The error.
    */
  error: [error: HttpError]
}

/** {@link HttpClient} options. */
export interface Options {
  /** Certificate authority for the server. */
  ca?: string | string[],
  /** Custom function to check the server identity. */
  checkServerIdentity?: (hostname: string, cert: PeerCertificate) => Error | undefined,
  /** Default HTTP headers for each request. */
  headers: Record<string, string>,
  /** Server hostname and port. */
  host: host,
  /** Use HTTPS (instead of HTTP). */
  https: boolean,
  /** Use IPv6 (instead of IPv4). */
  ipv6: boolean,
  /** Request body contains JSON. */
  json: boolean,
  /** Keep server connection(s) open. */
  keepAlive: boolean,
  /** Logger instance to log to. */
  logger?: Logger
  /** Throttle requests to maximum number of parallel connections. */
  maxSockets: integer,
  /** The name of the server.  Defaults to hostname. */
  name: string,
  /** Server base path. */
  path: path,
  /** Server uses a self-signed SSL certificate. */
  selfSignedCertificate: boolean,
  /** Base suffix to append after resource, e.g. for authentication of the request. */
  suffix: string,
  /** Convert response body to text. */
  text: boolean, // TODO: needed or can we use response type
  /** Request timeout (in seconds). */
  timeout: integer,
  /** List of valid HTTP status codes.<br>
    * {@link HttpClient#request request()} will throw an {@link HttpError}
    * in case the response constains no body and the status code is not in this list.
    */
  validStatusCodes: integer[],
  /** Parser for XML response body. */
  xmlParser?: (xml: string) => Promise<jsonMap>
}

/* Helper to signal request that HTTP response has been received. */
class ResponseListener extends EventEmitter<{ 'response': [response: HttpResponse] }> {}

/* Extract content-type and charset from HTTP headers. */
function contentType (headers?: IncomingHttpHeaders): { type: string, charset: BufferEncoding } {
  const contentType = headers?.['content-type'] ?? ''
  const a = /^\s*(?<type>[^;]+)\s*(?:;\s*charset="?(?<cs>[^;"]+))?"?\s*$/.exec(contentType)
  if (a?.groups == null) {
    return { type: '', charset: 'utf-8' }
  }
  const { type, cs } = a.groups as Record<string, string | null>
  const charset = cs != null && Buffer.isEncoding(cs) ? cs : 'utf-8'
  return { type: type ?? '', charset }
}

/** HTTP client. */
export class HttpClient extends EventEmitter<Events> {
  private readonly __options: Options & {
    address?: string,
    hostname: string,
    localAddress?: string,
    port?: integer,
    url?: string
  }
  private readonly __httpOptions: http.RequestOptions
  private __requestId: integer
  private __errorRequestId?: integer
  private readonly _http: typeof http | typeof https
  
  protected error(format: unknown, ...args: unknown[]): void {
    this.__options.logger?.error(format, ...args)
  }

  protected warn(format: unknown, ...args: unknown[]): void {
    this.__options.logger?.warn(format, ...args)
  }

  protected log(format: unknown, ...args: unknown[]): void {
    this.__options.logger?.log(format, ...args)
  }

  protected debug(format: unknown, ...args: unknown[]): void {
    this.__options.logger?.debug(format, ...args)
  }

  protected vdebug(format: unknown, ...args: unknown[]): void {
    this.__options.logger?.vdebug(format, ...args)
  }

  protected vvdebug(format: unknown, ...args: unknown[]): void {
    return this.__options.logger?.vvdebug(format, ...args)
  }

  /** Create a new instance of a client to an HTTP server. */
  constructor (options: Partial<Options> = {}) { // eslint-disable-line complexity -- ignore
    super()
    const { hostname, port } = toHost(options.host ?? 'localhost', { key: 'params.host' })
    this.__options = {
      ca: options.ca === undefined ? undefined : typeof options.ca === 'string' ? [ options.ca ] : options.ca,
      checkServerIdentity: options.checkServerIdentity,
      headers: options.headers ?? {},
      hostname,
      host: options.host ?? 'localhost',
      https: options.https ?? false,
      ipv6: options.ipv6 ?? false,
      json: options.json ?? false,
      keepAlive: options.keepAlive ?? false,
      logger: options.logger,
      maxSockets: options.maxSockets ?? Infinity,
      name: options.name ?? hostname,
      path: options.path ?? '/',
      port: port ?? ((options.https ?? false) ? HTTPS_PORT : HTTP_PORT),
      selfSignedCertificate: options.selfSignedCertificate ?? false,
      suffix: options.suffix ?? '',
      text: options.text ?? false,
      timeout: options.timeout === undefined
        ? TIMEOUT
        : toInt(options.timeout, { key: 'options.timeout', min: 1, max: 60 }),
      validStatusCodes: options.validStatusCodes ?? [HTTP_STATUS_OK],
      xmlParser: options.xmlParser
    }

    this.on('error', (error) => { this.#logError(error) })
    this.on('request', (request) => { this.#logRequest(request) })
    this.on('response', (response) => { this.#logResponse(response) })

    if (
      this.__options.ca != null || this.__options.checkServerIdentity != null||
      this.__options.selfSignedCertificate
    ) {
      this.__options.https = true
    }
    this._http = this.__options.https ? https : http
    const agentOptions: https.AgentOptions = {
      ca: this.__options.ca ?? undefined,
      checkServerIdentity: this.__options.checkServerIdentity?.bind(this) ?? undefined,
      keepAlive: this.__options.keepAlive,
      maxSockets: this.__options.maxSockets,
      rejectUnauthorized: !this.__options.selfSignedCertificate
    }
    const headers: OutgoingHttpHeaders = { ...this.__options.headers }
    this.__httpOptions = {
      agent: new this._http.Agent(agentOptions),
      family: this.__options.ipv6 ? IPV6 : IPV4,
      headers,
      timeout: this.__options.timeout * 1000
    }
    if (this.__options.json) {
      const contentType = 'application/json;charset=utf-8'
      headers['Content-Type'] = contentType
      if (headers.Accept == null) {
        headers.Accept = contentType
      } else {
        headers.Accept = `${String(headers.Accept)},${contentType}`
      }
    }
    this.#setUrl()
    this.__requestId = 0
  }

  #setUrl (): void {
    this.__options.url = this.__options.https ? 'https://' : 'http://'
    this.__options.url += this.__options.hostname
    if (this.__options.port != null) {
      this.__options.url += `:${this.__options.port}`
    }
    this.__options.url += this.__options.path
  }

  /** Server IP address. */
  get address (): string | undefined { return this.__options.address }

  /** Server hostname and port. */
  get host (): host { return this.__options.host }
  set host (host: host) {
    const { hostname, port } = toHost(host, { key: 'host' })
    this.__options.host = host
    this.__options.hostname = hostname
    this.__options.port = port ?? (this.__options.https ? HTTPS_PORT : HTTP_PORT)
    this.#setUrl()
  }

  /** Local IP address used for the connection. */
  get localAddress (): string | undefined { return this.__options.localAddress }

  /** Server frienly name.
    * 
    * Defaults to the hostname.
    */
  get name (): string { return this.__options.name }
  set name (name) {
    this.__options.name = name
  }

  /** Server (base) path. */
  get path (): path { return this.__options.path }
  set path (path) {
    this.__options.path = toPath(path, { key: 'path' })
    this.#setUrl()
  }

  /** Server (base) url.  */
  get url (): string | undefined { return this.__options.url}

  /** GET request. */
  async get (
    /** The resource. */
    resource: path = '/',
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request({ resource, headers, suffix })
  }

  /** PUT request. */
  async put (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: Buffer | string | json,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request({ method: 'PUT', resource, body, headers, suffix })
  }

  /** POST request. */
  async post (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: Buffer | string | json,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request({ method: 'POST', resource, body, headers, suffix })
  }

  /** DELETE request. */
  async delete (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: Buffer | string | json,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request({ method: 'DELETE', resource, body, headers, suffix })
  }

  /** Issue an HTTP request. */
  async request (params: { // eslint-disable-line complexity -- TODO
    /** The HTTP method. Default: `'GET'`. */
    method?: string,
    /** The resource.   Default `'/'`. */
    resource?: path,
    /** The body for the request. */
    body?: Buffer | string | json,
    /** Additional headers for the request. Default: `{}`. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string,
    /** Additional key/value pairs to include in the request info. */
    info?: jsonMap
  } = {}): Promise<HttpResponse> {
    const method = params.method?.toUpperCase() ?? 'GET'
    if (!http.METHODS.includes(method)) {
      throw new TypeError(`${params.method}: invalid method`)
    }
    const resource = toPath(params.resource ?? '/', { key: 'resource' })
    const rawBody = params.body instanceof Buffer ? params.body : undefined
    let body: string | undefined
    let jsonBody: json | undefined
    if (this.__options.json && isJson(params.body)) {
      body = JSON.stringify(jsonBody)
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- no
      jsonBody = params.body
    } else {
      body = typeof params.body === 'string' ? params.body : undefined
    }
    const headers = params.headers ?? {}
    const suffix = params.suffix ?? ''
    const info = params.info ?? {}

    this.__requestId += 1
    const { __requestId: requestId } = this
    const url = this.__options.url + (resource === '/' ? '' : resource) +
                this.__options.suffix + suffix
    const options: http.RequestOptions = { method, ...this.__httpOptions }
    const requestInfo: HttpRequest = {
      name: this.name,
      headers,
      id: requestId,
      method,
      resource,
      rawBody,
      body,
      jsonBody,
      url,
      info
    }
    const responseListener = new ResponseListener()
    const request = this._http.request(url, options)
    request
      .on('error', (error) => {
        this.emit('error', error instanceof HttpError ? error : new HttpError(error.message, requestInfo))
      })
      .on('timeout', () => {
        const error = new HttpError(
          `timeout after ${this.__options.timeout} seconds`,
          requestInfo,
          { request: requestInfo, statusCode: 408, statusMessage: 'Request Timeout' }
        )
        request.destroy(error)
      })
      .on('socket', (socket: TLSSocket) => {
        if (
          this.__options.address == null || this.__options.localAddress == null
        ) {
          socket.once('connect', () => {
            const { remoteAddress, localAddress } = socket
            this.__options.address = remoteAddress
            this.__options.localAddress = localAddress
          })
        }
        this.emit('request', requestInfo)
        if (
          this.__options.selfSignedCertificate &&
          this.__options.checkServerIdentity != null
        ) {
          socket.once('secureConnect', () => {
            const cert = socket.getPeerCertificate()
            if (Object.keys(cert).length === 0) {
              return
            }
            const error = this.__options.checkServerIdentity?.(this.__options.hostname, cert)
            if (error != null) {
              request.destroy(error)
            }
          })
        }
      })
      .on('response', (response) => {
        const chunks: Buffer[] = []
        response
          .on('data', (chunk: Buffer) => { chunks.push(chunk) })
          .on('end', () => {
            const buffer = Buffer.concat(chunks)
            const responseInfo: HttpResponse = {
              request: requestInfo,
              headers: response.headers,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
              rawBody: buffer.length > 0 ? buffer : undefined
            }
            responseListener.emit('response', responseInfo)
          })
      })

    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, value)
    }
    request.end(rawBody ?? body)

    const a = await once(responseListener, 'response')
    if (a[0] == null || !isHttpResponse(a[0])) {
      throw new Error('invalid response received')
    }
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- no
    const response = a[0]

    const errorMessages = []
    const { type, charset } = contentType(response.headers)
    if (response.rawBody !== undefined) {
      if (type.startsWith('text/') || type.endsWith('/json') || type.endsWith('/xml')) {
        try {
          response.body = response.rawBody.toString(charset)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errorMessages.push(`response contains invalid text: ${message}`)
        }
      }
      if (response.body !== undefined) {
        if (type.endsWith('/json')) {
          try {
            const json: unknown = JSON.parse(response.rawBody.toString(charset))
            if (isJson(json)) {
              response.jsonBody = json
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            errorMessages.push(`response contains invalid json: ${message}`)
          }
        } else if (type.endsWith('/xml') && this.__options.xmlParser != null) {
          try {
            response.xmlBody = await this.__options.xmlParser(response.body)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            errorMessages.push(`response contains invalid xml: ${message}`)
          }
        }
      }
    }

    request.emit('response', response)

    if (
      response.body == null && response.statusCode != null &&
      !this.__options.validStatusCodes.includes(response.statusCode)
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
          errorMessage, requestInfo, response
        ))
      }
    }

    return response
  }

  #logError (error: HttpError): void {
    const { request } = error
    if (request.id !== this.__errorRequestId) {
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- no
      this.__errorRequestId = error.request.id
      const action = request.action ?? request.jsonBody ?? request.body
      if (action == null) {
        this.log(
          '%s: request %s: %s %s', this.name, request.id,
          request.method, request.resource
        )
      } else {
        this.log(
          '%s: request %s: %s %s %j', this.name, request.id,
          request.method, request.resource, action
        )
      }
    }
    this.warn(
      '%s: request %d: %s', request.name, request.id, error
    )
  }

  #logRequest (request: HttpRequest): void {
    const action = request.action ?? request.jsonBody ?? request.body
    if (action == null) {
      this.debug(
        '%s: request %s: %s %s', this.name, request.id,
        request.method, request.resource
      )
    } else {
      this.debug(
        '%s: request %s: %s %s %j', this.name, request.id,
        request.method, request.resource, action
      )
    }
    const body = request.jsonBody ?? request.body
    if (body == null) {
      this.vdebug(
        '%s: request %s: %s %s', this.name, request.id,
        request.method, request.url
      )
    } else {
      this.vdebug(
        '%s: request %s: %s %s %j', this.name, request.id,
        request.method, request.url, body
      )
    }
    if (Object.keys(request.headers).length > 0) {
      this.vvdebug(
        '%s: request %s: headers: %j', this.name, request.id,
        request.headers
      )
    }
    if (request.body == null && request.rawBody != null) {
      this.vvdebug(
        '%s: request %s: body: %s', this.name, request.id,
        toHexString(request.rawBody)

      )
    }
  }

  #logResponse (response: HttpResponse): void {
    this.debug(
      '%s: request %d: http status %d %s', this.name, response.request.id,
      response.statusCode, response.statusMessage
    )
    this.vvdebug(
      '%s: request %d: response headers: %j', this.name, response.request.id,
      response.headers
    )
    if (response.xmlBody != null) {
      this.vvdebug(
        '%s: request %d: response body: %j', this.name, response.request.id, response.body
      )
    }
    const body = response.xmlBody ?? response.jsonBody ?? response.body
    if (body == null) {
      if (response.rawBody != null) {
        this.vvdebug(
          '%s: request %d: response: %s', this.name, response.request.id, toHexString(response.rawBody)
        )
      }
    } else {
      this.vdebug(
        '%s: request %d: response: %j', this.name, response.request.id, response.body
      )
    }
  }
}
