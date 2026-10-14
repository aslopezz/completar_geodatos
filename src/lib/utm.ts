import type { LngLat } from '#/lib/geo-import'

export type UtmZone = 18 | 19
export type UtmCoordinate = { easting: number; northing: number; zone: UtmZone; hemisphere: 'S' }

// WGS84 / UTM south (EPSG:32718 or EPSG:32719).
export function toUtm([longitude, latitude]: LngLat, zone: UtmZone): UtmCoordinate {
  const a = 6378137
  const flattening = 1 / 298.257223563
  const eccentricitySquared = flattening * (2 - flattening)
  const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared)
  const scale = 0.9996
  const radians = (degrees: number) => degrees * Math.PI / 180
  const phi = radians(latitude)
  const lambda = radians(longitude)
  const centralMeridian = radians(zone * 6 - 183)
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const tanPhi = Math.tan(phi)
  const n = a / Math.sqrt(1 - eccentricitySquared * sinPhi ** 2)
  const t = tanPhi ** 2
  const c = secondEccentricitySquared * cosPhi ** 2
  const aa = cosPhi * (lambda - centralMeridian)
  const e2 = eccentricitySquared
  const e4 = e2 ** 2
  const e6 = e2 ** 3
  const meridianArc = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi)
  )

  const easting = 500000 + scale * n * (
    aa + (1 - t + c) * aa ** 3 / 6
    + (5 - 18 * t + t ** 2 + 72 * c - 58 * secondEccentricitySquared) * aa ** 5 / 120
  )
  const northing = 10000000 + scale * (
    meridianArc + n * tanPhi * (
      aa ** 2 / 2
      + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24
      + (61 - 58 * t + t ** 2 + 600 * c - 330 * secondEccentricitySquared) * aa ** 6 / 720
    )
  )
  return { easting, northing, zone, hemisphere: 'S' }
}

export function formatUtm(coord: UtmCoordinate): string {
  return `${coord.easting.toFixed(0)} E, ${coord.northing.toFixed(0)} N`
}
