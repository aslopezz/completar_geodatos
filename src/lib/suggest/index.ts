import { trackName } from '#/lib/geo-export'
import type { ImportResult } from '#/lib/geo-import'
import { estacionOf, findEstacionByName, visibleIndexes, type PointSessionState } from '#/lib/point-session'
import { byNamePrefix } from '#/lib/suggest/by-name-prefix'
import { byTrackName } from '#/lib/suggest/by-track-name'
import type { EstacionSuggester, EstacionSuggestion } from '#/lib/suggest/types'

// Agregar una estrategia nueva = un archivo nuevo y una línea aquí.
const SUGGESTERS: readonly EstacionSuggester[] = [byNamePrefix, byTrackName]

// Texto para cuando ninguna estrategia encuentra nada: qué busca cada una.
export const NO_SUGGESTIONS_HINT = `No se encontraron grupos. Se busca: ${SUGGESTERS.map((suggester) => suggester.hint).join('; ')}.`

// Sugerencias para los puntos visibles sin estación, sin modificar la sesión.
// Las de distintas estrategias con el mismo nombre (sin distinguir mayúsculas) se juntan en una.
export function suggestEstaciones(data: ImportResult, session: PointSessionState, trackNames: Record<number, string>): EstacionSuggestion[] {
  const unassigned = visibleIndexes(data, session.removed).filter((index) => !estacionOf(session, index))
  // Los tracks se evalúan con el nombre que el usuario les haya puesto en la tabla.
  const named = { ...data, tracks: data.tracks.map((track, index) => ({ ...track, name: trackName(track, index, trackNames) })) }
  const merged = new Map<string, EstacionSuggestion>()
  for (const suggestion of SUGGESTERS.flatMap((suggester) => suggester.suggest(named, unassigned))) {
    const key = suggestion.nombre.trim().toLowerCase()
    const previous = merged.get(key)
    merged.set(key, previous ? {
      nombre: previous.nombre,
      protocolo: previous.protocolo ?? suggestion.protocolo,
      trackIndex: previous.trackIndex ?? suggestion.trackIndex,
      points: [...new Set([...previous.points, ...suggestion.points])],
    } : suggestion)
  }
  // Una estación ya creada con ese nombre y sin puntos nuevos que sumar no aporta nada.
  return [...merged.values()].filter((suggestion) => suggestion.points.length > 0 || !findEstacionByName(session.estaciones, suggestion.nombre))
}
