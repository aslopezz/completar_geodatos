// Busca la clave GBIF de cada nombre científico del archivo. Lo que importa es que la clave apunte a la especie correcta:
// la clasificación (clase, orden, familia) de taxa_cache es una copia que se puede rehacer desde la clave.
// Primero se mira taxa_cache; si el nombre no está, se pregunta a GBIF. Se guarda la clave **aceptada**, no la de un sinónimo.

export type CacheTaxon = { gbif_taxon_key: number; canonical_name: string; rank: string | null; accepted_key: number | null }

// Fila para taxa_cache de una clave que la base aún no tiene (viene de GBIF).
export type TaxonNuevo = {
  gbif_taxon_key: number
  canonical_name: string | null
  rank: string | null
  kingdom: string | null
  phylum: string | null
  class: string | null
  order: string | null
  family: string | null
  genus: string | null
}

// Fila de especie_rce (catálogo oficial de conservación) que puede traer una clave GBIF.
export type RceTaxon = { nombre_cientifico: string | null; nombre_comun: string | null; gbif_taxon_key: number | null }

// Nombre común ya usado en un registro de la base, con la clave de esa especie.
export type NombreComunConocido = { nombre_comun_terreno: string | null; gbif_taxon_key: number | null; canonical_name: string | null }

// soloComun: la fila del archivo no trae nombre científico y se busca por su nombre común.
export type NombreBuscado = { nombre: string; soloComun: boolean }

// Dónde se busca; se inyectan para poder probar sin Supabase.
export type Fuentes = {
  base: (nombres: string[]) => Promise<CacheTaxon[]> // taxa_cache por canonical_name
  rce: (nombres: string[]) => Promise<RceTaxon[]> // especie_rce por nombre científico o común
  registros: (nombres: string[]) => Promise<NombreComunConocido[]> // registros ya cargados, por nombre común
}

export type EspecieMatch = {
  nombre: string // como viene en el archivo
  clave: number | null // clave aceptada
  nombreGbif: string | null
  rango: string | null
  origen: 'base' | 'gbif' | 'rce' | 'registros' | null // null = sin coincidencia
  avisos: string[]
  dudoso?: boolean // GBIF solo dio una coincidencia aproximada o de género: si el RCE tiene el nombre exacto, gana el RCE
  taxon?: TaxonNuevo // presente si la clave puede no estar en taxa_cache; se agrega al guardar
}

const GBIF = 'https://api.gbif.org/v1'
const CONCURRENCIA = 5
const NIVELES_ALTOS = new Set(['DOMAIN', 'KINGDOM', 'PHYLUM', 'CLASS', 'ORDER', 'FAMILY'])

type GbifMatch = {
  usageKey?: number
  acceptedUsageKey?: number
  canonicalName?: string
  rank?: string
  status?: string
  confidence?: number
  matchType?: 'EXACT' | 'FUZZY' | 'HIGHERRANK' | 'NONE'
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`GBIF respondió ${response.status}`)
  return response.json() as Promise<T>
}

const tieneEpiteto = (nombre: string) => nombre.trim().split(/\s+/).length > 1

