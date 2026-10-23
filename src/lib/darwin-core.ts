import { csvFile, type ExportFile } from '#/lib/export-file'
import type { ExportPoint } from '#/lib/point-session'
import { speciesLabel } from '#/lib/species'

// Darwin Core (https://dwc.tdwg.org/terms/): una fila por ocurrencia, columnas con el nombre del término.
// Sigue la planilla EDMAR del equipo: estación → eventID, sigla del protocolo → samplingProtocol,
// occurrenceID con prefijo ECR. Es el formato que se sube a la base de datos.
// La clave GBIF no se exporta (decidido 2026-10-23): al subirlo, la especie se busca por scientificName.

const pad = (n: number) => String(n).padStart(2, '0')

// "Ecos del Mar C2" → "ECOS-DEL-MAR-C2", para armar occurrenceID.
function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Hora local con su desfase, como pide eventTime: "14:05:00-03:00".
function localTime(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

const COLUMNS = [
  'occurrenceID', 'basisOfRecord', 'institutionCode', 'datasetName', 'recordNumber', 'individualCount', 'occurrenceStatus',
  'eventID', 'samplingProtocol', 'eventDate', 'eventTime', 'year', 'month', 'day',
  'country', 'countryCode', 'decimalLatitude', 'decimalLongitude', 'geodeticDatum',
  'scientificName', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'specificEpithet', 'taxonRank', 'vernacularName',
]

// Solo los puntos con especie: una ocurrencia sin scientificName no es válida.
export const withSpecies = (points: ExportPoint[]) => points.filter((p) => p.species)

export function exportDarwinCore(fileName: string, points: ExportPoint[], terreno: string): ExportFile {
  const prefix = ['ECR', slug(terreno || fileName.replace(/\.[^.]+$/, ''))].filter(Boolean).join(':')
  const rows = withSpecies(points).map((point, i) => {
    const species = point.species!
    const date = point.timestamp ? new Date(point.timestamp) : null
    const valid = date && !Number.isNaN(date.getTime()) ? date : null
    const [genus, epithet] = speciesLabel(species).split(' ')
    const genero = species.genero ?? genus ?? ''
    const epiteto = species.epiteto_especifico ?? epithet ?? ''
    return [
      `${prefix}:${pad(i + 1)}`,
      'HumanObservation',
      'Ecorestaura (ECR)',
      terreno,
      point.name,
      point.cantidad,
      'present',
      point.estacion,
      point.metodologia || point.protocolo,
      valid ? `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}` : '',
      valid ? localTime(valid) : '',
      valid?.getFullYear() ?? '',
      valid ? valid.getMonth() + 1 : '',
      valid?.getDate() ?? '',
      'Chile',
      'CL',
      point.coord[1],
      point.coord[0],
      'WGS84',
      speciesLabel(species),
      species.kingdom, species.phylum, species.class, species.order, species.family,
      genero,
      epiteto,
      epiteto ? 'species' : genero ? 'genus' : '',
      species.nombre_comun_terreno,
    ]
  })
  return csvFile([COLUMNS, ...rows], `${fileName.replace(/\.[^.]+$/, '') || 'exportacion'}_darwin_core.csv`)
}
