import { byNamePrefix } from '#/lib/suggest/by-name-prefix'
import { byTrackName } from '#/lib/suggest/by-track-name'
import type { EstacionSuggester } from '#/lib/suggest/types'

// Agregar una estrategia nueva = un archivo nuevo y una línea aquí.
export const SUGGESTERS: readonly EstacionSuggester[] = [byNamePrefix, byTrackName]
