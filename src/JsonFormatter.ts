// hb-lib-tools/src/JsonFormatter.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { integer, path } from 'hb-lib-tools/OptionParser'

/** JSON formatter.
  * <br>See {@link JsonFormatter}.
  * @name JsonFormatter
  * @type {Class}
  * @memberof module:hb-lib-tools
  */

/** JSON formatter.
  *
  * Class to format (pretty-print) JavaScript types to formatted JSON strings.
  * This class is the engine under the `json` command-line tool.
  */
class JsonFormatter {
  private options

  /** Create a new instance of a JSON formatter.
    *
    * The parameters configure how the JSON should be formatted.
    * @param {object} params - Parameters.
    * @param {boolean} [params.ascii=false] - Output path:value in plain text
    * instead of JSON.
    * <br>Command-line equivalent: `json -a`
    * @param {string} params.fromPath - Limit output to key/values under path.
    * <br>Set top level below path.
    * <br>Command-line equivalent: `json -p `_path_
    * @param {boolean} [params.jsonArray=false] - Output JSON array of objects
    * for each key/value pair.<br>
    * Each object contains two key/value pairs: key `keys` with an array
    * of keys as value and key `value` with the value as value.
    * <br>Command-line equivalent: `json -j`
    * @param {boolean} [params.joinKeys=false] - Output JSON array of objects
    * for each key/value pair.<br>
    * Each object contains one key/value pair: the path (concatenated
    * keys separated by '/') as key and the value as value.
    * <br>Command-line equivalent: `json -u`
    * @param {boolean} [params.keysOnly=false] -  Limit output to keys.
    * <br>With `joinKeys` output JSON array of paths.
    * <br>Command-line equivalent: `json -k`
    * @param {boolean} [params.leavesOnly=false] -  Limit output to leaf
    * (non-array, non-object) key/values.
    * <br>Command-line equivalent: `json -l`
    * @param {?integer} params.maxDepth - Limit output to levels above depth.
    * <br>Command-line equivalent: `json -d `_depth_
    * @param {boolean} [params.noWhiteSpace=false] - Do not include spaces nor
    * newlines in the output.
    * <br>Command-line equivalent: `json -n`
    * @param {boolean} [params.sortKeys=false] - Sort object key/value pairs
    * alphabetically on key.
    * <br>Command-line equivalent: `json -s`
    * @param {boolean} [params.topOnly=false] - Limit output to top-level key/values.
    * <br>Command-line equivalent: `json -t`
    * @param {boolean} [params.valuesOnly=false] -  Limit output to values.
    * <br>With `joinKeys` output JSON array of values.
    * <br>Command-line equivalent: `json -v`
    */
  constructor (params: {
    ascii?: boolean
    fromPath?: path
    jsonArray?: boolean
    joinKeys?: boolean
    keysOnly?: boolean
    leavesOnly?: boolean
    maxDepth?: integer
    noWhiteSpace?: boolean
    sortKeys?: boolean
    topOnly?: boolean
    valuesOnly?: boolean
  } = {}) {
    this.options = {
      ascii: params.ascii ?? false,
      fromPath: params.fromPath,
      jsonArray: params.jsonArray ?? false,
      joinKeys: params.joinKeys ?? false,
      keysOnly: params.keysOnly ?? false,
      leavesOnly: params.leavesOnly ?? false,
      maxDepth: params.maxDepth ?? Number.MAX_SAFE_INTEGER,
      noWhiteSpace: params.noWhiteSpace ?? false,
      sortKeys: params.sortKeys ?? false,
      topOnly: params.topOnly ?? false,
      valuesOnly: params.valuesOnly ?? false
    }
    if (this.options.ascii) {
      this.options.noWhiteSpace = true
      this.options.joinKeys = true
    }
    if (
      this.options.joinKeys || this.options.topOnly || this.options.leavesOnly ||
      this.options.keysOnly || this.options.valuesOnly
    ) {
      this.options.jsonArray = true
    }
  }

