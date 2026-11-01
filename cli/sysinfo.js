#!/usr/bin/env node

// sysinfo.js
//
// Get hardware and operating system information.
// Copyright © 2018-2026 Erik Baauw. All rights reserved.

import { SysinfoTool } from 'hb-lib-tools/SysinfoTool'

await new SysinfoTool().main()
