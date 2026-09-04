// hb-lib-tools/src/semver.ts
//
// Library for Homebridge plugins.
// Copyright © 2016-2026 Erik Baauw. All rights reserved.

/** Return the [`semver`](https://github.com/npm/node-semver) module,
  * so plugins don't have to install this as a separate dependency.
  *
  * To use `semver`, issue:
  * ```typescript
  * import { semver } from 'hb-lib-tools/semver'
  * ```
  * @module
  */

import semver from 'semver'

export { semver }
