// hb-lib-tools/src/JsonFormatter.ts
//
// Library for Homebridge plugins.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

/** JSON formatter.
  * @module
  */

import type { integer, json, jsonMap } from 'hb-lib-tools'
import type { path } from 'hb-lib-tools/OptionParser'

const isSimple = (value: json): boolean => {
  return value === null || ['boolean', 'number', 'string'].includes(typeof value)
}

/** {@link JsonFormatter} options. */
export type Options = {
  /** Output _path_`:`_value_ in plain text instead of JSON.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -a`.
    */
  ascii?: boolean,
  /** Limit output to key/values under path.
    * Set top level below path.
    *
    * Command-line equivalent: `json -p `_path_
    */
  fromPath?: path,
  /** Output JSON array of objects for each key/value pair.
    * Each object contains two key/value pairs: key `keys` with an array
    * of keys as value and key `value` with the value as value.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -j`
    */
  jsonArray?: boolean,
  /** Output JSON array of objects for each key/value pair.
    * Each object contains one key/value pair: the path (concatenated
    * keys separated by '/') as key and the value as value.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -u`
    */
  joinKeys?: boolean,
  /** Limit output to keys.
    * <br>With `joinKeys` output JSON array of paths.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -k`
    */
  keysOnly?: boolean,
  /** Limit output to leaf (non-array, non-object) key/values.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -l`
    */
  leavesOnly?: boolean,
  /** Limit output to levels above depth.
    *
    * Default: `Number.MAX_SAFE_INTEGER`.
    *  
    * Command-line equivalent: `json -d `_depth_
    */
  maxDepth?: integer,
  /** Do not include spaces nor newlines in the output.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -n`
    */
  noWhiteSpace?: boolean,
  /** Sort object key/value pairs alphabetically on key.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -s`
    */
  sortKeys?: boolean,
  /** Limit output to top-level key/values.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -t`
    */
  topOnly?: boolean,
  /** Limit output to values.
    * <br>With `joinKeys` output JSON array of values.
    *
    * Default: `false`.
    *  
    * Command-line equivalent: `json -v`
    */
  valuesOnly?: boolean
}

/** JSON formatter.
  *
  * Class to format (pretty-print) JavaScript types to formatted JSON strings.
  * This class is the engine under the {@link JsonTool json} command-line tool.
  */
class JsonFormatter {
  private readonly options

  /** Create a new instance of a JSON formatter. */
  constructor (
    /** Options to configure how the JSON should be formatted. */
    options: Options = {}
  ) {
    this.options = {
      ascii: options.ascii ?? false,
      fromPath: options.fromPath,
      jsonArray: options.jsonArray ?? false as boolean,
      joinKeys: options.joinKeys ?? false,
      keysOnly: options.keysOnly ?? false,
      leavesOnly: options.leavesOnly ?? false,
      maxDepth: options.maxDepth ?? Number.MAX_SAFE_INTEGER,
      noWhiteSpace: options.noWhiteSpace ?? false,
      sortKeys: options.sortKeys ?? false,
      topOnly: options.topOnly ?? false,
      valuesOnly: options.valuesOnly ?? false
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

  #forEach (value: json, callback: (keys: string[], value: json) => void): void {
    const forEach: (keys: string[], value: json, depth: number) => void = (keys, value, depth) => {
      if (
        isSimple(value) &&
        (!this.options.leavesOnly && (!this.options.topOnly || depth === 1))
      ) {
        callback(keys, value)
        return
      }
      if (
        (!this.options.topOnly || depth === 0) &&
        depth !== this.options.maxDepth
      ) {
        value = value as jsonMap
        const list = Object.keys(value)
        if (this.options.sortKeys && !Array.isArray(value)) {
          list.sort()
        }
        for (const key of list) {
          forEach(keys.concat([key]), value[key], depth + 1)
        }
      }
    }

    forEach([], value, 0)
  }

  #map (value: json, callback: (keys: string[], value: json) => json): json[] {
    const array: json[] = []
    this.#forEach(value, (keys, value) => {
      array.push(callback(keys, value))
    })
    return array
  }

  #format (value: json, maxDepth: integer = this.options.maxDepth, withIndent: string = '  '): string {
    const format = (value: json, depth: integer, indent: string): string => {
      const noNewline = this.options.noWhiteSpace || (maxDepth != null && depth >= maxDepth)
      const nl = this.options.noWhiteSpace ? '' : noNewline ? ' ' : '\n'
      const sp = this.options.noWhiteSpace ? '' : ' '
      const nlsp = noNewline ? '' : '\n'
      const wi = noNewline ? '' : withIndent
      const id = noNewline ? '' : indent

      if (isSimple(value)) {
        return JSON.stringify(value)
      }
      value = value as jsonMap
      const array = []
      const list = Object.keys(value)
      if (this.options.sortKeys && !Array.isArray(value)) {
        list.sort()
      }
      for (const key of list) {
        if (value[key] !== undefined) {
          const k = Array.isArray(value) ? '' : `"${key}":${sp}`
          const v = format(value[key], depth + 1, `${wi}${id}`)
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
    * @return The formatted JSON string.
    */
  stringify (
    /* * The JavaScript value to format as JSON. */
    value: json
  ): string | null{
    if (this.options.fromPath != null) {
      const a = this.options.fromPath!.slice(1).split('/')
      for (const key of a) {
        if (typeof value === 'object' && value != null) {
          value = (value as jsonMap)[key]
        } else {
          return null
        }
      }
    }
    if (!this.options.jsonArray) {
      return this.#format(value)
    }
    const array = this.#map(value, (keys: string[], value: json) => {
      if (this.options.ascii) {
        if (this.options.keysOnly) { return `/${keys.join('/')}` }
        if (this.options.valuesOnly) { return this.#format(value) }
        return `/${keys.join('/')}:${this.#format(value)}`
      } else if (this.options.joinKeys) {
        if (this.options.keysOnly) { return `/${keys.join('/')}` }
        if (this.options.valuesOnly) { return value }
        const obj: jsonMap = {}
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