async function buscarEnGbif(nombre: string, signal?: AbortSignal): Promise<EspecieMatch> {
  const sinCoincidencia = (aviso: string): EspecieMatch => ({ nombre, clave: null, nombreGbif: null, rango: null, origen: null, avisos: [aviso] })
  const m = await getJson<GbifMatch>(`${GBIF}/species/match?name=${encodeURIComponent(nombre)}`, signal)
  if (!m.usageKey || m.matchType === 'NONE') return sinCoincidencia('GBIF no encontró el nombre.')
  // Un nivel sobre el género (p. ej. el reino, por un nombre mal escrito) no identifica nada útil.
  if (m.rank && NIVELES_ALTOS.has(m.rank)) return sinCoincidencia(`GBIF solo reconoce el nivel ${m.rank.toLowerCase()} ("${m.canonicalName}"): revisa el nombre.`)

  const avisos: string[] = []
  let clave = m.usageKey
  let nombreGbif = m.canonicalName ?? null
  let rango = m.rank ?? null
  const dudoso = m.matchType === 'FUZZY' || m.matchType === 'HIGHERRANK' || (tieneEpiteto(nombre) && !!m.rank && !['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(m.rank))
  if (m.matchType === 'FUZZY') avisos.push(`Coincidencia aproximada con "${m.canonicalName}": puede ser un error de escritura.`)
  if (m.matchType === 'HIGHERRANK' || (tieneEpiteto(nombre) && m.rank && !['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(m.rank)))
    avisos.push(`Solo se encontró el nivel ${m.rank?.toLowerCase()}, no la especie.`)
  if (m.acceptedUsageKey && m.acceptedUsageKey !== m.usageKey) {
    // Sinónimo: se guarda la clave del nombre aceptado.
    const aceptado = await fichaGbif(m.acceptedUsageKey, signal)
    avisos.push(`"${m.canonicalName}" es sinónimo: se usa el nombre aceptado "${aceptado.canonical_name}".`)
    clave = m.acceptedUsageKey
    nombreGbif = aceptado.canonical_name ?? nombreGbif
    rango = aceptado.rank ?? rango
    return { nombre, clave, nombreGbif, rango, origen: 'gbif', avisos, dudoso, taxon: aceptado }
  }
  return { nombre, clave, nombreGbif, rango, origen: 'gbif', avisos, dudoso, taxon: await fichaGbif(clave, signal) }
}

type GbifEspecie = { key: number; acceptedKey?: number; canonicalName?: string; rank?: string; kingdom?: string; phylum?: string; class?: string; order?: string; family?: string; genus?: string }

async function fichaGbif(clave: number, signal?: AbortSignal): Promise<TaxonNuevo> {
  const e = await getJson<GbifEspecie>(`${GBIF}/species/${clave}`, signal)
  if (e.acceptedKey && e.acceptedKey !== clave) return fichaGbif(e.acceptedKey, signal) // la clave del RCE puede ser la de un sinónimo
  return {
    gbif_taxon_key: clave,
    canonical_name: e.canonicalName ?? null,
    rank: e.rank ?? null,
    kingdom: e.kingdom ?? null,
    phylum: e.phylum ?? null,
    class: e.class ?? null,
    order: e.order ?? null,
    family: e.family ?? null,
    genus: e.genus ?? null,
  }
}

function desdeBase(nombre: string, taxon: CacheTaxon): EspecieMatch {
  return { nombre, clave: taxon.accepted_key ?? taxon.gbif_taxon_key, nombreGbif: taxon.canonical_name, rango: taxon.rank, origen: 'base', avisos: [] }
}

export async function buscarEspecies(
  nombres: NombreBuscado[],
  fuentes: Fuentes,
  { signal, onProgreso }: { signal?: AbortSignal; onProgreso?: (hechos: number, total: number) => void } = {},
): Promise<EspecieMatch[]> {
  // Un mismo texto puede venir como científico en unas filas y como común en otras: manda el científico.
  const soloComun = new Map<string, boolean>()
  for (const { nombre, soloComun: comun } of nombres) {
    const n = nombre.trim()
    if (n) soloComun.set(n, (soloComun.get(n) ?? true) && comun)
  }
  const unicos = [...soloComun.keys()]
  const cientificos = unicos.filter((n) => !soloComun.get(n))
  const base = new Map((await fuentes.base(cientificos)).map((t) => [t.canonical_name.toLowerCase(), t]))
  const resultados = new Map<string, EspecieMatch>()
  const pendientes: string[] = []
  const conAceptada: string[] = []
  for (const nombre of unicos) {
    if (soloComun.get(nombre)) {
      resultados.set(nombre, { nombre, clave: null, nombreGbif: null, rango: null, origen: null, avisos: [] })
      continue
    }
    const taxon = base.get(nombre.toLowerCase())
    if (taxon) resultados.set(nombre, desdeBase(nombre, taxon))
    else pendientes.push(nombre)
    // Si la base apunta a la clave aceptada de un sinónimo, esa clave puede faltar en taxa_cache.
    if (taxon?.accepted_key && taxon.accepted_key !== taxon.gbif_taxon_key) conAceptada.push(nombre)
  }
  onProgreso?.(resultados.size, unicos.length)

  // Pocas consultas a la vez, para no saturar la API de GBIF.
  let siguiente = 0
  const trabajador = async () => {
    while (siguiente < pendientes.length) {
      const nombre = pendientes[siguiente++]
      try {
        resultados.set(nombre, await buscarEnGbif(nombre, signal))
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        resultados.set(nombre, { nombre, clave: null, nombreGbif: null, rango: null, origen: null, avisos: [`No se pudo consultar GBIF: ${e instanceof Error ? e.message : 'error de red'}.`] })
      }
      onProgreso?.(resultados.size, unicos.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador))
  for (const nombre of conAceptada) {
    const previo = resultados.get(nombre)!
    try {
      resultados.set(nombre, { ...previo, taxon: await fichaGbif(previo.clave!, signal) })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      resultados.set(nombre, { ...previo, avisos: [...previo.avisos, 'No se pudo comprobar la clave aceptada en GBIF.'] })
    }
  }

  // Lo que GBIF no encontró, encontró de forma dudosa o no se pudo buscar (solo nombre común) se intenta con la base y el RCE.
  const aRevisar = unicos.filter((n) => !resultados.get(n)!.clave || resultados.get(n)!.dudoso)
  if (aRevisar.length === 0) return unicos.map((n) => resultados.get(n)!)
  const igual = (a: string | null, b: string) => (a?.trim().toLowerCase() ?? '') === b.toLowerCase()
  const sinClave = aRevisar.filter((n) => !resultados.get(n)!.clave)

  // 1) Nombres comunes que ya usan registros de la base: sirven si todos apuntan a una sola especie.
  if (sinClave.length > 0) {
    let conocidos: NombreComunConocido[] = []
    try {
      conocidos = await fuentes.registros(sinClave)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
    }
    for (const nombre of sinClave) {
      const claves = new Map<number, string | null>()
      for (const c of conocidos) if (c.gbif_taxon_key && igual(c.nombre_comun_terreno, nombre)) claves.set(c.gbif_taxon_key, c.canonical_name)
      if (claves.size === 1) {
        const [[clave, canonico]] = [...claves]
        resultados.set(nombre, { nombre, clave, nombreGbif: canonico, rango: null, origen: 'registros', avisos: ['Nombre común que ya usan registros de la base: revisa que sea la especie.'] })
      } else if (claves.size > 1) {
        resultados.get(nombre)!.avisos.push(`El nombre común se usa en registros de ${claves.size} especies distintas: no se puede elegir una.`)
      }
    }
  }

  // 2) RCE. Un nombre científico exacto gana sobre una coincidencia aproximada de GBIF; el nombre común solo si aún no hay clave.
  let filas: RceTaxon[] = []
  try {
    filas = await fuentes.rce(aRevisar)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    for (const n of aRevisar) resultados.get(n)!.avisos.push('No se pudo consultar el RCE.')
  }
  for (const nombre of aRevisar) {
    const previo = resultados.get(nombre)!
    const porCientifico = filas.find((f) => igual(f.nombre_cientifico, nombre))
    const porComun = previo.clave ? undefined : filas.find((f) => igual(f.nombre_comun, nombre))
    const fila = porCientifico ?? porComun
    if (!fila) continue
    if (!fila.gbif_taxon_key) {
      previo.avisos.push(`Está en el RCE ("${fila.nombre_cientifico}") pero sin clave GBIF.`)
      continue
    }
    try {
      const taxon = await fichaGbif(fila.gbif_taxon_key, signal)
      const como = porCientifico ? 'con ese nombre científico' : `por su nombre común (${fila.nombre_cientifico})`
      resultados.set(nombre, { nombre, clave: taxon.gbif_taxon_key, nombreGbif: taxon.canonical_name, rango: taxon.rank, origen: 'rce', avisos: [`Encontrado en el RCE ${como}.`], taxon })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      previo.avisos.push('Está en el RCE, pero no se pudo comprobar su clave en GBIF.')
    }
  }
  for (const r of resultados.values()) if (!r.clave && r.avisos.length === 0) r.avisos.push('No se encontró el nombre común en los registros de la base ni en el RCE.')
  return unicos.map((n) => resultados.get(n)!)
}
