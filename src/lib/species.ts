export type Species = {
  genero: string | null
  epiteto_especifico: string | null
  nombre_comun_terreno: string | null
  canonical_name: string | null
  kingdom: string | null
  phylum: string | null
  class: string | null
  order: string | null
  family: string | null
  categoria_conservacion: string | null
  decreto: string | null
  fuente?: 'catalogo' | 'gbif'
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Busca por nombre científico en el catálogo; si no hay resultados, cae a GBIF.
export async function searchSpecies(query: string, signal?: AbortSignal): Promise<Species[]> {
  if (query.trim().length < 2) return []
  const catalog = await searchCatalog(query, signal).catch((e: unknown) => {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return [] as Species[]
  })
  return catalog.length > 0 ? catalog : searchGbif(query, signal)
}

type GbifSuggestion = {
  canonicalName?: string
  kingdom?: string
  phylum?: string
  class?: string
  order?: string
  family?: string
}

async function searchGbif(query: string, signal?: AbortSignal): Promise<Species[]> {
  const params = new URLSearchParams({ q: query.trim(), limit: '10' })
  const response = await fetch(`https://api.gbif.org/v1/species/suggest?${params}`, { signal })
  if (!response.ok) throw new Error('No se pudo consultar GBIF')
  const items = (await response.json()) as GbifSuggestion[]
  const seen = new Set<string>()
  const results: Species[] = []
  for (const item of items) {
    const name = item.canonicalName
    if (!name || seen.has(name)) continue
    seen.add(name)
    const [genero, epiteto] = name.split(' ')
    results.push({
      genero: genero ?? null,
      epiteto_especifico: epiteto ?? null,
      nombre_comun_terreno: null,
      canonical_name: name,
      kingdom: item.kingdom ?? null,
      phylum: item.phylum ?? null,
      class: item.class ?? null,
      order: item.order ?? null,
      family: item.family ?? null,
      categoria_conservacion: null,
      decreto: null,
      fuente: 'gbif',
    })
  }
  return results
}

async function searchCatalog(query: string, signal?: AbortSignal): Promise<Species[]> {
  if (!supabaseUrl || !supabaseKey) return []

  const term = query.trim().replace(/[,*()]/g, ' ')
  const params = new URLSearchParams({
    select: 'genero,epiteto_especifico,nombre_comun_terreno,canonical_name,kingdom,phylum,class,order,family,categoria_conservacion,decreto',
    or: `(canonical_name.ilike.*${term}*,genero.ilike.*${term}*,epiteto_especifico.ilike.*${term}*)`,
    limit: '20',
  })
  const response = await fetch(`${supabaseUrl}/rest/v1/especies_vista?${params}`, {
    headers: { apikey: supabaseKey },
    signal,
  })
  if (!response.ok) throw new Error('No se pudo consultar el catálogo de especies')
  const rows = (await response.json()) as Species[]
  return rows.map((row) => ({ ...row, fuente: 'catalogo' as const }))
}

export function speciesLabel(species: Species): string {
  return species.canonical_name || [species.genero, species.epiteto_especifico].filter(Boolean).join(' ')
}
