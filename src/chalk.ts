// hb-lib-tools/lib/chalk.js
//
// Library for Homebridge plugins.
// Copyright © 2016-2026 Erik Baauw. All rights reserved.

import c from 'chalk'

c.level = 2 // Force chalk to use 256 colours, even when not running in a terminal.

/** Return the [`chalk`](https://github.com/chalk/chalk) module,
  * so plugins don't have to list this as a separate dependency.
  * @name chalk
  * @memberof module:hb-lib-tools
  */
export const chalk = c
