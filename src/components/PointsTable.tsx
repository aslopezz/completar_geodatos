import { useEffect, useState } from 'react'
import type { GeoPoint } from '#/lib/geo-import'
import type { PointOverride } from '#/lib/point-attributes'
import { formatCoordinate, formatTimestampPart } from '#/lib/format'
import { searchSpecies, speciesLabel, type Species } from '#/lib/species'
import { formatUtm, toUtm, type UtmZone } from '#/lib/utm'

// label null = tabla sin agrupar (no hay estaciones): no se dibuja fila de encabezado.
export type PointGroup = { key: string; label: string | null; color?: string; indexes: number[] }

type Placeholders = { estacion: string; protocolo: string; metodologia: string }

type Props = {
  points: GeoPoint[]
  groups: PointGroup[]
  utmZone: UtmZone
  checked: Set<number>
  allChecked: boolean
  overrides: Record<number, PointOverride>
  species: Record<number, Species>
  quantities: Record<number, number>
  placeholdersFor(index: number): Placeholders
  onToggle(index: number): void
  onToggleAll(): void
  onOverride(index: number, patch: PointOverride): void
  onProtocolo(index: number, value: string): void
  onSelectSpecies(index: number, species: Species): void
  onQuantity(index: number, value: number): void
  onRemove(index: number): void
}

const COLUMNS = 12

export default function PointsTable({
  points, groups, utmZone, checked, allChecked, overrides, species, quantities,
  placeholdersFor, onToggle, onToggleAll, onOverride, onProtocolo, onSelectSpecies, onQuantity, onRemove,
}: Props) {
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
                const placeholders = placeholdersFor(index)
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
                      <input
                        className="demo-input assign-input"
                        value={overrides[index]?.estacion ?? ''}
                        placeholder={placeholders.estacion}
                        aria-label={`Estación de ${point.name}`}
                        onChange={(event) => onOverride(index, { estacion: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="demo-input assign-input"
                        list="protocolos-muestreo"
                        value={overrides[index]?.protocolo ?? ''}
                        placeholder={placeholders.protocolo}
                        aria-label={`Protocolo de ${point.name}`}
                        onChange={(event) => onProtocolo(index, event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="demo-input assign-input"
                        value={overrides[index]?.metodologia ?? ''}
                        placeholder={placeholders.metodologia}
                        aria-label={`Metodología de ${point.name}`}
                        onChange={(event) => onOverride(index, { metodologia: event.target.value })}
                      />
                    </td>
                    <td className="species-cell">
                      <SpeciesPicker value={species[index]} onSelect={(selected) => onSelectSpecies(index, selected)} />
                    </td>
                    <td>
                      <input
                        className="demo-input quantity-input"
                        type="number"
                        min="1"
                        step="1"
                        value={quantities[index] ?? 1}
                        aria-label={`Cantidad para ${point.name}`}
                        onChange={(event) => onQuantity(index, Number(event.target.value))}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="demo-button alert demo-button-secondary point-remove"
                        aria-label={`Quitar punto ${point.name}`}
                        onClick={() => onRemove(index)}
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
