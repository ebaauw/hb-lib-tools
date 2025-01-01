// hb-lib-tools/lib/Bonjour.js
//
// Library for Homebridge plugins.
// Copyright © 2016-2025 Erik Baauw. All rights reserved.

import b from 'bonjour-hap'

/** Return the `Bonjour` class from [`bonjour-hap`](https://github.com/homebridge/bonjour),
  * so plugins don't have to list this as a separate dependency.
  * @name Bonjour
  * @type {Class}
  * @memberof module:hb-lib-tools
  */
export const Bonjour = b
