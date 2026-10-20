import { useEffect, useRef } from 'react'
import { estacionColor, type Estacion } from '#/lib/estaciones'
import { findProtocolo } from '#/lib/protocolos'

type Props = {
  estaciones: Estacion[]
  counts: Record<string, number>
  onCreate(): void
  onUpdate(id: string, patch: { nombre?: string; protocolo?: string }): void
  onRemove(id: string): void
}

export default function EstacionesPanel({ estaciones, counts, onCreate, onUpdate, onRemove }: Props) {
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
                  <td className="demo-muted">{estacion.metodologia || findProtocolo(estacion.protocolo)?.sigla || '—'}</td>
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
      <div>
        <button type="button" className="demo-button demo-button-secondary" onClick={onCreate}>
          + Nueva estación
        </button>
      </div>
    </div>
  )
}
