import { strToU8, zipSync } from 'fflate'
import { trackLengthKm, type ImportResult, type LngLat } from '#/lib/geo-import'
import type { Estacion } from '#/lib/estaciones'
import { resolvePointAttributes } from '#/lib/point-attributes'
import { findProtocolo } from '#/lib/protocolos'
import { speciesLabel, type Species } from '#/lib/species'
import { toUtm, type UtmZone } from '#/lib/utm'

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
}

function coordinate([lng, lat]: LngLat): string {
  return `${lng},${lat}`
}

export function exportKmz(data: ImportResult, points: number[], species: Record<number, Species>, quantities: Record<number, number>, zone: UtmZone, trackNames: Record<number, string> = {}) {
  const pointPlacemarks = points.map((index) => {
    const point = data.points[index]
    const selected = species[index]
    const utm = toUtm(point.coord, zone)
    const timestamp = point.timestamp && !Number.isNaN(Date.parse(point.timestamp))
      ? `<TimeStamp><when>${xml(point.timestamp)}</when></TimeStamp>` : ''
    const details = [selected && `Especie: ${speciesLabel(selected)}${selected.fuente === 'gbif' ? ' (GBIF)' : ''}`, selected?.nombre_comun_terreno && `Nombre común: ${selected.nombre_comun_terreno}`]
      .filter(Boolean).join('\n')
    const speciesData = `<ExtendedData><Data name="cantidad"><value>${quantities[index] ?? 1}</value></Data><Data name="utm_zona"><value>${zone}S</value></Data><Data name="utm_este_m"><value>${utm.easting.toFixed(3)}</value></Data><Data name="utm_norte_m"><value>${utm.northing.toFixed(3)}</value></Data>${selected ? [
          ['nombre_cientifico', speciesLabel(selected)],
          ['nombre_comun', selected.nombre_comun_terreno],
          ['fuente_especie', selected.fuente],
          ['reino', selected.kingdom],
          ['filo', selected.phylum],
          ['clase', selected.class],
          ['orden', selected.order],
          ['familia', selected.family],
          ['categoria_RCE', selected.categoria_conservacion],
          ['decreto_RCE', selected.decreto],
        ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([name, value]) => `<Data name="${name}"><value>${xml(value)}</value></Data>`).join('') : ''}</ExtendedData>`
    return `<Placemark><name>${xml(point.name)}</name>${timestamp}${details ? `<description>${xml(details)}</description>` : ''}${speciesData}<Point><coordinates>${coordinate(point.coord)}</coordinates></Point></Placemark>`
  }).join('')

  const trackPlacemarks = buildTrackPlacemarks(data, zone, trackNames)
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(data.fileName)}</name>${pointPlacemarks}${trackPlacemarks}</Document></kml>`
  downloadKmz(kml, `${baseName(data.fileName)}.kmz`)
}

function buildTrackPlacemarks(data: ImportResult, zone: UtmZone, trackNames: Record<number, string>): string {
  return data.tracks.map((track, index) => {
    const coords = track.coords.map(coordinate).join(' ')
    const start = toUtm(track.coords[0], zone)
    const end = toUtm(track.coords[track.coords.length - 1], zone)
    const lengthKm = trackLengthKm(track.coords)
    return `<Placemark><name>${xml(trackNames[index]?.trim() || track.name)}</name><description>${track.coords.length} puntos de ruta · ${lengthKm.toFixed(2)} km</description><ExtendedData><Data name="longitud_km"><value>${lengthKm.toFixed(3)}</value></Data><Data name="utm_zona"><value>${zone}S</value></Data><Data name="utm_inicio_este_m"><value>${start.easting.toFixed(3)}</value></Data><Data name="utm_inicio_norte_m"><value>${start.northing.toFixed(3)}</value></Data><Data name="utm_termino_este_m"><value>${end.easting.toFixed(3)}</value></Data><Data name="utm_termino_norte_m"><value>${end.northing.toFixed(3)}</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`
  }).join('')
}

function downloadKmz(kml: string, fileName: string) {
  download(new Blob([zipSync({ 'doc.kml': strToU8(kml) })], { type: 'application/vnd.google-earth.kmz' }), fileName)
}

// Mismo formato que exportCsv (";", UTF-8 sin BOM); una fila por track.
export function exportTracksCsv(data: ImportResult, zone: UtmZone, trackNames: Record<number, string> = {}) {
  const headers = ['NOMBRE', 'PUNTOS DE RUTA', 'LARGO (m)', 'INICIO LAT', 'INICIO LON', 'TERMINO LAT', 'TERMINO LON', 'UTM ZONA', 'INICIO ESTE (m)', 'INICIO NORTE (m)', 'TERMINO ESTE (m)', 'TERMINO NORTE (m)']
  const rows: string[][] = [headers]
  data.tracks.forEach((track, index) => {
    const startCoord = track.coords[0]
    const endCoord = track.coords[track.coords.length - 1]
    const start = toUtm(startCoord, zone)
    const end = toUtm(endCoord, zone)
    rows.push([
      trackNames[index]?.trim() || track.name,
      String(track.coords.length),
      String(Math.round(trackLengthKm(track.coords) * 1000)),
      String(startCoord[1]), String(startCoord[0]), String(endCoord[1]), String(endCoord[0]),
      `${zone}S`,
      start.easting.toFixed(3), start.northing.toFixed(3), end.easting.toFixed(3), end.northing.toFixed(3),
    ])
  })
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n')
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${baseName(data.fileName)}_tracks.csv`)
}

