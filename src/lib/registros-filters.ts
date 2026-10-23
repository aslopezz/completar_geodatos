import { csvFile, type ExportFile } from '#/lib/export-file'
import { especieLabel, type Registro } from '#/lib/registros'

export const TAXONOMY = [
  { key: 'reino', label: 'Reino' },
  { key: 'filo', label: 'Filo o División' },
  { key: 'clase', label: 'Clase' },
  { key: 'orden', label: 'Orden' },
  { key: 'familia', label: 'Familia' },
  { key: 'genero_taxonomico', label: 'Género' },
] as const

export const GEOGRAPHY = [
  { key: 'region', label: 'Región' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'nombre_comuna', label: 'Comuna' },
  { key: 'localidad_especifica', label: 'Localidad' },
] as const

type Level = { key: CascadeKey; label: string }
export type CascadeKey = (typeof TAXONOMY)[number]['key'] | (typeof GEOGRAPHY)[number]['key']

export type Filters = Record<CascadeKey, string> & {
  search: string
  proyecto: string
  desde: string
  hasta: string
}

export const EMPTY_FILTERS: Filters = {
  reino: '', filo: '', clase: '', orden: '', familia: '', genero_taxonomico: '',
  region: '', provincia: '', nombre_comuna: '', localidad_especifica: '',
  search: '', proyecto: '', desde: '', hasta: '',
}

export const ENDEMICA_UNKNOWN = 'Indeterminada'
export const endemicaOf = (r: Registro) => r.endemica?.trim() || ENDEMICA_UNKNOWN

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase()

export const uniqueSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'es'))

// Opciones del nivel `index`: solo lo que existe dentro de la selección de los niveles superiores.
export function cascadeOptions(rows: Registro[], levels: readonly Level[], f: Filters, index: number): string[] {
  const parents = levels.slice(0, index).filter((l) => f[l.key])
  return uniqueSorted(rows.filter((r) => parents.every((l) => r[l.key] === f[l.key])).map((r) => r[levels[index].key]))
}

// Cambiar un nivel limpia los inferiores, para no dejar combinaciones imposibles.
export function setCascade(f: Filters, levels: readonly Level[], index: number, value: string): Filters {
  const next = { ...f, [levels[index].key]: value }
  for (const l of levels.slice(index + 1)) next[l.key] = ''
  return next
}

export function matches(r: Registro, f: Filters): boolean {
  const term = norm(f.search.trim())
  return (
    (!term || [especieLabel(r), r.nombre_comun_terreno, r.localidad_especifica].some((v) => norm(v).includes(term))) &&
    (!f.proyecto || r.nombre_proyecto === f.proyecto) &&
    (!f.desde || (r.fecha ?? '') >= f.desde) &&
    (!f.hasta || (r.fecha ?? '') <= f.hasta) &&
    [...TAXONOMY, ...GEOGRAPHY].every((l) => !f[l.key] || r[l.key] === f[l.key])
  )
}

const CSV_COLUMNS: [string, (r: Registro) => string | number | null][] = [
  ['Fecha', (r) => r.fecha],
  ['Especie', especieLabel],
  ['Nombre común', (r) => r.nombre_comun_terreno],
  ['Cantidad', (r) => r.cantidad],
  ['Proyecto', (r) => r.nombre_proyecto],
  ['Región', (r) => r.region],
  ['Provincia', (r) => r.provincia],
  ['Comuna', (r) => r.nombre_comuna],
  ['Localidad', (r) => r.localidad_especifica],
  ['Latitud', (r) => r.lat],
  ['Longitud', (r) => r.lon],
  ['Reino', (r) => r.reino],
  ['Filo', (r) => r.filo],
  ['Clase', (r) => r.clase],
  ['Orden', (r) => r.orden],
  ['Familia', (r) => r.familia],
  ['Género', (r) => r.genero_taxonomico],
  ['Categoría de conservación', (r) => r.categoria_conservacion],
  ['Endémica', endemicaOf],
]

export function exportRegistrosCsv(rows: Registro[]): ExportFile {
  return csvFile([CSV_COLUMNS.map(([name]) => name), ...rows.map((r) => CSV_COLUMNS.map(([, get]) => get(r)))], 'registros.csv')
}
