import { strToU8, zipSync } from 'fflate'
import { csvFile, type ExportFile } from '#/lib/export-file'
import { trackLengthKm, type GeoTrack, type ImportResult, type LngLat } from '#/lib/geo-import'
import type { ExportPoint } from '#/lib/point-session'
import { speciesLabel } from '#/lib/species'
import { toUtm, type UtmCoordinate, type UtmZone } from '#/lib/utm'

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
}

function coordinate([lng, lat]: LngLat): string {
  return `${lng},${lat}`
}

// Nombre que el usuario le dio al track en la tabla, o el del archivo si lo dejÃ³ vacÃ­o.
export function trackName(track: GeoTrack, index: number, trackNames: Record<number, string>): string {
  return trackNames[index]?.trim() || track.name
}

export type TrackSummary = { start: LngLat; end: LngLat; startUtm: UtmCoordinate; endUtm: UtmCoordinate; lengthKm: number }

// Inicio, tÃ©rmino y largo de un track: lo usan el KMZ, el CSV de tracks y la tabla de tracks.
export function trackSummary(track: GeoTrack, zone: UtmZone): TrackSummary {
  const start = track.coords[0]
  const end = track.coords[track.coords.length - 1]
  return { start, end, startUtm: toUtm(start, zone), endUtm: toUtm(end, zone), lengthKm: trackLengthKm(track.coords) }
}

export function exportKmz(data: ImportResult, points: ExportPoint[], zone: UtmZone, trackNames: Record<number, string> = {}): ExportFile {
  const pointPlacemarks = points.map((point) => {
    const selected = point.species
    const utm = toUtm(point.coord, zone)
    const timestamp = point.timestamp && !Number.isNaN(Date.parse(point.timestamp))
      ? `<TimeStamp><when>${xml(point.timestamp)}</when></TimeStamp>` : ''
    const details = [selected && `Especie: ${speciesLabel(selected)}${selected.fuente === 'gbif' ? ' (GBIF)' : ''}`, selected?.nombre_comun_terreno && `Nombre comÃºn: ${selected.nombre_comun_terreno}`]
      .filter(Boolean).join('\n')
    const speciesData = `<ExtendedData><Data name="cantidad"><value>${point.cantidad}</value></Data><Data name="utm_zona"><value>${zone}S</value></Data><Data name="utm_este_m"><value>${utm.easting.toFixed(3)}</value></Data><Data name="utm_norte_m"><value>${utm.northing.toFixed(3)}</value></Data>${selected ? [
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
  return {
    fileName: `${baseName(data.fileName)}.kmz`,
    blob: new Blob([zipSync({ 'doc.kml': strToU8(kml) })], { type: 'application/vnd.google-earth.kmz' }),
  }
}

function buildTrackPlacemarks(data: ImportResult, zone: UtmZone, trackNames: Record<number, string>): string {
  return data.tracks.map((track, index) => {
    const coords = track.coords.map(coordinate).join(' ')
    const { startUtm: start, endUtm: end, lengthKm } = trackSummary(track, zone)
    return `<Placemark><name>${xml(trackName(track, index, trackNames))}</name><description>${track.coords.length} puntos de ruta Â· ${lengthKm.toFixed(2)} km</description><ExtendedData><Data name="longitud_km"><value>${lengthKm.toFixed(3)}</value></Data><Data name="utm_zona"><value>${zone}S</value></Data><Data name="utm_inicio_este_m"><value>${start.easting.toFixed(3)}</value></Data><Data name="utm_inicio_norte_m"><value>${start.northing.toFixed(3)}</value></Data><Data name="utm_termino_este_m"><value>${end.easting.toFixed(3)}</value></Data><Data name="utm_termino_norte_m"><value>${end.northing.toFixed(3)}</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`
  }).join('')
}

// Mismo formato que exportCsv; una fila por track.
export function exportTracksCsv(data: ImportResult, zone: UtmZone, trackNames: Record<number, string> = {}): ExportFile {
  const headers = ['NOMBRE', 'PUNTOS DE RUTA', 'LARGO (m)', 'INICIO LAT', 'INICIO LON', 'TERMINO LAT', 'TERMINO LON', 'UTM ZONA', 'INICIO ESTE (m)', 'INICIO NORTE (m)', 'TERMINO ESTE (m)', 'TERMINO NORTE (m)']
  const rows: string[][] = [headers]
  data.tracks.forEach((track, index) => {
    const { start, end, startUtm, endUtm, lengthKm } = trackSummary(track, zone)
    rows.push([
      trackName(track, index, trackNames),
      String(track.coords.length),
      String(Math.round(lengthKm * 1000)),
      String(start[1]), String(start[0]), String(end[1]), String(end[0]),
      `${zone}S`,
      startUtm.easting.toFixed(3), startUtm.northing.toFixed(3), endUtm.easting.toFixed(3), endUtm.northing.toFixed(3),
    ])
  })
  return csvFile(rows, `${baseName(data.fileName)}_tracks.csv`)
}

// Formato que lee la app Shiny (aslopezz/graficos_eco): separador ";", UTF-8,
// nombres de columna tal cual, FECHA dd-mm-YYYY y COORDENADAS como "lat, lon".
// Una fila por punto; los puntos sin especie salen con las columnas de especie vacÃ­as.
export function exportCsv(fileName: string, points: ExportPoint[], terreno: string): ExportFile {
  const headers = ['TERRENO', 'ESTACION', 'PROTOCOLO MUESTREO', 'NOMBRE METODOLOGIA', 'FECHA', 'HORA', 'COORDENADAS', 'REINO', 'FILO', 'CLASE', 'ORDEN', 'FAMILIA', 'GENERO', 'EPITETO ESPECIFICO', 'NOMBRE COMUN', 'CANTIDAD', 'CATEGORIA CONSERVACION', 'DECRETO', 'FUENTE ESPECIE']
  const rows: string[][] = [headers]
  for (const point of points) {
    const selected = point.species
    const date = point.timestamp ? new Date(point.timestamp) : null
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null
    const [genus, epithet] = (selected ? speciesLabel(selected) : '').split(' ')
    rows.push([
      terreno,
      point.estacion,
      point.protocolo,
      point.metodologia,
      validDate ? validDate.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '',
      validDate?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '',
      `${point.coord[1]}, ${point.coord[0]}`,
      selected?.kingdom ?? '', selected?.phylum ?? '', selected?.class ?? '', selected?.order ?? '', selected?.family ?? '',
      selected?.genero ?? genus ?? '', selected?.epiteto_especifico ?? epithet ?? '',
      selected?.nombre_comun_terreno ?? '',
      String(point.cantidad),
      selected?.categoria_conservacion ?? '', selected?.decreto ?? '', selected?.fuente ?? '',
    ])
  }
  return csvFile(rows, `${baseName(fileName)}.csv`)
}

function baseName(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '') || 'exportacion'
  return name.toLocaleUpperCase('en').startsWith('ECO_') ? name : `ECO_${name}`
}
