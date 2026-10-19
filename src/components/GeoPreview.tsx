import { useEffect, useMemo, useState } from 'react'
import { trackLengthKm, type ImportResult, type LngLat } from '#/lib/geo-import'
import { searchSpecies, speciesLabel, type Species } from '#/lib/species'
import { exportCsv, exportKmz, metodologiaFor, nextMetodologia, type CsvMeta, type PointOverride } from '#/lib/geo-export'
import { formatUtm, toUtm, type UtmZone } from '#/lib/utm'

const W = 800
const H = 480
const PAD = 24

export default function GeoPreview({ data }: { data: ImportResult }) {
  const [selectedSpecies, setSelectedSpecies] = useState<Record<number, Species>>({})
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [meta, setMeta] = useState<CsvMeta>({ estacion: '', terreno: '', protocolo: '', metodologia: '' })
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [overrides, setOverrides] = useState<Record<number, PointOverride>>({})
  const [bulk, setBulk] = useState<PointOverride>({ estacion: '', protocolo: '', metodologia: '' })
  const [trackNames, setTrackNames] = useState<Record<number, string>>({})
  const [utmZone, setUtmZone] = useState<UtmZone>(19)
  const [removedPoints, setRemovedPoints] = useState<Set<number>>(() => new Set())
  const visiblePoints = data.points.filter((_, index) => !removedPoints.has(index))
  const visibleIndexes = data.points.map((_, index) => index).filter((index) => !removedPoints.has(index))
  const checkedIndexes = visibleIndexes.filter((index) => checked.has(index))
  const allChecked = visibleIndexes.length > 0 && checkedIndexes.length === visibleIndexes.length

  function toggleChecked(index: number) {
    setChecked((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  function applyBulk() {
    const estacion = bulk.estacion?.trim()
    const protocolo = bulk.protocolo?.trim()
    const metodologia = bulk.metodologia?.trim()
    setOverrides((current) => {
      const next = { ...current }
      for (const index of checkedIndexes) {
        const patch: PointOverride = {}
        if (estacion) patch.estacion = estacion
        if (protocolo) {
          patch.protocolo = protocolo
          patch.metodologia = metodologia || nextMetodologia(current[index]?.protocolo?.trim() || meta.protocolo, protocolo, current[index]?.metodologia ?? meta.metodologia)
        } else if (metodologia) {
          patch.metodologia = metodologia
        }
        next[index] = { ...next[index], ...patch }
      }
      return next
    })
  }
  const { project, hasData } = useMemo(() => {
    const all: LngLat[] = [
      ...visiblePoints.map((p) => p.coord),
      ...data.tracks.flatMap((t) => t.coords),
    ]
    if (all.length === 0) return { project: null, hasData: false }

    const lngs = all.map((c) => c[0])
    const lats = all.map((c) => c[1])
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    // Corrige la compresión de longitud según la latitud media
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const spanX = Math.max((maxLng - minLng) * kx, 1e-9)
    const spanY = Math.max(maxLat - minLat, 1e-9)
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
    const offX = (W - spanX * scale) / 2
    const offY = (H - spanY * scale) / 2

    return {
      hasData: true,
      project: ([lng, lat]: LngLat): [number, number] => [
        offX + (lng - minLng) * kx * scale,
        H - offY - (lat - minLat) * scale,
      ],
    }
  }, [data.tracks, visiblePoints])

  const totalKm = data.tracks.reduce((sum, t) => sum + trackLengthKm(t.coords), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="demo-card">
        {hasData && project ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-56 w-full"
            role="img"
            aria-label="Vista previa de puntos y tracks"
          >
            {data.tracks.map((t, i) => (
              <polyline
                key={i}
                points={t.coords.map((c) => project(c).join(',')).join(' ')}
                fill="none"
                stroke="var(--lagoon-deep)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <title>{t.name}</title>
              </polyline>
            ))}
            {visiblePoints.map((p) => {
              const [x, y] = project(p.coord)
              return (
                <circle
                  key={data.points.indexOf(p)}
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill="var(--palm)"
                  stroke="var(--surface-strong)"
                  strokeWidth={1.5}
                >
                  <title>{p.name}</title>
                </circle>
              )
            })}
          </svg>
        ) : (
          <p className="demo-muted m-0 p-6 text-center text-sm">
            El archivo no contiene puntos ni tracks.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="demo-pill">{data.format.toUpperCase()}</span>
          <span className="demo-pill">{visiblePoints.length} puntos</span>
          <span className="demo-pill">{data.tracks.length} tracks</span>
          {data.tracks.length > 0 && (
            <span className="demo-pill">{totalKm.toFixed(2)} km</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="utm-zone-control">
            Zona UTM
            <select className="demo-select utm-zone-select" value={utmZone} onChange={(event) => setUtmZone(Number(event.target.value) as UtmZone)}>
              <option value={18}>18S</option>
              <option value={19}>19S</option>
            </select>
          </label>
          <button type="button" className="demo-button demo-button-secondary" onClick={() => exportCsv(data, data.points.map((_, index) => index).filter((index) => !removedPoints.has(index)), selectedSpecies, quantities, meta, overrides)}>
            Exportar CSV
          </button>
          <button type="button" className="demo-button" onClick={() => exportKmz(data, data.points.map((_, index) => index).filter((index) => !removedPoints.has(index)), selectedSpecies, quantities, utmZone, trackNames)}>
            Exportar KMZ
          </button>
        </div>

        <div className="demo-list-item grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['terreno', 'Terreno', 'Nombre de la campaña'],
            ['estacion', 'Estación (por defecto)', 'Vacío = nombre de cada punto'],
            ['protocolo', 'Protocolo (por defecto)', 'Elige o escribe'],
            ['metodologia', 'Metodología (sigla)', 'Auto según protocolo'],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex flex-col gap-1 font-semibold">
              {label}
              <input
                className="demo-input"
                value={meta[key]}
                placeholder={hint}
                list={key === 'protocolo' ? 'protocolos-muestreo' : undefined}
                onChange={(event) => {
                  const value = event.target.value
                  setMeta((current) => ({
                    ...current,
                    [key]: value,
                    ...(key === 'protocolo' ? { metodologia: nextMetodologia(current.protocolo, value, current.metodologia) } : {}),
                  }))
                }}
              />
            </label>
          ))}
          <datalist id="protocolos-muestreo">
            <option value="Transecta" />
            <option value="Transecta para aves" />
            <option value="Censo" />
            <option value="Punto de aves" />
            <option value="Punto de conteo" />
            <option value="Recorrido pedestre" />
            <option value="Trampas cámara" />
            <option value="Trampas Sherman" />
            <option value="Detección de ecolocalizaciones" />
          </datalist>
          <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
            El CSV para la app solo incluye puntos con especie asignada ({visiblePoints.filter((p) => selectedSpecies[data.points.indexOf(p)]).length} de {visiblePoints.length}).
          </p>
        </div>

        {checkedIndexes.length > 0 && (
          <div className="demo-list-item flex flex-wrap items-end gap-2 text-sm">
            <span className="font-semibold">{checkedIndexes.length} seleccionados</span>
            <label className="flex flex-col gap-1 font-semibold">
              Estación
              <input className="demo-input" value={bulk.estacion} placeholder="Sin cambios si está vacío" onChange={(event) => setBulk((current) => ({ ...current, estacion: event.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Protocolo
              <input className="demo-input" list="protocolos-muestreo" value={bulk.protocolo} placeholder="Sin cambios si está vacío" onChange={(event) => {
                const value = event.target.value
                setBulk((current) => ({ ...current, protocolo: value, metodologia: nextMetodologia(current.protocolo, value, current.metodologia ?? '') }))
              }} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Metodología
              <input className="demo-input assign-input" value={bulk.metodologia} placeholder="Auto según protocolo" onChange={(event) => setBulk((current) => ({ ...current, metodologia: event.target.value }))} />
            </label>
            <button type="button" className="demo-button" disabled={!bulk.estacion?.trim() && !bulk.protocolo?.trim() && !bulk.metodologia?.trim()} onClick={applyBulk}>
              Aplicar
            </button>
            <button type="button" className="demo-button demo-button-secondary" onClick={() => setChecked(new Set())}>
              Deseleccionar
            </button>
          </div>
        )}

        {removedPoints.size > 0 && (
          <div className="demo-list-item flex items-center justify-between gap-3 text-sm">
            <span>Se quitaron {removedPoints.size} puntos de esta vista.</span>
            <button type="button" className="demo-button demo-button-secondary point-remove" onClick={() => setRemovedPoints(new Set())}>
              Restaurar
            </button>
          </div>
        )}

        {data.points.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="demo-section-title">Puntos · UTM {utmZone}S (WGS84)</h3>
            <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
              Puedes seleccionar puntos y definir protocolos y estaciones por grupo.
              También está la opción de eliminar puntos para limpiar la vista de la tabla.
            </p>
            <div className="demo-table-shell max-h-96 overflow-auto">
              <table className="demo-table text-sm whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="sticky-col sticky-col-check">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        aria-label="Seleccionar todos los puntos"
                        onChange={() => setChecked(allChecked ? new Set() : new Set(visibleIndexes))}
                      />
                    </th>
                    <th className="sticky-col sticky-col-name sticky-col-after-check">Nombre</th><th>Coordenadas (°)</th><th>UTM (m)</th><th>Fecha</th><th>Hora</th><th>Estación</th><th>Protocolo</th><th>Metodología</th><th>Especie</th><th>Cantidad</th><th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePoints.map((point) => {
                    const index = data.points.indexOf(point)
                    return (
                    <tr key={`p${index}`}>
                      <td className="sticky-col sticky-col-check">
                        <input
                          type="checkbox"
                          checked={checked.has(index)}
                          aria-label={`Seleccionar punto ${point.name}`}
                          onChange={() => toggleChecked(index)}
                        />
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
                          placeholder={meta.estacion.trim() || point.name}
                          aria-label={`Estación de ${point.name}`}
                          onChange={(event) => setOverrides((current) => ({ ...current, [index]: { ...current[index], estacion: event.target.value } }))}
                        />
                      </td>
                      <td>
                        <input
                          className="demo-input assign-input"
                          list="protocolos-muestreo"
                          value={overrides[index]?.protocolo ?? ''}
                          placeholder={meta.protocolo || 'Protocolo'}
                          aria-label={`Protocolo de ${point.name}`}
                          onChange={(event) => {
                            const value = event.target.value
                            setOverrides((current) => ({
                              ...current,
                              [index]: {
                                ...current[index],
                                protocolo: value,
                                metodologia: nextMetodologia(current[index]?.protocolo?.trim() || meta.protocolo, value, current[index]?.metodologia ?? meta.metodologia),
                              },
                            }))
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="demo-input assign-input"
                          value={overrides[index]?.metodologia ?? ''}
                          placeholder={meta.metodologia || metodologiaFor(overrides[index]?.protocolo) || 'Sigla'}
                          aria-label={`Metodología de ${point.name}`}
                          onChange={(event) => setOverrides((current) => ({ ...current, [index]: { ...current[index], metodologia: event.target.value } }))}
                        />
                      </td>
                      <td className="species-cell">
                        <SpeciesPicker
                          value={selectedSpecies[index]}
                          onSelect={(species) => setSelectedSpecies((current) => ({ ...current, [index]: species }))}
                        />
                      </td>
                      <td>
                        <input
                          className="demo-input quantity-input"
                          type="number"
                          min="1"
                          step="1"
                          value={quantities[index] ?? 1}
                          aria-label={`Cantidad para ${point.name}`}
                          onChange={(event) => {
                            const next = Number(event.target.value)
                            setQuantities((current) => ({ ...current, [index]: Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1 }))
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="demo-button alert demo-button-secondary point-remove"
                          aria-label={`Quitar punto ${point.name}`}
                          onClick={() => setRemovedPoints((current) => new Set(current).add(index))}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.tracks.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="demo-section-title">Tracks · UTM {utmZone}S (WGS84)</h3>
            <div className="demo-table-shell max-h-96 overflow-auto">
              <table className="demo-table text-sm whitespace-nowrap">
                <thead>
                  <tr><th className="sticky-col sticky-col-name">Nombre</th><th>Largo (m)</th><th>Inicio (°)</th><th>Término (°)</th><th>Inicio UTM (m)</th><th>Término UTM (m)</th></tr>
                </thead>
                <tbody>
                  {data.tracks.map((track, index) => {
                    const start = track.coords[0]
                    const end = track.coords[track.coords.length - 1]
                    return (
                      <tr key={`t${index}`}>
                        <td className="sticky-col sticky-col-name">
                          <input
                            className="demo-input assign-input"
                            value={trackNames[index] ?? track.name}
                            aria-label={`Nombre del track ${track.name}`}
                            onChange={(event) => setTrackNames((current) => ({ ...current, [index]: event.target.value }))}
                          />
                        </td>
                        <td className="demo-muted">{Math.round(trackLengthKm(track.coords) * 1000).toLocaleString('es-CL')}</td>
                        <td className="demo-muted">{formatCoordinate(start)}</td>
                        <td className="demo-muted">{formatCoordinate(end)}</td>
                        <td className="demo-muted">{formatUtm(toUtm(start, utmZone))}</td>
                        <td className="demo-muted">{formatUtm(toUtm(end, utmZone))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatCoordinate([lng, lat]: LngLat): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function formatTimestampPart(timestamp: string, part: 'date' | 'time'): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('es-CL', {
    ...(part === 'date' ? { dateStyle: 'short' as const } : { timeStyle: 'short' as const }),
  }).format(date)
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
