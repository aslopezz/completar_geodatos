import { useEffect, useMemo, useRef, useState } from 'react'
import { download } from '#/lib/export-file'
import { estacionKey, type ExportPoint, type PointSessionAction, type SmaDatos } from '#/lib/point-session'
import { ubicacionDe } from '#/lib/sma/comunas'
import { COMUNAS, ECOSISTEMAS_1, ECOSISTEMAS_2, TIPOS_MONITOREO, TIPOS_REGISTRO } from '#/lib/sma/listas'
import { buildPlanilla, estacionesSma, tipoMonitoreoDe, tracksSinEstacion, type EstacionSma, type Extras } from '#/lib/sma/planilla'

type Props = {
  open: boolean
  onClose(): void
  fileName: string
  terreno: string
  sma: SmaDatos
  points: ExportPoint[]
  extras: Extras
  dispatch(action: PointSessionAction): void
}

type CampoTexto = 'muestreadoPor' | 'objetivo' | 'comentarios'
type CampoLista = 'ecosistema1' | 'ecosistema2' | 'tipoRegistro'

const OPCIONALES_TEXTO: [CampoTexto, string, string][] = [
  ['muestreadoPor', 'Muestreado e identificado por', 'Nombres separados por ";"'],
  ['objetivo', 'Objetivo de la campaña', ''],
  ['comentarios', 'Comentarios de la campaña', ''],
]

const OPCIONALES_LISTA: [CampoLista, string, readonly string[]][] = [
  ['tipoRegistro', 'Tipo de registro', TIPOS_REGISTRO],
  ['ecosistema1', 'Ecosistema nivel 1', ECOSISTEMAS_1],
  ['ecosistema2', 'Ecosistema nivel 2', ECOSISTEMAS_2],
]

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      {children}
      {hint && <span className="demo-muted text-xs font-normal">{hint}</span>}
    </label>
  )
}

// Una estación y su tipo de monitoreo; la opción vacía es el propuesto (o "Elegir…" si no hay propuesta).
function FilaTipo({ estacion, propuesto, sma, dispatch }: { estacion: EstacionSma; propuesto: string; sma: SmaDatos; dispatch: Props['dispatch'] }) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,14rem)] items-center gap-3">
      <span className="truncate">
        {estacion.nombre}{' '}
        <span className="demo-muted text-xs">
          · {estacion.puntos.length} puntos{estacion.track ? ' · track' : ''}
        </span>
      </span>
      <select
        className="demo-select"
        value={sma.tipoMonitoreo[estacionKey(estacion.nombre)] ?? ''}
        onChange={(ev) => dispatch({ type: 'setTipoMonitoreo', estacion: estacion.nombre, tipo: ev.target.value })}
      >
        <option value="">{propuesto ? `${propuesto} (propuesto)` : 'Elegir…'}</option>
        {TIPOS_MONITOREO.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}

