import { useMemo, useReducer, useState } from 'react'
import type { ImportResult, LngLat } from '#/lib/geo-import'
import { download } from '#/lib/export-file'
import { exportCsv, exportKmz, exportTracksCsv, trackSummary } from '#/lib/geo-export'
import { getProtocolos } from '#/lib/protocolos'
import {
  estacionColorOf,
  estacionCounts,
  groupPoints,
  initialPointSession,
  metodologiaFor,
  pointSessionReducer,
  resolvePoints,
  visibleIndexes as visibleIndexesOf,
} from '#/lib/point-session'
import EstacionesPanel from '#/components/EstacionesPanel'
import PointsTable from '#/components/PointsTable'
import { formatCoordinate } from '#/lib/format'
import { suggestEstaciones } from '#/lib/suggest'
import type { EstacionSuggestion } from '#/lib/suggest/types'
import { formatUtm, type UtmZone } from '#/lib/utm'

const W = 800
const H = 480
const PAD = 24
const NO_ESTACION = '__none__'

export default function GeoPreview({ data, onClear }: { data: ImportResult; onClear(): void }) {
  const [session, dispatch] = useReducer(pointSessionReducer, initialPointSession)
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [bulk, setBulk] = useState({ estacion: '', protocolo: '', metodologia: '' })
  const [trackNames, setTrackNames] = useState<Record<number, string>>({})
  const [utmZone, setUtmZone] = useState<UtmZone>(19)
  const [assignTarget, setAssignTarget] = useState('')
  const { estaciones, removed } = session
  const visibleIndexes = useMemo(() => visibleIndexesOf(data, removed), [data, removed])
  const visiblePoints = useMemo(() => visibleIndexes.map((index) => data.points[index]), [data, visibleIndexes])
  const checkedIndexes = visibleIndexes.filter((index) => checked.has(index))
  const allChecked = visibleIndexes.length > 0 && checkedIndexes.length === visibleIndexes.length

  const exportPoints = () => resolvePoints(data, session)

  function toggleChecked(index: number) {
    setChecked((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  // Descarga el archivo: la página padre desmonta este componente y con él todas las ediciones.
  function clearData() {
    if (window.confirm('¿Limpiar todo? Se cierra el archivo y se pierden las ediciones (especies, estaciones, nombres, puntos quitados).')) onClear()
  }

  // Si ya existe una estación con ese nombre, los puntos se suman a ella en vez de duplicarla.
  function applySuggestions(selected: EstacionSuggestion[]) {
    for (const { nombre, protocolo, points } of selected) {
      dispatch({ type: 'assignByName', nombre, protocolo, points, newId: crypto.randomUUID() })
    }
  }

  function applyAssign() {
    if (assignTarget) dispatch({ type: 'assign', id: assignTarget === NO_ESTACION ? null : assignTarget, points: checkedIndexes })
    setAssignTarget('')
  }

  function applyBulk() {
    const estacion = bulk.estacion.trim()
    const protocolo = bulk.protocolo.trim()
    const metodologia = bulk.metodologia.trim()
    if (estacion) dispatch({ type: 'assignByName', nombre: estacion, points: checkedIndexes, newId: crypto.randomUUID() })
    if (protocolo) dispatch({ type: 'setProtocolo', points: checkedIndexes, protocolo })
    if (metodologia) dispatch({ type: 'setMetodologia', points: checkedIndexes, metodologia })
  }

  const groups = groupPoints(session, visibleIndexes)

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
            {visibleIndexes.map((index) => {
              const p = data.points[index]
              const [x, y] = project(p.coord)
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill={estacionColorOf(session, index) ?? 'var(--palm)'}
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
          <label className="utm-zone-control">
            Zona UTM
            <select className="demo-select utm-zone-select" value={utmZone} onChange={(event) => setUtmZone(Number(event.target.value) as UtmZone)}>
              <option value={18}>18S</option>
              <option value={19}>19S</option>
            </select>
          </label>
          <button type="button" className="demo-button demo-button-points" onClick={() => download(exportCsv(data.fileName, exportPoints(), session.terreno))}>
            Exportar CSV puntos
          </button>
           {data.tracks.length > 0 && (
            <button type="button" className="demo-button demo-button-tracks" onClick={() => download(exportTracksCsv(data, utmZone, trackNames))}>
              Exportar CSV tracks
            </button>
          )}
          <button type="button" className="demo-button demo-button-points" onClick={() => download(exportKmz(data, exportPoints(), utmZone, trackNames))}>
            Exportar KMZ
          </button>
          <button type="button" className="demo-button alert" onClick={clearData}>
            Limpiar datos
          </button>
        </div>

        <div className="demo-list-item grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 font-semibold">
            Terreno
            <input
              className="demo-input"
              value={session.terreno}
              placeholder="Nombre de la campaña"
              onChange={(event) => dispatch({ type: 'setTerreno', terreno: event.target.value })}
            />
          </label>
          <datalist id="protocolos-muestreo">
            {getProtocolos().map((protocolo) => (
              <option key={protocolo.id} value={protocolo.nombre} label={protocolo.sigla ? `${protocolo.sigla} · ${protocolo.nombre}` : protocolo.nombre} />
            ))}
          </datalist>
          <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
            El CSV incluye todos los puntos; los que no tienen especie ({visibleIndexes.filter((index) => !session.edits[index]?.species).length} de {visibleIndexes.length}) salen con las columnas de especie vacías.
          </p>
        </div>

        <EstacionesPanel
          estaciones={estaciones}
          counts={estacionCounts(session)}
          onCreate={() => dispatch({ type: 'createEstacion', id: crypto.randomUUID() })}
          onUpdate={(id, patch) => dispatch({ type: 'updateEstacion', id, patch })}
          onRemove={(id) => dispatch({ type: 'removeEstacion', id })}
          onSuggest={() => suggestEstaciones(data, session, trackNames)}
          onApplySuggestions={applySuggestions}
        />

        {checkedIndexes.length > 0 && (
          <div className="demo-list-item flex flex-wrap items-end gap-2 text-sm">
            <span className="font-semibold">{checkedIndexes.length} seleccionados</span>
            {estaciones.length > 0 && (
              <>
                <label className="flex flex-col gap-1 font-semibold">
                  Asignar a estación
                  <select className="demo-select" value={assignTarget} onChange={(event) => setAssignTarget(event.target.value)}>
                    <option value="" disabled>Elegir…</option>
                    <option value={NO_ESTACION}>— Sin estación —</option>
                    {estaciones.map((estacion) => (
                      <option key={estacion.id} value={estacion.id}>{estacion.nombre.trim() || '(sin nombre)'}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="demo-button" disabled={!assignTarget} onClick={applyAssign}>
                  Asignar
                </button>
              </>
            )}
            <label className="flex flex-col gap-1 font-semibold">
              Estación
              <input className="demo-input" value={bulk.estacion} placeholder="Sin cambios si está vacío" onChange={(event) => setBulk((current) => ({ ...current, estacion: event.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Protocolo
              <input className="demo-input" list="protocolos-muestreo" value={bulk.protocolo} placeholder="Sin cambios si está vacío" onChange={(event) => setBulk((current) => ({ ...current, protocolo: event.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Metodología
              <input className="demo-input assign-input" value={bulk.metodologia} placeholder={metodologiaFor(bulk.protocolo) || 'Auto según protocolo'} onChange={(event) => setBulk((current) => ({ ...current, metodologia: event.target.value }))} />
            </label>
            <button type="button" className="demo-button" disabled={!bulk.estacion.trim() && !bulk.protocolo.trim() && !bulk.metodologia.trim()} onClick={applyBulk}>
              Aplicar
            </button>
            <button type="button" className="demo-button demo-button-secondary" onClick={() => setChecked(new Set())}>
              Deseleccionar
            </button>
          </div>
        )}

        {removed.size > 0 && (
          <div className="demo-list-item flex items-center justify-between gap-3 text-sm">
            <span>Se quitaron {removed.size} puntos de esta vista.</span>
            <button type="button" className="demo-button demo-button-secondary point-remove" onClick={() => dispatch({ type: 'restorePoints' })}>
              Restaurar
            </button>
          </div>
        )}

        {data.points.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="demo-section-title">Puntos · UTM {utmZone}S y grados decimales</h3>
            <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
              Puedes seleccionar puntos y definir protocolos y estaciones por grupo.
              También está la opción de eliminar puntos para limpiar la vista de la tabla.
            </p>
            <PointsTable
              points={data.points}
              groups={groups}
              utmZone={utmZone}
              session={session}
              dispatch={dispatch}
              checked={checked}
              allChecked={allChecked}
              onToggle={toggleChecked}
              onToggleAll={() => setChecked(allChecked ? new Set() : new Set(visibleIndexes))}
            />
          </div>
        )}

        {data.tracks.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2 mt-2">
            <h3 className="demo-section-title">Tracks · UTM {utmZone}S y grados decimales</h3>
            <div className="demo-table-shell max-h-96 overflow-auto">
              <table className="demo-table text-sm whitespace-nowrap">
                <thead>
                  <tr><th className="sticky-col sticky-col-name">Nombre</th><th>Largo (m)</th><th>Inicio (°)</th><th>Término (°)</th><th>Inicio UTM (m)</th><th>Término UTM (m)</th></tr>
                </thead>
                <tbody>
                  {data.tracks.map((track, index) => {
                    const { start, end, startUtm, endUtm, lengthKm } = trackSummary(track, utmZone)
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
                        <td className="demo-muted">{Math.round(lengthKm * 1000).toLocaleString('es-CL')}</td>
                        <td className="demo-muted">{formatCoordinate(start)}</td>
                        <td className="demo-muted">{formatCoordinate(end)}</td>
                        <td className="demo-muted">{formatUtm(startUtm)}</td>
                        <td className="demo-muted">{formatUtm(endUtm)}</td>
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

