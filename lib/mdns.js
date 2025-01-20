// hb-lib-tools/lib/mdns.js
//
// Library for Homebridge plugins.
// Copyright © 2016-2025 Erik Baauw. All rights reserved.

import m from 'mdns'

/** Return the [`mdns`](https://github.com/agnat/node_mdns) module,
  * so plugins don't have to list this as a separate dependency.
  * @name mdns
  * @memberof module:hb-lib-tools
  */
export const mdns = m