// Se abre con "Exportar planilla SMA": pide solo lo que no se puede deducir (la comuna, y el tipo de monitoreo
// de las estaciones donde no se puede proponer). Lo demás se asume o es opcional. Lo escrito queda en la sesión.
export default function SmaDialog({ open, onClose, fileName, terreno, sma, points, extras, dispatch }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (open && el && !el.open) el.showModal()
    if (!open && el?.open) el.close()
  }, [open])

  const set = (patch: Partial<Omit<SmaDatos, 'tipoMonitoreo'>>) => dispatch({ type: 'setSma', patch })

  // Solo con la ventana abierta; las estaciones se calculan una vez y las usan la lista, los tracks sueltos y la planilla.
  const estaciones = useMemo(() => (open ? estacionesSma(points, extras) : []), [open, points, extras])
  const planilla = useMemo(() => buildPlanilla(points, terreno, sma, estaciones), [points, terreno, sma, estaciones])
  const sueltos = useMemo(() => tracksSinEstacion(estaciones, extras.tracks), [estaciones, extras.tracks])
  const sinTipo = estaciones.filter((e) => !tipoMonitoreoDe({ ...sma, tipoMonitoreo: {} }, e))
  const elegidas = estaciones.filter((e) => sma.tipoMonitoreo[estacionKey(e.nombre)] && !sinTipo.includes(e))
  const propuestas = estaciones.filter((e) => !sinTipo.includes(e) && !elegidas.includes(e))
  const { avisos, ocurrencias } = planilla
  const ubicacion = ubicacionDe(sma.comuna)
  const comunaValida = (COMUNAS as readonly string[]).includes(sma.comuna)

  async function descargar() {
    setSaving(true)
    setError(null)
    try {
      // Se carga solo al exportar: la plantilla no hace falta para el resto de la herramienta.
      const { writePlanilla } = await import('#/lib/sma/xlsx')
      download(await writePlanilla(planilla, fileName))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la planilla')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose} className="demo-dialog" aria-labelledby="sma-dialog-title">
      {open && (
        <>
          <header className="demo-dialog-header flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <h2 id="sma-dialog-title" className="demo-section-title">
                Planilla SMA
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <span className="demo-pill">{terreno.trim() || 'Terreno sin nombre'}</span>
                <span className="demo-pill">{ocurrencias.length} registros</span>
                <span className="demo-pill">{estaciones.length} estaciones</span>
              </div>
            </div>
            <button type="button" className="demo-button demo-button-secondary" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </header>

          <div className="demo-dialog-body">
            <section className="flex flex-col gap-3">
              <h3 className="island-kicker m-0">Ubicación</h3>
              <Campo
                label="Comuna"
                hint={ubicacion ? `${ubicacion.provincia}, ${ubicacion.region}` : sma.comuna && !comunaValida ? 'Elige una comuna de la lista' : undefined}
              >
                <input
                  className="demo-input font-normal"
                  list="sma-comunas"
                  value={sma.comuna}
                  placeholder="Escribe para buscar"
                  onChange={(e) => set({ comuna: e.target.value })}
                />
                <datalist id="sma-comunas">
                  {COMUNAS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Campo>
              <Campo label="Localidad" hint="Opcional. Ej.: Quebrada El Cura">
                <input className="demo-input font-normal" value={sma.localidad} onChange={(e) => set({ localidad: e.target.value })} />
              </Campo>
            </section>

            {estaciones.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="island-kicker m-0">Tipo de monitoreo</h3>
                {[...sinTipo, ...elegidas].map((e) => (
                  <FilaTipo key={estacionKey(e.nombre)} estacion={e} propuesto={tipoMonitoreoDe({ ...sma, tipoMonitoreo: {} }, e)} sma={sma} dispatch={dispatch} />
                ))}
                {propuestas.length > 0 && (
                  <details>
                    <summary className="demo-muted cursor-pointer text-xs">
                      {sinTipo.length + elegidas.length > 0 ? 'Las demás' : 'Todas'} lo toman de su protocolo o su track. Ver o cambiar los propuestos ({propuestas.length})
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      {propuestas.map((e) => (
                        <FilaTipo key={estacionKey(e.nombre)} estacion={e} propuesto={tipoMonitoreoDe({ ...sma, tipoMonitoreo: {} }, e)} sma={sma} dispatch={dispatch} />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            )}

            {sueltos.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="island-kicker m-0">Tracks sin estación</h3>
                <p className="demo-muted m-0 text-xs">Si alguno es un transecto, agrégalo: la planilla toma su inicio, término y largo.</p>
                <div className="flex flex-wrap gap-2">
                  {sueltos.map((nombre) => (
                    <button
                      key={nombre}
                      type="button"
                      className="demo-button demo-button-secondary"
                      onClick={() => dispatch({ type: 'assignByName', nombre, points: [], newId: crypto.randomUUID(), protocolo: 'Transecta' })}
                    >
                      + {nombre}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <details className="flex flex-col gap-3">
              <summary className="island-kicker cursor-pointer">Más datos (opcional)</summary>
              <div className="mt-3 flex flex-col gap-3">
                {OPCIONALES_TEXTO.map(([campo, label, placeholder]) => (
                  <Campo key={campo} label={label}>
                    <input className="demo-input font-normal" value={sma[campo]} placeholder={placeholder} onChange={(e) => set({ [campo]: e.target.value })} />
                  </Campo>
                ))}
                {OPCIONALES_LISTA.map(([campo, label, opciones]) => (
                  <Campo key={campo} label={label}>
                    <select className="demo-select font-normal" value={sma[campo]} onChange={(e) => set({ [campo]: e.target.value })}>
                      <option value="">—</option>
                      {opciones.map((o) => (
                        <option key={o} value={o}>
                          {o.trim()}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ))}
                <p className="demo-muted m-0 text-xs">
                  Se asume en todos los registros: estado Vivo, exposición No Aplica, Abundancia absoluta en Individuos. Horas en UTC−4, como pide la SMA.
                </p>
              </div>
            </details>
          </div>

          <footer className="demo-dialog-footer flex flex-col gap-3">
            {(avisos.length > 0 || error) && (
              <ul className="m-0 flex flex-col gap-1 pl-5 text-xs text-[var(--alert-text)]">
                {avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
                {error && <li>{error}</li>}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="demo-button demo-button-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="demo-button demo-button-points" disabled={saving || ocurrencias.length === 0} onClick={descargar}>
                {saving ? 'Generando…' : 'Descargar planilla'}
              </button>
            </div>
          </footer>
        </>
      )}
    </dialog>
  )
}
