import { useEffect, useRef, useState } from 'react'
import { estacionColor, metodologiaFor, type Estacion } from '#/lib/point-session'
import { NO_SUGGESTIONS_HINT } from '#/lib/suggest'
import type { EstacionSuggestion } from '#/lib/suggest/types'

type Props = {
  estaciones: Estacion[]
  counts: Record<string, number>
  onCreate(): void
  onUpdate(id: string, patch: { nombre?: string; protocolo?: string }): void
  onRemove(id: string): void
  onSuggest(): EstacionSuggestion[]
  onApplySuggestions(selected: EstacionSuggestion[]): void
}

export default function EstacionesPanel({ estaciones, counts, onCreate, onUpdate, onRemove, onSuggest, onApplySuggestions }: Props) {
  // null = sin sugerencias abiertas; selected = índices de las sugerencias marcadas
  const [suggestions, setSuggestions] = useState<EstacionSuggestion[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  function openSuggestions() {
    const found = onSuggest()
    setSuggestions(found)
    setSelected(new Set(found.map((_, index) => index)))
  }

  function applySuggestions() {
    onApplySuggestions((suggestions ?? []).filter((_, index) => selected.has(index)))
    setSuggestions(null)
  }

  const container = useRef<HTMLDivElement>(null)
  const previousCount = useRef(estaciones.length)

  // Al agregar una estación, el foco va al nombre de la nueva fila.
  useEffect(() => {
    if (estaciones.length > previousCount.current) {
      const inputs = container.current?.querySelectorAll<HTMLInputElement>('input[data-estacion-nombre]')
      inputs?.[inputs.length - 1]?.focus()
    }
    previousCount.current = estaciones.length
  }, [estaciones.length])

  return (
    <div className="demo-list-item flex flex-col gap-2 text-sm" ref={container}>
      <h3 className="demo-section-title">Estaciones</h3>
      {estaciones.length === 0 ? (
        <p className="demo-muted m-0 text-xs">Crea estaciones para agrupar puntos y asignarles protocolo.</p>
      ) : (
        <div className="demo-table-shell overflow-auto">
          <table className="demo-table text-sm whitespace-nowrap">
            <thead>
              <tr><th>Nombre</th><th>Protocolo</th><th>Metodología</th><th>Puntos</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {estaciones.map((estacion, order) => (
                <tr key={estacion.id}>
                  <td className="flex items-center gap-2">
                    <span className="estacion-dot" style={{ background: estacionColor(order) }} />
                    <input
                      className="demo-input assign-input"
                      data-estacion-nombre
                      value={estacion.nombre}
                      placeholder="Nombre"
                      aria-label="Nombre de la estación"
                      onChange={(event) => onUpdate(estacion.id, { nombre: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="demo-input assign-input"
                      list="protocolos-muestreo"
                      value={estacion.protocolo}
                      placeholder="Protocolo"
                      aria-label={`Protocolo de la estación ${estacion.nombre}`}
                      onChange={(event) => onUpdate(estacion.id, { protocolo: event.target.value })}
                    />
                  </td>
                  <td className="demo-muted">{metodologiaFor(estacion.protocolo) || '—'}</td>
                  <td className="demo-muted">{counts[estacion.id] ?? 0}</td>
                  <td>
                    <button
                      type="button"
                      className="demo-button demo-button-secondary point-remove"
                      aria-label={`Quitar estación ${estacion.nombre}`}
                      onClick={() => onRemove(estacion.id)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="demo-button demo-button-secondary" onClick={onCreate}>
          + Nueva estación
        </button>
        <button type="button" className="demo-button demo-button-secondary" onClick={openSuggestions}>
          Sugerir estaciones
        </button>
      </div>
      {suggestions && (
        <div className="flex flex-col gap-2">
          {suggestions.length === 0 ? (
            <p className="demo-muted m-0 text-xs">{NO_SUGGESTIONS_HINT}</p>
          ) : (
            suggestions.map((suggestion, index) => (
              <label key={`${suggestion.nombre}-${index}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(index)}
                  onChange={() => setSelected((current) => {
                    const next = new Set(current)
                    if (!next.delete(index)) next.add(index)
                    return next
                  })}
                />
                <span>
                  {suggestion.nombre} → {suggestion.trackIndex !== undefined && suggestion.points.length === 0 ? 'desde el track' : `${suggestion.points.length} puntos`}
                  {suggestion.protocolo && <span className="demo-muted"> · {suggestion.protocolo}</span>}
                </span>
              </label>
            ))
          )}
          <div className="flex gap-2">
            {suggestions.length > 0 && (
              <button type="button" className="demo-button" disabled={selected.size === 0} onClick={applySuggestions}>
                Aplicar
              </button>
            )}
            <button type="button" className="demo-button demo-button-secondary" onClick={() => setSuggestions(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
