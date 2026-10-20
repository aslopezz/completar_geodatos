import type { ImportResult } from '#/lib/geo-import'

export type EstacionSuggestion = { nombre: string; protocolo?: string; points: number[]; trackIndex?: number }

// Contrato común: devuelve sugerencias sin modificar ningún estado.
export interface EstacionSuggester {
  id: string
  label: string
  suggest(data: ImportResult, unassigned: number[]): EstacionSuggestion[]
}
