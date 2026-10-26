import type { CacheTaxon, NombreComunConocido, RceTaxon } from '#/lib/import/species-match'
import { REGISTROS_VIEW } from '#/lib/registros'
import { getSupabase } from '#/lib/supabase'

const LOTE = 100 // nombres por consulta, para que la URL no quede demasiado larga

// Filas de taxa_cache cuyo nombre canónico coincide exactamente; species-match compara después sin distinguir mayúsculas.
export async function buscarEnTaxaCache(nombres: string[]): Promise<CacheTaxon[]> {
  const filas: CacheTaxon[] = []
  for (let i = 0; i < nombres.length; i += LOTE) {
    const { data, error } = await getSupabase()
      .from('taxa_cache')
      .select('gbif_taxon_key,canonical_name,rank,accepted_key')
      .in('canonical_name', nombres.slice(i, i + LOTE))
    if (error) throw new Error(`No se pudo consultar taxa_cache: ${error.message}`)
    filas.push(...(data as CacheTaxon[]))
  }
  return filas
}

// Filas de especie_rce cuyo nombre científico o nombre común coincide exactamente (species-match compara después sin mayúsculas).
export async function buscarEnRce(nombres: string[]): Promise<RceTaxon[]> {
  const filas: RceTaxon[] = []
  for (let i = 0; i < nombres.length; i += LOTE) {
    const lote = nombres.slice(i, i + LOTE)
    for (const columna of ['nombre_cientifico', 'nombre_comun'] as const) {
      const { data, error } = await getSupabase().from('especie_rce').select('nombre_cientifico,nombre_comun,gbif_taxon_key').in(columna, lote)
      if (error) throw new Error(`No se pudo consultar especie_rce: ${error.message}`)
      filas.push(...(data as RceTaxon[]))
    }
  }
  return filas
}

// Nombres comunes que ya usan registros de la base (vista de la app), con la clave de su especie.
export async function buscarNombresComunes(nombres: string[]): Promise<NombreComunConocido[]> {
  const filas: NombreComunConocido[] = []
  for (let i = 0; i < nombres.length; i += LOTE) {
    const { data, error } = await getSupabase()
      .from(REGISTROS_VIEW)
      .select('nombre_comun_terreno,gbif_taxon_key,canonical_name')
      .in('nombre_comun_terreno', nombres.slice(i, i + LOTE))
    if (error) throw new Error(`No se pudo consultar los nombres comunes: ${error.message}`)
    filas.push(...(data as NombreComunConocido[]))
  }
  return filas
}
