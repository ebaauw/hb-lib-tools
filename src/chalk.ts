// hb-lib-tools/src/chalk.ts
//
// Library for Homebridge plugins.
// Copyright © 2016-2026 Erik Baauw. All rights reserved.

/** Return the [`chalk`](https://github.com/chalk/chalk) module,
  * so plugins don't have to install this as a separate dependency.
  * 
  * To use `chalk`, issue:
  * ```typescript
  * import { chalk } from 'hb-lib-tools/chalk'
  * ```
  * @module
  */

import chalk, { ChalkInstance } from 'chalk'

chalk.level = 2 // Force chalk to use 256 colours, even when not running in a terminal.

export type { ChalkInstance }
export { chalk }
