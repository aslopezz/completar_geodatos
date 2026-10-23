import { useEffect, useState, type Dispatch } from 'react'
import type { GeoPoint } from '#/lib/geo-import'
import { estacionOf, inheritedAttributes, pointEdit, type PointGroup, type PointSessionAction, type PointSessionState } from '#/lib/point-session'
import { formatCoordinate, formatTimestampPart } from '#/lib/format'
import { searchSpecies, speciesLabel, type Species } from '#/lib/species'
import { formatUtm, toUtm, type UtmZone } from '#/lib/utm'

type Props = {
  points: GeoPoint[]
  groups: PointGroup[]
  utmZone: UtmZone
  session: PointSessionState
  dispatch: Dispatch<PointSessionAction>
  checked: Set<number>
  allChecked: boolean
  onToggle(index: number): void
  onToggleAll(): void
}

const COLUMNS = 12

export default function PointsTable({ points, groups, utmZone, session, dispatch, checked, allChecked, onToggle, onToggleAll }: Props) {
  return (
    <div className="demo-table-shell max-h-96 overflow-auto">
      <table className="demo-table text-sm whitespace-nowrap">
        <thead>
          <tr>
            <th className="sticky-col sticky-col-check">
              <input type="checkbox" checked={allChecked} aria-label="Seleccionar todos los puntos" onChange={onToggleAll} />
            </th>
            <th className="sticky-col sticky-col-name sticky-col-after-check">Nombre</th><th>Coordenadas (°)</th><th>UTM (m)</th><th>Fecha</th><th>Hora</th><th>Estación</th><th>Protocolo</th><th>Metodología</th><th>Especie</th><th>Cantidad</th><th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRows key={group.key} group={group}>
              {group.indexes.map((index) => {
                const point = points[index]
                const edit = pointEdit(session, index)
                const inherited = inheritedAttributes(session, index, point.name)
                return (
                  <tr key={`p${index}`}>
                    <td className="sticky-col sticky-col-check">
                      <input type="checkbox" checked={checked.has(index)} aria-label={`Seleccionar punto ${point.name}`} onChange={() => onToggle(index)} />
                    </td>
                    <td className="sticky-col sticky-col-name sticky-col-after-check">{point.name}</td>
                    <td className="demo-muted">{formatCoordinate(point.coord)}</td>
                    <td className="demo-muted">{formatUtm(toUtm(point.coord, utmZone))}</td>
                    <td className="demo-muted">{point.timestamp ? formatTimestampPart(point.timestamp, 'date') : '—'}</td>
                    <td className="demo-muted">{point.timestamp ? formatTimestampPart(point.timestamp, 'time') : '—'}</td>
                    <td>
                      <EstacionInput
                        value={estacionOf(session, index)?.nombre ?? ''}
                        placeholder={point.name}
                        label={`Estación de ${point.name}`}
                        onCommit={(nombre) => dispatch({ type: 'assignByName', nombre, points: [index], newId: crypto.randomUUID() })}
                      />
                    </td>
                    <td>
                      <input
                        className="demo-input assign-input"
                        list="protocolos-muestreo"
                        value={edit.protocolo ?? ''}
                        placeholder={inherited.protocolo || 'Protocolo'}
                        aria-label={`Protocolo de ${point.name}`}
                        onChange={(event) => dispatch({ type: 'setProtocolo', points: [index], protocolo: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="demo-input assign-input"
                        value={edit.metodologia ?? ''}
                        placeholder={inherited.metodologia || 'Sigla'}
                        aria-label={`Metodología de ${point.name}`}
                        onChange={(event) => dispatch({ type: 'setMetodologia', points: [index], metodologia: event.target.value })}
                      />
                    </td>
                    <td className="species-cell">
                      <SpeciesPicker value={edit.species} onSelect={(species) => dispatch({ type: 'setSpecies', index, species })} />
                    </td>
                    <td>
                      <input
                        className="demo-input quantity-input"
                        type="number"
                        min="1"
                        step="1"
                        value={edit.cantidad ?? 1}
                        aria-label={`Cantidad para ${point.name}`}
                        onChange={(event) => dispatch({ type: 'setCantidad', index, cantidad: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="demo-button alert demo-button-secondary point-remove"
                        aria-label={`Quitar punto ${point.name}`}
                        onClick={() => dispatch({ type: 'removePoint', index })}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </GroupRows>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupRows({ group, children }: { group: PointGroup; children: React.ReactNode }) {
  return (
    <>
      {group.label !== null && (
        <tr className="group-row">
          <td colSpan={COLUMNS}>
            <span className="group-row-label">
              {group.color && <span className="estacion-dot" style={{ background: group.color }} />}
              {group.label} · {group.indexes.length} {group.indexes.length === 1 ? 'punto' : 'puntos'}
            </span>
          </td>
        </tr>
      )}
      {children}
    </>
  )
}

// Escribir un nombre mueve el punto a esa estación (se crea si no existe); vacío lo deja sin estación.
// Se confirma con Enter o al salir del campo, para no crear una estación por cada letra.
function EstacionInput({ value, placeholder, label, onCommit }: { value: string; placeholder: string; label: string; onCommit(nombre: string): void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      className="demo-input assign-input"
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (draft.trim() !== value.trim()) onCommit(draft) }}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
    />
  )
}

function SpeciesPicker({ value, onSelect }: { value?: Species; onSelect: (species: Species) => void }) {
  const [query, setQuery] = useState(value ? speciesLabel(value) : '')
  const [results, setResults] = useState<Species[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || query.trim().length < 2 || (value && query === speciesLabel(value))) {
      setResults([])
      setError(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchSpecies(query, controller.signal).then((found) => { setResults(found); setError(false); setLoading(false) }).catch((e: unknown) => {
        if (e instanceof Error && e.name === 'AbortError') return
        setError(true)
        setLoading(false)
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, query, value])

  return (
    <div className="species-picker">
      <input
        className="demo-input species-search"
        value={query}
        placeholder="Nombre científico…"
        aria-label="Buscar especie por nombre científico"
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {loading && <span className="species-spinner" role="status" aria-label="Buscando especie" />}
      {open && query.trim().length >= 2 && (results.length > 0 || error) && (
        <div className="species-options" role="listbox">
          {error && <p className="demo-muted species-message">No se pudo cargar el catálogo.</p>}
          {results.map((species, index) => (
            <button
              type="button"
              className="species-option"
              key={`${speciesLabel(species)}-${species.nombre_comun_terreno}-${index}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onSelect(species); setQuery(speciesLabel(species)); setOpen(false) }}
            >
              <span>{speciesLabel(species) || 'Sin nombre científico'}{species.fuente === 'gbif' && <small className="demo-muted"> · GBIF</small>}</span>
              {species.nombre_comun_terreno && <small className="demo-muted">{species.nombre_comun_terreno}</small>}
            </button>
          ))}
        </div>
      )}
      {value && <span className="species-selected">{value.nombre_comun_terreno || speciesLabel(value)}</span>}
    </div>
  )
}
