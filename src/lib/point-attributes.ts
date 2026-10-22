import type { Estacion } from '#/lib/estaciones'
import type { ImportResult, LngLat } from '#/lib/geo-import'
import { findProtocolo } from '#/lib/protocolos'
import type { Species } from '#/lib/species'

export type PointOverride = { estacion?: string; protocolo?: string; metodologia?: string }
export type CsvMeta = { estacion: string; terreno: string; protocolo: string; metodologia: string }
export type PointAttributes = { estacion: string; protocolo: string; metodologia: string }

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

// Un punto listo para exportar: todo lo que la edición decidió sobre él, ya resuelto.
export type ExportPoint = PointAttributes & {
  name: string
  coord: LngLat
  timestamp?: string
  species?: Species
  cantidad: number
}

// Estado de edición de la sesión; los índices son posiciones en data.points.
export type PointSession = {
  removed: ReadonlySet<number>
  species: Record<number, Species>
  quantities: Record<number, number>
  overrides: Record<number, PointOverride>
  meta: CsvMeta
  getEstacionOf?: (index: number) => Estacion | undefined
}

// Puntos visibles (sin los quitados), en el orden del archivo, con sus atributos resueltos.
export function resolvePoints(data: ImportResult, session: PointSession): ExportPoint[] {
  return data.points.flatMap((point, index) =>
    session.removed.has(index)
      ? []
      : [
          {
            ...resolvePointAttributes(point.name, session.meta, session.overrides[index], session.getEstacionOf?.(index)),
            name: point.name,
            coord: point.coord,
            timestamp: point.timestamp,
            species: session.species[index],
            cantidad: session.quantities[index] ?? 1,
          },
        ],
  )
}
