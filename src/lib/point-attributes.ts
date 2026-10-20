import type { Estacion } from '#/lib/estaciones'
import type { CsvMeta, PointOverride } from '#/lib/geo-export'
import { findProtocolo } from '#/lib/protocolos'

export type PointAttributes = { estacion: string; protocolo: string; metodologia: string }

// Único lugar que decide estación/protocolo/metodología de un punto.
// Precedencia: override del punto → estación → valor por defecto de la campaña (meta) → nombre del punto (solo estación).
export function resolvePointAttributes(
  pointName: string,
  meta: CsvMeta,
  override: PointOverride | undefined,
  estacion?: Estacion,
): PointAttributes {
  const estacionMetodologia = estacion ? estacion.metodologia.trim() || findProtocolo(estacion.protocolo)?.sigla || '' : ''
  return {
    estacion: override?.estacion?.trim() || estacion?.nombre.trim() || meta.estacion.trim() || pointName,
    protocolo: override?.protocolo?.trim() || estacion?.protocolo.trim() || meta.protocolo,
    metodologia: (override?.metodologia ?? (estacionMetodologia || meta.metodologia)).trim(),
  }
}
