Copyright © 2017-2026 Erik Baauw. All rights reserved.

## Introduction
This repository contains command-line tools and supporting utility classes for 
[homebridge-lib](https://github.com/ebaauw/homebridge-lib).

### Command-Line Utilities
The Homebridge Lib Tools library comes with a number of command-line tools for troubleshooting Homebridge installations.

Tool      | Description
--------- | -----------
`hap`     | Logger for HomeKit accessory announcements.
`json`    | JSON formatter.
`sysinfo` | Print hardware and operating system information.
`upnp`    | Logger for UPnP device announcements.

Each command-line tool takes a `-h` or `--help` argument to provide a brief overview of its functionality and command-line arguments.

### Utility Classes
The Homebridge Lib Tools library provides a number of utility classes for Homebridge plugins and/or command-line tools.

Class                      | Description
-------------------------- | -----------
{@link Colour}             | Colour conversions.
{@link CommandLineParser}  | Parser and validator for command-line arguments.
{@link CommandLineTool}    | Command-line tool.
{@link HttpClient}         | HTTP client.
{@link JsonFormatter}      | JSON formatter.
{@link OptionParser}       | Parser and validator for options and other parameters.
{@link SystemInfo}         | System information.
{@link UpnpClient}         | Universal Plug and Play client.