export type PointOverride = { estacion?: string; protocolo?: string; metodologia?: string }

export function metodologiaFor(protocolo: string | undefined): string {
  return findProtocolo(protocolo)?.sigla ?? ''
}

// Al cambiar de protocolo: usa la sigla del nuevo; si la actual era la autocompletada del
// protocolo anterior la limpia, y si fue escrita a mano la respeta.
export function nextMetodologia(prevProtocolo: string | undefined, newProtocolo: string, current: string): string {
  const mapped = metodologiaFor(newProtocolo)
  if (mapped) return mapped
  return current === metodologiaFor(prevProtocolo) ? '' : current
}

export type CsvMeta = { estacion: string; terreno: string; protocolo: string; metodologia: string }

// Formato que lee la app Shiny (aslopezz/graficos_eco): separador ";", UTF-8,
// nombres de columna tal cual, FECHA dd-mm-YYYY y COORDENADAS como "lat, lon".
// Una fila por punto; los puntos sin especie salen con las columnas de especie vacías.
export function exportCsv(data: ImportResult, points: number[], species: Record<number, Species>, quantities: Record<number, number>, meta: CsvMeta, overrides: Record<number, PointOverride> = {}, getEstacionOf?: (index: number) => Estacion | undefined) {
  const headers = ['TERRENO', 'ESTACION', 'PROTOCOLO MUESTREO', 'NOMBRE METODOLOGIA', 'FECHA', 'HORA', 'COORDENADAS', 'REINO', 'FILO', 'CLASE', 'ORDEN', 'FAMILIA', 'GENERO', 'EPITETO ESPECIFICO', 'NOMBRE COMUN', 'CANTIDAD', 'CATEGORIA CONSERVACION', 'DECRETO', 'FUENTE ESPECIE']
  const rows: string[][] = [headers]
  for (const index of points) {
    const selected: Species | undefined = species[index]
    const point = data.points[index]
    const date = point.timestamp ? new Date(point.timestamp) : null
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null
    const [genus, epithet] = (selected ? speciesLabel(selected) : '').split(' ')
    const attrs = resolvePointAttributes(point.name, meta, overrides[index], getEstacionOf?.(index))
    rows.push([
      meta.terreno,
      attrs.estacion,
      attrs.protocolo,
      attrs.metodologia,
      validDate ? validDate.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '',
      validDate?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '',
      `${point.coord[1]}, ${point.coord[0]}`,
      selected?.kingdom ?? '', selected?.phylum ?? '', selected?.class ?? '', selected?.order ?? '', selected?.family ?? '',
      selected?.genero ?? genus ?? '', selected?.epiteto_especifico ?? epithet ?? '',
      selected?.nombre_comun_terreno ?? '',
      String(quantities[index] ?? 1),
      selected?.categoria_conservacion ?? '', selected?.decreto ?? '', selected?.fuente ?? '',
    ])
  }
  // Sin BOM: la app lee con read.csv(encoding = "UTF-8") y el BOM ensuciaría el nombre de la primera columna.
  const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n')
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${baseName(data.fileName)}.csv`)
}

function baseName(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '') || 'exportacion'
  return name.toLocaleUpperCase('en').startsWith('ECO_') ? name : `ECO_${name}`
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
