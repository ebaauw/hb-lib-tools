// hb-lib-tools/src/HttpClient.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'
import type { PeerCertificate, TLSSocket } from 'node:tls'
import type { Logger, integer, jsonMap } from 'hb-lib-tools'
import type { host, path } from 'hb-lib-tools/OptionParser'

import { EventEmitter, once } from 'node:events'
import http from 'node:http'
import https from 'node:https'

import { toHost, toInt, toObject, toPath, toString } from 'hb-lib-tools/OptionParser'

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
  /** Request body. */
  body?: unknown,
  /** Request body as JSON string. */
  jsonBody?: string,
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
  /** The HTTP response body. */
  body?: unknown
  /** The raw HTTP response body. */
  rawBody?: unknown
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
  checkServerIdentity?(hostname: string, cert: PeerCertificate): Error | undefined,
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
  xmlParser?(xml: string): Promise<jsonMap>
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

  protected warn(format: string | Error, ...args: unknown[]): void {
    this.__options.logger?.warn(format, ...args)
  }

  protected log(format: string | Error, ...args: unknown[]): void {
    this.__options.logger?.log(format, ...args)
  }

  protected debug(format: string | Error, ...args: unknown[]): void {
    this.__options.logger?.debug(format, ...args)
  }

  protected vdebug(format: string | Error, ...args: unknown[]): void {
    this.__options.logger?.vdebug(format, ...args)
  }

  protected vvdebug(format: string | Error, ...args: unknown[]): void {
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
      port: port ?? ((options.https ?? false) ? 443 : 80), // eslint-disable-line @typescript-eslint/no-magic-numbers -- default ports
      selfSignedCertificate: options.selfSignedCertificate ?? false,
      suffix: options.suffix ?? '',
      text: options.text ?? false,
      timeout: options.timeout === undefined
        ? 5 // eslint-disable-line @typescript-eslint/no-magic-numbers -- default timeout (seconds)
        : toInt(options.timeout, { key: 'options.timeout', min: 1, max: 60 }),
      validStatusCodes: options.validStatusCodes ?? [200], // eslint-disable-line @typescript-eslint/no-magic-numbers -- default valid status codes
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
      family: this.__options.ipv6 ? 6 : 4, // eslint-disable-line @typescript-eslint/no-magic-numbers -- 4=IPv4, 6=IPv6
      headers,
      timeout: this.__options.timeout * 1000 // eslint-disable-line @typescript-eslint/no-magic-numbers -- s -> ms
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
    this.__options.port = port ?? (this.__options.https ? 443 : 80) // eslint-disable-line @typescript-eslint/no-magic-numbers -- default ports
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
    return await this.request('GET', resource, undefined, headers, suffix)
  }

  /** PUT request. */
  async put (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: unknown,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request('PUT', resource, body, headers, suffix)
  }

  /** POST request. */
  async post (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: unknown,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request('POST', resource, body, headers, suffix)
  }

  /** DELETE request. */
  async delete (
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: unknown,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix?: string
  ): Promise<HttpResponse> {
    return await this.request('DELETE', resource, body, headers, suffix)
  }

  /** Issue an HTTP request. */
  async request ( // eslint-disable-line @typescript-eslint/max-params -- ignore
    /** The HTTP method. */
    method: string,
    /** The resource. */
    resource: path,
    /** The body for the request. */
    body?: unknown,
    /** Additional headers for the request. */
    headers?: Record<string, string>,
    /** Additional suffix to append after resource */
    suffix = '',
    /** Additional key/value pairs to include in the request info. */
    info: jsonMap = {}
  ): Promise<HttpResponse> {
    method = toString(method, { key: 'method', nonEmpty: true }).toUpperCase() // eslint-disable-line no-param-reassign -- ignore
    if (!http.METHODS.includes(method)) {
      throw new TypeError(`${method}: invalid method`)
    }
    resource = toPath(resource, { key: 'resource' }) // eslint-disable-line no-param-reassign -- ignore
    if (body != null && !Buffer.isBuffer(body)) {
      body = this.__options.json // eslint-disable-line no-param-reassign -- ignore
        ? JSON.stringify(body)
        : toString(body, { key: 'body' })
    }
    this.__requestId += 1
    const { __requestId: requestId } = this
    const url = this.__options.url + (resource === '/' ? '' : resource) +
                this.__options.suffix + suffix
    const options: http.RequestOptions = { method, ...this.__httpOptions }
    const requestInfo: HttpRequest = {
      name: this.name,
      headers: headers ?? {},
      id: requestId,
      method,
      resource,
      body,
      url,
      info
    }
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
          .on('end', async (): Promise<void> => { // eslint-disable-line complexity, @typescript-eslint/no-misused-promises -- ignore
            const buffer = Buffer.concat(chunks)
            const responseInfo: HttpResponse = {
              request: requestInfo,
              headers: response.headers,
              statusCode: response.statusCode,
              statusMessage: response.statusMessage,
              body: buffer.length > 0 ? buffer : null
            }
            const errorMessages = []

            const a = response.headers['content-type']?.split(';')
            const contentType = a?.[0]
            const charset = (a?.[1]?.split('=')[1]?.replace(/"/gv, '') ?? 'utf-8') as BufferEncoding
            if (
              contentType != null && (
                contentType.startsWith('text/') ||
                contentType.endsWith('/json') ||
                contentType.endsWith('/xml')
              )
            ) {
              try {
                responseInfo.body = buffer.toString(charset)
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                errorMessages.push(`response contains invalid text: ${message}`)
              }
            }
            if (typeof responseInfo.body === 'string') {
              if (contentType?.endsWith('/json') ?? false) {
                try {
                  responseInfo.body = JSON.parse(responseInfo.body)
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error)
                  errorMessages.push(`response contains invalid json: ${message}`)
                }
              } else if ((contentType?.endsWith('/xml') ?? false) && this.__options.xmlParser != null) {
                try {
                  responseInfo.rawBody = responseInfo.body // eslint-disable-line @typescript-eslint/prefer-destructuring -- ignore
                  responseInfo.body = await this.__options.xmlParser(responseInfo.body)
                } catch (error) {
                  responseInfo.rawBody = null
                  const message = error instanceof Error ? error.message : String(error)
                  errorMessages.push(`response contains invalid xml: ${message}`)
                }
              }
            }
            this.emit('response', responseInfo)

            if (
              responseInfo.body == null &&
              responseInfo.statusCode != null &&
              !this.__options.validStatusCodes.includes(responseInfo.statusCode)
            ) {
              errorMessages.push(`http status ${responseInfo.statusCode} ${responseInfo.statusMessage}`)
            }
            if (errorMessages.length > 0) {
              for (const errorMessage of errorMessages) {
                /** Emitted in case of error.
                  * @event HttpClient#error
                  * @param {HttpClient.HttpError} error - The error.
                  */
                this.emit('error', new HttpError(
                  errorMessage, requestInfo, responseInfo
                ))
              }
              return
            }
            this.emit(`${requestId}`, responseInfo)
          })
      })

    if (headers != null) {
      headers = toObject(headers, { key: 'headers' }) as Record<string, string>
      for (const header in headers) {
        request.setHeader(header, headers[header])
      }
    }
    requestInfo.headers = request.getHeaders()
    request.end(body)
    const a = await once(this, `${requestId}`)
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
