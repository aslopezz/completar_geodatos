import { pendientes } from '#/lib/import/destino'
import type { EspecieMatch, TaxonNuevo } from '#/lib/import/species-match'
import { nombreParaBuscar, type Destino, type ImportPreview } from '#/lib/import/types'
import { clearRegistrosCache } from '#/lib/registros'
import { getSupabase } from '#/lib/supabase'

// Guarda lo importado con la función cargar_planilla (supabase/cargar_planilla.sql): terrenos nuevos, especies nuevas
// y registros en una sola transacción. codigo_individuo no se guarda: solo hace falta para Rescate, que aún no se importa.

export type ResultadoGuardado = { terrenos_creados: number; registros: number; sin_comuna: number }

// Qué impide guardar (vacío = se puede guardar).
export function impedimentos(preview: ImportPreview, destino: Destino | null, especies: EspecieMatch[] | null): string[] {
  const faltan = pendientes(destino, preview.terrenos)
  if (preview.registros.length === 0) faltan.push('El archivo no tiene registros.')
  if (!especies) return [...faltan, 'Busca la clave GBIF de las especies.']
  const clave = new Map(especies.map((e) => [e.nombre, e.clave]))
  const sinClave = preview.registros.filter((r) => !clave.get(nombreParaBuscar(r) ?? ''))
  if (sinClave.length > 0) faltan.push(`${sinClave.length} registros no tienen especie con clave GBIF.`)
  return faltan
}

export async function guardarImportacion(preview: ImportPreview, destino: Destino, especies: EspecieMatch[]): Promise<ResultadoGuardado> {
  const clave = new Map(especies.map((e) => [e.nombre, e.clave!]))
  const taxa = new Map<number, TaxonNuevo>()
  for (const e of especies) if (e.taxon) taxa.set(e.taxon.gbif_taxon_key, e.taxon)

  const payload = {
    id_proyecto: destino.idProyecto,
    terrenos: preview.terrenos.map((t) => {
      const d = destino.terrenos[t.clave]
      return d.modo === 'existente'
        ? { clave: t.clave, id_terreno: d.idTerreno }
        : {
            clave: t.clave,
            nuevo: { nombre: t.nombre, tipo: d.tipo, componente: d.componente, fecha_inicio: t.fechaInicio, fecha_fin: t.fechaFin, objetivo: t.objetivo, comentarios: t.comentarios },
          }
    }),
    taxa: [...taxa.values()],
    registros: preview.registros.map((r) => ({
      terreno: r.terreno,
      comuna: r.comuna,
      localidad_especifica: r.localidad,
      protocolo_muestreo: r.protocolo,
      tipo_registro: r.tipoRegistro,
      gbif_taxon_key: clave.get(nombreParaBuscar(r)!),
      genero: r.genero,
      epiteto_especifico: r.epiteto,
      nombre_comun_terreno: r.nombreComun,
      cantidad: r.cantidad,
      fecha: r.fecha,
      hora: r.hora,
      usuario: r.usuario,
      lat: r.lat,
      lon: r.lon,
    })),
  }

  const { data, error } = await getSupabase().rpc('cargar_planilla', { p_payload: payload })
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
  clearRegistrosCache() // /registros y /mapa vuelven a pedir los datos
  return data as ResultadoGuardado
}
