// hb-lib-tools/lib/chalk.js
//
// Library for Homebridge plugins.
// Copyright © 2016-2025 Erik Baauw. All rights reserved.

import s from 'semver'

/** Return the [`semver`](https://github.com/npm/node-semver) module,
  * so plugins don't have to list this as a separate dependency.
  * @name semver
  * @memberof module:hb-lib-tools
  */
export const semver = s