  #forEach (value: unknown, callback: (keys: string[], value: unknown) => void): void {
    const forEach: (keys: string[], value: unknown, depth: number) => void = (keys, value, depth) => {
      const isCollection = (typeof (value) === 'object' && value != null)

      if (value === undefined) {
        return
      }
      if (
        !isCollection ||
        (!this.options.leavesOnly && (!this.options.topOnly || depth === 1))
      ) {
        callback(keys, value)
      }
      if (
        isCollection && (!this.options.topOnly || depth === 0) &&
        depth !== this.options.maxDepth
      ) {
        const list = Object.keys(value)
        if (this.options.sortKeys && !Array.isArray(value)) {
          list.sort()
        }
        for (const key of list) {
          forEach(keys.concat([key]), (value as Record<string, unknown>)[key], depth + 1)
        }
      }
    }

    forEach([], value, 0)
  }

  #map (value: unknown, callback: (keys: string[], value: unknown) => unknown): unknown[] {
    const array: unknown[] = []
    this.#forEach(value, (keys, value) => {
      array.push(callback(keys, value))
    })
    return array
  }

  #format (value: unknown, maxDepth: integer = this.options.maxDepth, withIndent: string = '  '): string {
    const format = (value: unknown, depth: integer, indent: string): string => {
      const noNewline = this.options.noWhiteSpace || (maxDepth != null && depth >= maxDepth)
      const nl = this.options.noWhiteSpace ? '' : noNewline ? ' ' : '\n'
      const sp = this.options.noWhiteSpace ? '' : ' '
      const nlsp = noNewline ? '' : '\n'
      const wi = noNewline ? '' : withIndent
      const id = noNewline ? '' : indent

      if (value === undefined) {
        return ''
      }
      if (typeof (value) !== 'object' || value == null) {
        return JSON.stringify(value)
      }
      const array = []
      const list = Object.keys(value)
      if (this.options.sortKeys && !Array.isArray(value)) {
        list.sort()
      }
      for (const key of list) {
        if ((value as Record<string, unknown>)[key] !== undefined) {
          const k = Array.isArray(value) ? '' : `"${key}":${sp}`
          const v = format((value as Record<string, unknown>)[key], depth + 1, `${wi}${id}`)
          array.push(k + v)
        }
      }
      let s = array.join(`,${nl}${wi}${id}`)
      if (s !== '') {
        s = `${nlsp}${wi}${id}${s}${nlsp}${id}`
      }
      return Array.isArray(value) ? `[${s}]` : `{${s}}`
    }
    return format(value, 0, '')
  }

  /** Transform javascript value into a formatted JSON string.
    *
    * @param {*} value - The JavaScript value.
    * @return {string} json - The formatted JSON string.
    */
  stringify (value: unknown): string {
    if (this.options.fromPath != null) {
      const a = this.options.fromPath!.slice(1).split('/')
      for (const key of a) {
        if (typeof (value) === 'object' && value != null) {
          value = (value as Record<string, unknown>)[key]
        } else {
          value = undefined
        }
      }
    }
    if (!this.options.jsonArray) {
      return this.#format(value)
    }
    const array = this.#map(value, (keys, value) => {
      if (this.options.ascii) {
        if (this.options.keysOnly) { return `/${keys.join('/')}` }
        if (this.options.valuesOnly) { return this.#format(value) }
        return `/${keys.join('/')}:${this.#format(value)}`
      } else if (this.options.joinKeys) {
        if (this.options.keysOnly) { return `/${keys.join('/')}` }
        if (this.options.valuesOnly) { return value }
        const obj = {} as Record<string, unknown>
        obj[`/${keys.join('/')}`] = value
        return obj
      } else {
        if (this.options.keysOnly) { return { keys } }
        if (this.options.valuesOnly) { return { value } }
        return { keys, value }
      }
    })
    if (this.options.ascii) {
      return array.join('\n')
    }
    return this.#format(array, 1)
  }
}

export { JsonFormatter }
