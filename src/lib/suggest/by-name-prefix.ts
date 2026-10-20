import { findProtocolo } from '#/lib/protocolos'
import type { EstacionSuggester, EstacionSuggestion } from '#/lib/suggest/types'

// "TA1-01", "TA1_02", "TA1 03" → prefijo "TA1".
const NAME_PATTERN = /^(.+?)[-_\s]+\d+$/

// El protocolo solo se infiere si las letras del prefijo coinciden con una sigla del catálogo ("TA1" → "TA").
function protocoloFromPrefix(prefix: string): string | undefined {
  const letters = prefix.match(/^[A-Za-zÁÉÍÓÚáéíóúÑñ]+/)?.[0]
  const protocolo = findProtocolo(letters)
  return protocolo && protocolo.sigla && protocolo.sigla.toLowerCase() === letters?.toLowerCase() ? protocolo.nombre : undefined
}

export const byNamePrefix: EstacionSuggester = {
  id: 'by-name-prefix',
  label: 'Por prefijo del nombre',
  suggest(data, unassigned) {
    const groups = new Map<string, number[]>()
    for (const index of unassigned) {
      const prefix = data.points[index].name.trim().match(NAME_PATTERN)?.[1].trim()
      if (!prefix) continue
      groups.set(prefix, [...(groups.get(prefix) ?? []), index])
    }
    const suggestions: EstacionSuggestion[] = []
    for (const [nombre, points] of groups) {
      if (points.length < 2) continue
      suggestions.push({ nombre, protocolo: protocoloFromPrefix(nombre), points })
    }
    return suggestions
  },
}
