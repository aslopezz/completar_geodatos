import { useMemo, useState } from 'react'
import { trackLengthKm, type ImportResult, type LngLat } from '#/lib/geo-import'
import type { Species } from '#/lib/species'
import { exportCsv, exportKmz, exportTracksCsv,metodologiaFor, nextMetodologia, type CsvMeta, type PointOverride } from '#/lib/geo-export'
import { getProtocolos } from '#/lib/protocolos'
import { resolvePointAttributes } from '#/lib/point-attributes'
import { useEstaciones } from '#/hooks/useEstaciones'
import EstacionesPanel from '#/components/EstacionesPanel'
import PointsTable, { type PointGroup } from '#/components/PointsTable'
import { estacionColor } from '#/lib/estaciones'
import { formatCoordinate } from '#/lib/format'
import { formatUtm, toUtm, type UtmZone } from '#/lib/utm'

const W = 800
const H = 480
const PAD = 24
const NO_ESTACION = '__none__'

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
  const { estaciones, create: createEstacion, update: updateEstacion, remove: removeEstacion, assign, unassign, getEstacionOf, pointsOfEstacion } = useEstaciones()
  const [assignTarget, setAssignTarget] = useState('')
  const estacionCounts = Object.fromEntries(estaciones.map((e) => [e.id, pointsOfEstacion(e.id).filter((index) => !removedPoints.has(index)).length]))
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

  function applyAssign() {
    if (assignTarget === NO_ESTACION) unassign(checkedIndexes)
    else if (assignTarget) assign(assignTarget, checkedIndexes)
    setAssignTarget('')
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
  function setPointProtocolo(index: number, value: string) {
    setOverrides((current) => ({
      ...current,
      [index]: {
        ...current[index],
        protocolo: value,
        metodologia: nextMetodologia(current[index]?.protocolo?.trim() || meta.protocolo, value, current[index]?.metodologia ?? meta.metodologia),
      },
    }))
  }

  function placeholdersFor(index: number) {
    const estacion = getEstacionOf(index)
    const base = resolvePointAttributes(data.points[index].name, meta, undefined, estacion)
    const sigla = metodologiaFor(overrides[index]?.protocolo)
    return {
      estacion: base.estacion,
      protocolo: base.protocolo || 'Protocolo',
      metodologia: (estacion ? sigla || base.metodologia : base.metodologia || sigla) || 'Sigla',
    }
  }

  // Un grupo por estación (en orden de creación, sin los vacíos) y "Sin asignar" al final.
  // Sin estaciones queda un solo grupo sin encabezado, igual que la tabla de siempre.
  const groups: PointGroup[] = estaciones.length === 0
    ? [{ key: 'all', label: null, indexes: visibleIndexes }]
    : [
        ...estaciones.map((estacion, order) => ({
          key: estacion.id,
          label: [estacion.nombre.trim() || '(sin nombre)', estacion.protocolo.trim()].filter(Boolean).join(' · '),
          color: estacionColor(order),
          indexes: visibleIndexes.filter((index) => getEstacionOf(index)?.id === estacion.id),
        })).filter((group) => group.indexes.length > 0),
        { key: 'none', label: 'Sin asignar', indexes: visibleIndexes.filter((index) => !getEstacionOf(index)) },
      ].filter((group) => group.indexes.length > 0)

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
            {visiblePoints.map((p) => {
              const [x, y] = project(p.coord)
              const index = data.points.indexOf(p)
              const estacionId = getEstacionOf(index)?.id
              const order = estaciones.findIndex((e) => e.id === estacionId)
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={4.5}
                  fill={order >= 0 ? estacionColor(order) : 'var(--palm)'}
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
          <button type="button" className="demo-button demo-button-points" onClick={() => exportCsv(data, data.points.map((_, index) => index).filter((index) => !removedPoints.has(index)), selectedSpecies, quantities, meta, overrides, getEstacionOf)}>
            Exportar CSV puntos
          </button>
           {data.tracks.length > 0 && (
            <button type="button" className="demo-button demo-button-tracks" onClick={() => exportTracksCsv(data, utmZone, trackNames)}>
              Exportar CSV tracks
            </button>
          )}
          <button type="button" className="demo-button demo-button-points" onClick={() => exportKmz(data, data.points.map((_, index) => index).filter((index) => !removedPoints.has(index)), selectedSpecies, quantities, utmZone, trackNames)}>
            Exportar KMZ
          </button>
        </div>

        <div className="demo-list-item grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 font-semibold">
            Terreno
            <input
              className="demo-input"
              value={meta.terreno}
              placeholder="Nombre de la campaña"
              onChange={(event) => {
                const value = event.target.value
                setMeta((current) => ({ ...current, terreno: value }))
              }}
            />
          </label>
          <datalist id="protocolos-muestreo">
            {getProtocolos().map((protocolo) => (
              <option key={protocolo.id} value={protocolo.nombre} label={protocolo.sigla ? `${protocolo.sigla} · ${protocolo.nombre}` : protocolo.nombre} />
            ))}
          </datalist>
          <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
            El CSV incluye todos los puntos; los que no tienen especie ({visiblePoints.filter((p) => !selectedSpecies[data.points.indexOf(p)]).length} de {visiblePoints.length}) salen con las columnas de especie vacías.
          </p>
        </div>

        <EstacionesPanel
          estaciones={estaciones}
          counts={estacionCounts}
          onCreate={() => createEstacion()}
          onUpdate={updateEstacion}
          onRemove={removeEstacion}
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
            <h3 className="demo-section-title">Puntos · UTM {utmZone}S y grados decimales</h3>
            <p className="demo-muted m-0 text-xs sm:col-span-2 lg:col-span-4">
              Puedes seleccionar puntos y definir protocolos y estaciones por grupo.
              También está la opción de eliminar puntos para limpiar la vista de la tabla.
            </p>
            <PointsTable
              points={data.points}
              groups={groups}
              utmZone={utmZone}
              checked={checked}
              allChecked={allChecked}
              overrides={overrides}
              species={selectedSpecies}
              quantities={quantities}
              placeholdersFor={placeholdersFor}
              onToggle={toggleChecked}
              onToggleAll={() => setChecked(allChecked ? new Set() : new Set(visibleIndexes))}
              onOverride={(index, patch) => setOverrides((current) => ({ ...current, [index]: { ...current[index], ...patch } }))}
              onProtocolo={setPointProtocolo}
              onSelectSpecies={(index, species) => setSelectedSpecies((current) => ({ ...current, [index]: species }))}
              onQuantity={(index, next) => setQuantities((current) => ({ ...current, [index]: Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1 }))}
              onRemove={(index) => setRemovedPoints((current) => new Set(current).add(index))}
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

