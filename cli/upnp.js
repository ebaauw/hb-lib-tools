#!/usr/bin/env node

// upnp.js
//
// Logger for UPnP device announcements.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { UpnpTool } from 'hb-lib-tools/UpnpTool'

await new UpnpTool().main()
