// hb-lib-tools/src/Colour.ts
//
// Library for Homebridge plugins.
// Copyright © 2016-2026 Erik Baauw. All rights reserved.

/** Colour utilities.
  * Zigbee uses the [CIE 1931](https://en.wikipedia.org/wiki/CIE_1931_color_space) `xy` colour space.
  * HomeKit uses the [sRGB](https://en.wikipedia.org/wiki/SRGB) colour space,
  * expressed in [HSV](https://en.wikipedia.org/wiki/HSL_and_HSV).
  * This module provides functions to convert between these colour spaces.
  * @module
  */

import type { integer } from 'hb-lib-tools'

type point = {
  x: number,
  y: number
}

/** [CIE 1931](https://en.wikipedia.org/wiki/CIE_1931_color_space) `xy` coordinates,
  * between 0.0 and 1.0, used by Zigbee.
  */
export type xy = [number, number]

function pointToXy (p: point): xy { return [p.x, p.y] }
function xyToPoint (xy: xy): point { return { x: xy[0], y: xy[1] } }

/** Colour [gamut](https://en.wikipedia.org/wiki/Gamut).
  */
export type gamut = {
  /** `xy` coordinates for red, between 0.0 and 1.0. */
  r: xy
  /** `xy` coordinates for green, between 0.0 and 1.0. */
  g: xy
  /** `xy` coordinates for blue, between 0.0 and 1.0. */
  b: xy
}

/** [sRGB](https://en.wikipedia.org/wiki/SRGB) colour in
  * [HSV](https://en.wikipedia.org/wiki/HSL_and_HSV).
  */
export type hsv = {
  /** Hue, between 0˚ and 360˚. */
  h: integer,
  /** Saturation, between 0% and 100%. */
  s: integer,
  /** Value, between 0% and 100%. */
  v: integer
}

/** [sRGB](https://en.wikipedia.org/wiki/SRGB) colour in
  * [RGB color model](https://en.wikipedia.org/wiki/RGB_color_model).
  */
export type rgb = {
  /** Red, between 0.0 and 1.0. */
  r: number,
  /** Green, between 0.0 and 1.0. */
  g: number,
  /** Blue, between 0.0 and 1.0. */
  b: number
}

/** Safe default gamut taking into account:
  * - The maximum value for `CurrentX` and  `CurrentY`, 65279 (0xFEFF),
  *   as defined by the ZCL spec;
  * - A potential division by zero error for `CurrentY`, when translating the
  *   {@link xy} values back to {@link hsv}.
  */
export const defaultGamut: gamut = {
  r: [0.9961, 0.0001],
  g: [0, 0.9961],
  b: [0, 0.0001]
}

const gamutPhilips = {
  A: {
    r: [0.7040, 0.2960],
    g: [0.2151, 0.7106],
    b: [0.1380, 0.0800]
  },
  B: {
    r: [0.6750, 0.3220],
    g: [0.4090, 0.5180],
    b: [0.1670, 0.0400]
  },
  C: {
    r: [0.6920, 0.3080],
    g: [0.1700, 0.7000],
    b: [0.1530, 0.0480]
  }
}

/** Known colour gamuts by manufacturer.
  */
export const gamutByManufacturer = {
  GLEDOPTO: {
    r: [0.7006, 0.2993],
    g: [0.1387, 0.8148],
    b: [0.1510, 0.0227]
  },
  'IKEA of Sweden': {
    r: [0.68, 0.31],
    g: [0.11, 0.82],
    b: [0.13, 0.04]
  },
  innr: {
    r: [0.8817, 0.1033],
    g: [0.2204, 0.7758],
    b: [0.0551, 0.1940]
  },
  LEDVANCE: {
    r: [0.6972, 0.3027],
    g: [0.1737, 0.6991],
    b: [0.1227, 0.0959]
  },
  MLI: {
    r: [0.68, 0.31],
    g: [0.11, 0.82],
    b: [0.13, 0.04]
  },
  OSRAM: {
    r: [0.6850, 0.3149],
    g: [0.1780, 0.7253],
    b: [0.1241, 0.0578]
  },
  Philips: gamutPhilips,
  'Signify Netherlands B.V.': gamutPhilips
}

