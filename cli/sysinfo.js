#!/usr/bin/env node

// sysinfo.js
//
// Print hardware and operating system information.
// Copyright © 2018-2024 Erik Baauw. All rights reserved.

'use strict'

const { SysinfoTool } = require('../index')

new SysinfoTool().main()
