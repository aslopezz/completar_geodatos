import { unzipSync, strFromU8 } from 'fflate'

export type LngLat = [number, number]

export type GeoPoint = {
  kind: 'point'
  name: string
  coord: LngLat
  ele?: number
  timestamp?: string
}

export type GeoTrack = {
  kind: 'track'
  name: string
  coords: LngLat[]
}

export type GeoFeature = GeoPoint | GeoTrack

export type ImportResult = {
  fileName: string
  format: 'kml' | 'kmz' | 'gpx'
  points: GeoPoint[]
  tracks: GeoTrack[]
}

const isFiniteCoord = ([lng, lat]: LngLat) =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  Math.abs(lng) <= 180 &&
  Math.abs(lat) <= 90

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El archivo no es un XML válido')
  }
  return doc
}

// getElementsByTagName ignora prefijos de namespace de forma inconsistente,
// así que filtramos por localName.
function byLocalName(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(
    (el) => el.localName === name,
  )
}

function childText(el: Element, name: string): string | undefined {
  const child = Array.from(el.children).find((c) => c.localName === name)
  return child?.textContent?.trim() || undefined
}

function descendantText(el: Element, name: string): string | undefined {
  return byLocalName(el, name).find((child) => child.textContent?.trim())?.textContent?.trim()
}

// KML: "lng,lat[,alt]" separados por espacios/saltos de línea
function parseKmlCoords(text: string): { coord: LngLat; ele?: number }[] {
  return text
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const [lng, lat, ele] = tuple.split(',').map(Number)
      return { coord: [lng, lat] as LngLat, ele: Number.isFinite(ele) ? ele : undefined }
    })
    .filter((c) => isFiniteCoord(c.coord))
}

function parseKml(text: string): { points: GeoPoint[]; tracks: GeoTrack[] } {
  const doc = parseXml(text)
  const points: GeoPoint[] = []
  const tracks: GeoTrack[] = []

  for (const pm of byLocalName(doc, 'Placemark')) {
    const name = childText(pm, 'name') ?? 'Sin nombre'
    const timestamp = descendantText(pm, 'when')

    for (const p of byLocalName(pm, 'Point')) {
      const raw = childText(p, 'coordinates')
      const first = raw ? parseKmlCoords(raw)[0] : undefined
      if (first) points.push({ kind: 'point', name, coord: first.coord, ele: first.ele, timestamp })
    }

    for (const ls of byLocalName(pm, 'LineString')) {
      const raw = childText(ls, 'coordinates')
      const coords = raw ? parseKmlCoords(raw).map((c) => c.coord) : []
      if (coords.length > 1) tracks.push({ kind: 'track', name, coords })
    }

    // Tracks de Google Earth / GPS: <gx:Track><gx:coord>lng lat alt</gx:coord>
    for (const tr of byLocalName(pm, 'Track')) {
      const coords = byLocalName(tr, 'coord')
        .map((c) => (c.textContent ?? '').trim().split(/\s+/).map(Number))
        .map(([lng, lat]) => [lng, lat] as LngLat)
        .filter(isFiniteCoord)
      if (coords.length > 1) tracks.push({ kind: 'track', name, coords })
    }
  }
  return { points, tracks }
}

function parseGpx(text: string): { points: GeoPoint[]; tracks: GeoTrack[] } {
  const doc = parseXml(text)
  const toCoord = (el: Element): LngLat => [
    Number(el.getAttribute('lon')),
    Number(el.getAttribute('lat')),
  ]

  const points: GeoPoint[] = []
  for (const wpt of byLocalName(doc, 'wpt')) {
    const coord = toCoord(wpt)
    if (!isFiniteCoord(coord)) continue
    const ele = Number(childText(wpt, 'ele'))
    points.push({
      kind: 'point',
      name: childText(wpt, 'name') ?? 'Sin nombre',
      coord,
      ele: Number.isFinite(ele) ? ele : undefined,
      timestamp: childText(wpt, 'time'),
    })
  }

  const tracks: GeoTrack[] = []
  // Un <trk> puede traer varios <trkseg>: cada segmento es un track aparte
  for (const trk of byLocalName(doc, 'trk')) {
    const name = childText(trk, 'name') ?? 'Sin nombre'
    for (const seg of byLocalName(trk, 'trkseg')) {
      const coords = byLocalName(seg, 'trkpt').map(toCoord).filter(isFiniteCoord)
      if (coords.length > 1) tracks.push({ kind: 'track', name, coords })
    }
  }
  for (const rte of byLocalName(doc, 'rte')) {
    const coords = byLocalName(rte, 'rtept').map(toCoord).filter(isFiniteCoord)
    if (coords.length > 1)
      tracks.push({ kind: 'track', name: childText(rte, 'name') ?? 'Sin nombre', coords })
  }
  return { points, tracks }
}

export async function importGeoFile(file: File): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'kmz') {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const kmlName =
      Object.keys(files).find((n) => n.toLowerCase() === 'doc.kml') ??
      Object.keys(files).find((n) => n.toLowerCase().endsWith('.kml'))
    if (!kmlName) throw new Error('El KMZ no contiene ningún archivo .kml')
    return { fileName: file.name, format: 'kmz', ...parseKml(strFromU8(files[kmlName])) }
  }
  if (ext === 'kml') {
    return { fileName: file.name, format: 'kml', ...parseKml(await file.text()) }
  }
  if (ext === 'gpx') {
    return { fileName: file.name, format: 'gpx', ...parseGpx(await file.text()) }
  }
  throw new Error('Formato no soportado. Usa .kml, .kmz o .gpx')
}

// Distancia haversine en km
export function trackLengthKm(coords: LngLat[]): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1]
    const [lng2, lat2] = coords[i]
    const a =
      Math.sin(rad(lat2 - lat1) / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
    total += 2 * R * Math.asin(Math.sqrt(a))
  }
  return total
}