// Return point in color gamut closest to p.
function closestInGamut (p: point, gamut: gamut): point {
  // Return cross product of two points.
  function crossProduct (p1: {x: number, y: number}, p2: {x: number, y: number}) {
    return p1.x * p2.y - p1.y * p2.x
  }

  // Return distance between two points.
  function distance (p1: point, p2: point): number {
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Return point on line a,b closest to p.
  function closest (a: point, b: point, p: point): point {
    const ap = { x: p.x - a.x, y: p.y - a.y }
    const ab = { x: b.x - a.x, y: b.y - a.y }
    let t = (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y)
    t = t < 0.0 ? 0.0 : t > 1.0 ? 1.0 : t
    return { x: a.x + t * ab.x, y: a.y + t * ab.y }
  }

  const r = xyToPoint(gamut.r)
  const g = xyToPoint(gamut.g)
  const b = xyToPoint(gamut.b)
  const v1 = { x: g.x - r.x, y: g.y - r.y }
  const v2 = { x: b.x - r.x, y: b.y - r.y }
  const v = crossProduct(v1, v2)
  const q = { x: p.x - r.x, y: p.y - r.y }
  const s = crossProduct(q, v2) / v
  const t = crossProduct(v1, q) / v
  if (s >= 0.0 && t >= 0.0 && s + t <= 1.0) {
    return p
  }
  const pRG = closest(r, g, p)
  const pGB = closest(g, b, p)
  const pBR = closest(b, r, p)
  const dRG = distance(p, pRG)
  const dGB = distance(p, pGB)
  const dBR = distance(p, pBR)
  let min = dRG
  p = pRG
  if (dGB < min) {
    min = dGB
    p = pGB
  }
  if (dBR < min) {
    p = pBR
  }
  return p
}

/** Convert {@link hsv} to {@link rgb}.
  *
  * See [HSL and HSV](https://en.wikipedia.org/wiki/HSL_and_HSV).
  * @param h - Hue, between 0˚ and 360˚.
  * @param s - Saturation, between 0% and 100%.
  * @param v - Value, between 0% and 100%.
  * @return The corresponding {@link rgb} value.
  */
export function hsvToRgb (h: number, s: number, v: number = 100): rgb {
  h /= 60.0
  s /= 100.0
  v /= 100.0
  const C = v * s
  const m = v - C
  let x = (h % 2) - 1.0
  if (x < 0) {
    x = -x
  }
  x = C * (1.0 - x)
  let r!: number, g!: number, b!: number
  switch (Math.floor(h) % 6) {
    case 0: r = C + m; g = x + m; b = m; break
    case 1: r = x + m; g = C + m; b = m; break
    case 2: r = m; g = C + m; b = x + m; break
    case 3: r = m; g = x + m; b = C + m; break
    case 4: r = x + m; g = m; b = C + m; break
    case 5: r = C + m; g = m; b = x + m; break
  }
  return { r, g, b }
}

/**
  * Convert {@link rgb} to {@link hsv}.
  *
  * See [HSL and HSV](https://en.wikipedia.org/wiki/HSL_and_HSV).
  * @param r - Red, between 0.0 and 1.0.
  * @param g - Green, between 0.0 and 1.0.
  * @param b - Blue, between 0.0 and 1.0.
  * @return The corresponding {@link hsv} value.
  */
export function rgbToHsv (r: number, g: number, b: number): hsv {
  const M = Math.max(r, g, b)
  const m = Math.min(r, g, b)
  const C = M - m
  const S = (M === 0.0) ? 0.0 : C / M
  let H!: number
  switch (M) {
    case m:
      H = 0.0
      break
    case r:
      H = (g - b) / C
      if (H < 0) {
        H += 6.0
      }
      break
    case g:
      H = (b - r) / C
      H += 2.0
      break
    case b:
      H = (r - g) / C
      H += 4.0
      break
  }
  return {
    h: Math.round(H * 60.0),
    s: Math.round(S * 100.0),
    v: Math.round(M * 100.0)
  }
}

/**
  * Transform {@link hsv} to {link xy}.
  *
  * See [Hue developer portal](https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/).
  * @param h - Hue, between 0˚ and 360˚.
  * @param s - Saturation, between 0% and 100%.
  * @param gamut - The gamut supported by the light.
  * @return - The closest matching CIE 1931 colour, x, y between 0.0000 and 1.0000.
  */
export function hsvToXy (h: number, s: number, gamut: gamut = defaultGamut): xy {
  // Gamma correction (inverse sRGB Companding).
  function invCompand (v: number) {
    return v > 0.04045 ? Math.pow((v + 0.055) / (1.0 + 0.055), 2.4) : v / 12.92
  }

  let { r, g, b } = hsvToRgb(h, s)

  // RGB to XYZ to xyY
  r = invCompand(r)
  g = invCompand(g)
  b = invCompand(b)
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685
  const Z = r * 0.000088 + g * 0.072310 + b * 0.986039
  const sum = X + Y + Z
  const p = sum === 0.0 ? { x: 0.0, y: 0.0 } : { x: X / sum, y: Y / sum }
  const q = closestInGamut(p, gamut)
  return pointToXy({ x: Math.round(q.x * 10000) / 10000, y: Math.round(q.y * 10000) / 10000 })
}

/** 
  * Transform {@link Colour!xy xy} to {@link hsv}.
  *
  * See [Hue developer portal](https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/).
  * @param xy - The CIE 1931 xy colour, x, y between 0.0000 and 1.0000.
  * @param gamut - The gamut supported by the light.
  * @return - The closest matching sRGB colour.
  */
export function xyToHsv (xy: [number, number], gamut: gamut = defaultGamut): hsv {
  let r!: number, g!: number, b!: number

  // Inverse Gamma correction (sRGB Companding).
  function compand (v: number): number {
    return v <= 0.0031308
      ? 12.92 * v
      : (1.0 + 0.055) * Math.pow(v, (1.0 / 2.4)) - 0.055
  }

  // Correction for negative values is missing from Philips' documentation.
  function correctNegative (): void {
    const m = Math.min(r, g, b)
    if (m < 0.0) {
      r -= m
      g -= m
      b -= m
    }
  }

  function rescale (): void {
    const M = Math.max(r, g, b)
    if (M > 1.0) {
      r /= M
      g /= M
      b /= M
    }
  }

  // xyY to XYZ to RGB
  const p = closestInGamut(xyToPoint(xy), gamut)
  const x = p.x
  const y = p.y === 0.0 ? 0.000001 : p.y
  const z = 1.0 - x - y
  const Y = 1.0
  const X = (Y / y) * x
  const Z = (Y / y) * z
  r = X * 1.656492 + Y * -0.354851 + Z * -0.255038
  g = X * -0.707196 + Y * 1.655397 + Z * 0.036152
  b = X * 0.051713 + Y * -0.121364 + Z * 1.011530
  correctNegative()
  rescale()
  r = compand(r)
  g = compand(g)
  b = compand(b)
  rescale()
  return rgbToHsv(r, g, b)
}

/**
  * Transform [colour temperature](https://en.wikipedia.org/wiki/Color_temperature) to {@link xy}.
  *
  * Source: [deCONZ REST API plugin](https://github.com/dresden-elektronik/deconz-rest-plugin/blob/master/colorspace.cpp).
  * The results don't match exactly the `xy` values as returned by a Hue
  * LCT015 light, but seem to be close enough.
  * @param ct - The colour temperature in [mired](https://en.wikipedia.org/wiki/Mired).
  * @return The closest matching CIE 1931 colour,`x`, `y` between 0.0 and 1.0.
  */
export function ctToXy (ct: integer): xy {
  const kelvin = 1000000 / ct
  let x, y

  if (kelvin < 4000) {
    x = 11790 +
        57520658 / kelvin +
        -15358885888 / kelvin / kelvin +
        -17440695910400 / kelvin / kelvin / kelvin
  } else {
    x = 15754 +
        14590587 / kelvin +
        138086835814 / kelvin / kelvin +
        -198301902438400 / kelvin / kelvin / kelvin
  }
  if (kelvin < 2222) {
    y = -3312 +
        35808 * x / 0x10000 +
        -22087 * x * x / 0x100000000 +
        -18126 * x * x * x / 0x1000000000000
  } else if (kelvin < 4000) {
    y = -2744 +
        34265 * x / 0x10000 +
        -22514 * x * x / 0x100000000 +
        -15645 * x * x * x / 0x1000000000000
  } else {
    y = -6062 +
        61458 * x / 0x10000 +
        -96229 * x * x / 0x100000000 +
        50491 * x * x * x / 0x1000000000000
  }
  y *= 4
  x /= 0xFFFF
  y /= 0xFFFF

  return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]
}
