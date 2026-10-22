import { getSupabase } from '#/lib/supabase'

export const REGISTROS_VIEW = 'registros_app_vista'

export type Registro = {
  id_registro: string
  nombre_proyecto: string | null
  nombre_comuna: string | null
  localidad_especifica: string | null
  protocolo_muestreo: string | null
  tipo_registro: string | null
  canonical_name: string | null
  reino: string | null
  filo: string | null
  clase: string | null
  orden: string | null
  familia: string | null
  genero_taxonomico: string | null
  region: string | null
  provincia: string | null
  categoria_conservacion: string | null
  endemica: string | null
  genero: string | null
  epiteto_especifico: string | null
  nombre_comun_terreno: string | null
  cantidad: number | null
  fecha: string | null
  hora: string | null
  usuario: string | null
  lat: number | null
  lon: number | null
}

export type RegistroPunto = Registro & { lat: number; lon: number }

const COLUMNS =
  'id_registro,nombre_proyecto,nombre_comuna,localidad_especifica,protocolo_muestreo,tipo_registro,canonical_name,reino,filo,clase,orden,familia,genero_taxonomico,region,provincia,categoria_conservacion,endemica,genero,epiteto_especifico,nombre_comun_terreno,cantidad,fecha,hora,usuario,lat,lon'
const PAGE_SIZE = 1000 // tope por consulta de PostgREST

// Algunos textos vienen con saltos de línea o espacios al final (p. ej. nombres de proyecto).
// Un <option> descarta ese espacio al seleccionarlo y el filtro por igualdad dejaba de calzar.
function trimStrings<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as T
}

// Trae todos los registros, paginando de a PAGE_SIZE.
export async function fetchRegistros(): Promise<Registro[]> {
  const supabase = getSupabase()
  const rows: Registro[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(REGISTROS_VIEW)
      .select(COLUMNS)
      .order('id_registro')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`No se pudieron cargar los registros: ${error.message}`)
    // lat/lon pueden llegar como texto si la vista los castea a numeric; se normalizan a número.
    for (const row of data as Registro[]) {
      const lat = row.lat == null ? NaN : Number(row.lat)
      const lon = row.lon == null ? NaN : Number(row.lon)
      rows.push({ ...trimStrings(row), lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null })
    }
    if (data.length < PAGE_SIZE) return rows
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000

let cache: { promise: Promise<Registro[]>; at: number; data?: Registro[] } | null = null

// Cache compartida entre /registros y /mapa: una sola descarga mientras no pase el TTL.
export function loadRegistros(): Promise<Registro[]> {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    const entry: NonNullable<typeof cache> = { promise: fetchRegistros(), at: Date.now() }
    cache = entry
    entry.promise.then(
      (data) => (entry.data = data),
      () => {
        if (cache === entry) cache = null // un error no se cachea: el próximo intento vuelve a consultar
      },
    )
  }
  return cache.promise
}

// Datos ya cargados, si los hay; evita el parpadeo de "Cargando…" al volver a la página.
export const cachedRegistros = () => cache?.data ?? null

// Llamar al cambiar de sesión: los datos pertenecen al usuario que los pidió.
export function clearRegistrosCache() {
  cache = null
}

export function conCoordenadas(registros: Registro[]): RegistroPunto[] {
  return registros.filter((r): r is RegistroPunto => r.lat !== null && r.lon !== null)
}

export function especieLabel(r: Registro): string {
  return (
    r.canonical_name ||
    [r.genero, r.epiteto_especifico].filter(Boolean).join(' ') ||
    r.nombre_comun_terreno ||
    'Sin identificar'
  )
}
