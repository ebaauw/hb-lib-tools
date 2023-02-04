#!/usr/bin/env node

// hap.js
//
// Logger for HomeKit accessory announcements.
// Copyright © 2018-2023 Erik Baauw. All rights reserved.

'use strict'

const { HapTool } = require('homebridge-lib')

new HapTool().main()
