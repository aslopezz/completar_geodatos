import { useEffect, useState } from 'react'
import { destinoInicial, pendientes } from '#/lib/import/destino'
import type { Destino, DestinoTerreno, ImportTerreno } from '#/lib/import/types'
import { COMPONENTES, fetchProyectos, fetchTerrenos, TIPOS, type Proyecto, type Terreno } from '#/lib/terrenos'

type Props = {
  terrenos: ImportTerreno[] // los del archivo
  registrosPorTerreno: Map<string, number>
  destino: Destino | null
  onChange: (destino: Destino | null) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="demo-muted flex flex-col gap-1 text-xs font-semibold">
      {label}
      {children}
    </label>
  )
}

function OpcionesDe({ opciones }: { opciones: Record<string, string> }) {
  return (
    <>
      <option value="">Elige</option>
      {Object.entries(opciones).map(([valor, nombre]) => (
        <option key={valor} value={valor}>
          {nombre}
        </option>
      ))}
    </>
  )
}

export function DestinoImportacion({ terrenos, registrosPorTerreno, destino, onChange }: Props) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [existentes, setExistentes] = useState<Terreno[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchProyectos(), fetchTerrenos()]).then(
      ([p, t]) => {
        setProyectos(p)
        setExistentes(t)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos.'),
    )
  }, [])

  const delProyecto = existentes.filter((t) => t.id_proyecto === destino?.idProyecto)
  const faltan = pendientes(destino, terrenos)

  const setTerreno = (clave: string, valor: DestinoTerreno) => destino && onChange({ ...destino, terrenos: { ...destino.terrenos, [clave]: valor } })

  return (
    <section className="demo-panel mb-6 flex flex-col gap-4">
      <h2 className="island-kicker m-0">Destino en la base de datos</h2>
      {error && <p className="m-0 text-sm text-[var(--alert-text)]">{error}</p>}

      <div className="max-w-md">
        <Field label="Proyecto">
          <select
            className="demo-select font-normal"
            value={destino?.idProyecto ?? ''}
            onChange={(e) => onChange(e.target.value ? destinoInicial(e.target.value, terrenos, existentes) : null)}
          >
            <option value="">Elige un proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id_proyecto} value={p.id_proyecto}>
                {p.nombre_proyecto}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {destino?.idProyecto && (
        <div className="flex flex-col gap-4">
          {terrenos.map((t) => {
            const d = destino.terrenos[t.clave]
            return (
              <div key={t.clave} className="flex flex-col gap-2 pt-3">
                <p className="m-0 text-sm font-semibold">
                  {t.nombre} <span className="demo-muted font-normal">({registrosPorTerreno.get(t.clave) ?? 0} registros)</span>
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Terreno">
                    <select
                      className="demo-select font-normal"
                      value={d?.modo === 'existente' ? d.idTerreno : 'nuevo'}
                      onChange={(e) => setTerreno(t.clave, e.target.value === 'nuevo' ? { modo: 'nuevo', tipo: '', componente: '' } : { modo: 'existente', idTerreno: e.target.value })}
                    >
                      <option value="nuevo">Crear terreno nuevo</option>
                      {delProyecto.map((e) => (
                        <option key={e.id_terreno} value={e.id_terreno}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {d?.modo === 'nuevo' && (
                    <>
                      <Field label="Tipo">
                        <select className="demo-select font-normal" value={d.tipo} onChange={(e) => setTerreno(t.clave, { ...d, tipo: e.target.value })}>
                          <OpcionesDe opciones={TIPOS} />
                        </select>
                      </Field>
                      <Field label="Componente">
                        <select className="demo-select font-normal" value={d.componente} onChange={(e) => setTerreno(t.clave, { ...d, componente: e.target.value })}>
                          <OpcionesDe opciones={COMPONENTES} />
                        </select>
                      </Field>
                    </>
                  )}
                </div>
                {d?.modo === 'existente' && <p className="demo-muted m-0 text-xs">Los registros se agregan a este terreno; no se cambian sus datos.</p>}
                {d?.modo === 'nuevo' && (
                  <p className="demo-muted m-0 text-xs">
                    Se crea con el nombre {t.fechaInicio ? `y las fechas (${t.fechaInicio} → ${t.fechaFin ?? 'en curso'}) ` : ''}del archivo.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="demo-muted m-0 text-sm">{faltan.length === 0 ? 'Destino completo.' : faltan[0]}</p>
    </section>
  )
}
