import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from '#/lib/auth'
import { useRegistros } from '#/hooks/useRegistros'
import {
  COMPONENTES,
  createProyecto,
  createTerreno,
  fechasLabel,
  fetchProyectos,
  fetchTerrenos,
  TEMPORADAS,
  TIPOS,
  type NuevoTerreno,
  type Proyecto,
  type Terreno,
} from '#/lib/terrenos'

export const Route = createFileRoute('/proyectos')({
  // La sesión está en el navegador, por eso el guard corre solo en cliente.
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireSession(location)
  },
  component: ProyectosPage,
})

type Message = { text: string; isError: boolean } | null

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`demo-muted flex flex-col gap-1 text-xs font-semibold ${className}`}>
      {label}
      {children}
    </label>
  )
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null
  return <p className={`m-0 text-sm ${message.isError ? 'text-[var(--alert-text)]' : 'demo-muted'}`}>{message.text}</p>
}

// Los campos opcionales vacíos se guardan como null, no como texto vacío.
const orNull = (value: string) => value.trim() || null

function NuevoProyectoForm({ onCreated }: { onCreated: () => void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [message, setMessage] = useState<Message>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const error = await createProyecto({ nombre_proyecto: nombre.trim(), descripcion: orNull(descripcion) })
    setSaving(false)
    if (error) return setMessage({ text: error, isError: true })
    setNombre('')
    setDescripcion('')
    setMessage({ text: 'Proyecto creado. Ahora puedes agregarle terrenos.', isError: false })
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="demo-panel mb-6 flex flex-col gap-3">
      <h2 className="demo-section-title">Nuevo proyecto</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <input className="demo-input font-normal" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <Field label="Descripción">
          <input className="demo-input font-normal" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Field>
      </div>
      <Feedback message={message} />
      <div>
        <button type="submit" className="demo-button" disabled={saving}>
          {saving ? 'Guardando…' : 'Crear proyecto'}
        </button>
      </div>
    </form>
  )
}

const emptyTerreno = (id_proyecto: string): NuevoTerreno => ({
  id_proyecto,
  nombre: '',
  tipo: 'linea_base',
  componente: 'fauna',
  fecha_inicio: null,
  fecha_fin: null,
  temporada: null,
  objetivo: null,
  comentarios: null,
})

function NuevoTerrenoForm({ proyecto, onCreated, onCancel }: { proyecto: Proyecto; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<NuevoTerreno>(() => emptyTerreno(proyecto.id_proyecto))
  const [message, setMessage] = useState<Message>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof NuevoTerreno>(key: K, value: NuevoTerreno[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const error = await createTerreno({ ...form, nombre: form.nombre.trim() })
    setSaving(false)
    if (error) return setMessage({ text: error, isError: true })
    // El formulario queda abierto: lo normal es agregar varios terrenos seguidos al mismo proyecto.
    setForm(emptyTerreno(proyecto.id_proyecto))
    setMessage({ text: 'Terreno agregado.', isError: false })
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="demo-panel flex flex-col gap-3">
      <h3 className="island-kicker m-0">Nuevo terreno en {proyecto.nombre_proyecto}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nombre" className="sm:col-span-2 lg:col-span-4">
          <input className="demo-input font-normal" required value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </Field>
        <Field label="Tipo">
          <select className="demo-select font-normal" value={form.tipo} onChange={(e) => set('tipo', e.target.value as NuevoTerreno['tipo'])}>
            {Object.entries(TIPOS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Componente">
          <select
            className="demo-select font-normal"
            value={form.componente}
            onChange={(e) => set('componente', e.target.value as NuevoTerreno['componente'])}
          >
            {Object.entries(COMPONENTES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inicio">
          <input
            className="demo-input font-normal"
            type="date"
            value={form.fecha_inicio ?? ''}
            max={form.fecha_fin ?? undefined}
            onChange={(e) => set('fecha_inicio', orNull(e.target.value))}
          />
        </Field>
        <Field label="Fin (vacío = en curso)">
          <input
            className="demo-input font-normal"
            type="date"
            value={form.fecha_fin ?? ''}
            min={form.fecha_inicio ?? undefined}
            onChange={(e) => set('fecha_fin', orNull(e.target.value))}
          />
        </Field>
        <Field label="Temporada">
          <select
            className="demo-select font-normal"
            value={form.temporada ?? ''}
            onChange={(e) => set('temporada', (e.target.value || null) as NuevoTerreno['temporada'])}
          >
            <option value="">Sin temporada</option>
            {Object.entries(TEMPORADAS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Objetivo" className="sm:col-span-2 lg:col-span-3">
          <input className="demo-input font-normal" value={form.objetivo ?? ''} onChange={(e) => set('objetivo', orNull(e.target.value))} />
        </Field>
        <Field label="Comentarios" className="sm:col-span-2 lg:col-span-4">
          <textarea
            className="demo-textarea font-normal"
            rows={2}
            value={form.comentarios ?? ''}
            onChange={(e) => set('comentarios', orNull(e.target.value))}
          />
        </Field>
      </div>
      <Feedback message={message} />
      <div className="flex gap-2">
        <button type="submit" className="demo-button" disabled={saving}>
          {saving ? 'Guardando…' : 'Agregar terreno'}
        </button>
        <button type="button" className="demo-button demo-button-secondary" onClick={onCancel}>
          Cerrar
        </button>
      </div>
    </form>
  )
}

function ProyectosPage() {
  const { data: registros } = useRegistros()
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null)
  const [terrenos, setTerrenos] = useState<Terreno[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Proyecto con el formulario de terreno abierto (uno a la vez).
  const [abierto, setAbierto] = useState<string | null>(null)

  const loadProyectos = () => fetchProyectos().then(setProyectos, (e: Error) => setError(e.message))
  const loadTerrenos = () => fetchTerrenos().then(setTerrenos, (e: Error) => setError(e.message))

  useEffect(() => {
    loadProyectos()
    loadTerrenos()
  }, [])

  // Registros por terreno, y los que aún no tienen terreno por nombre de proyecto.
  const counts = useMemo(() => {
    const porTerreno = new Map<string, number>()
    const sinTerreno = new Map<string, number>()
    for (const r of registros ?? []) {
      if (r.id_terreno) porTerreno.set(r.id_terreno, (porTerreno.get(r.id_terreno) ?? 0) + 1)
      else if (r.nombre_proyecto) sinTerreno.set(r.nombre_proyecto, (sinTerreno.get(r.nombre_proyecto) ?? 0) + 1)
    }
    return { porTerreno, sinTerreno }
  }, [registros])

  const loaded = proyectos && terrenos

  return (
    <main className="demo-page">
      <h1 className="demo-title mb-2">Proyectos</h1>
      <p className="demo-muted mt-2 mb-4 text-sm">
        {loaded ? `${proyectos.length} proyectos, ${terrenos.length} terrenos` : error ? '' : 'Cargando proyectos…'}
      </p>
      {error && <p className="m-0 mb-4 text-sm text-[var(--alert-text)]">{error}</p>}

      {proyectos && <NuevoProyectoForm onCreated={loadProyectos} />}

      {loaded &&
        proyectos.map((p) => {
          const propios = terrenos.filter((t) => t.id_proyecto === p.id_proyecto)
          const sinTerreno = counts.sinTerreno.get(p.nombre_proyecto) ?? 0
          return (
            <section key={p.id_proyecto} className="mb-8 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="demo-section-title">{p.nombre_proyecto}</h2>
                {abierto !== p.id_proyecto && (
                  <button type="button" className="demo-button demo-button-secondary" onClick={() => setAbierto(p.id_proyecto)}>
                    Agregar terreno
                  </button>
                )}
              </div>
              {p.descripcion && <p className="demo-muted m-0 text-sm">{p.descripcion}</p>}
              {sinTerreno > 0 && <p className="demo-muted m-0 text-sm">{sinTerreno} registros sin terreno</p>}

              {propios.length > 0 ? (
                <div className="demo-table-shell">
                  <table className="demo-table text-sm whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Terreno</th>
                        <th>Tipo</th>
                        <th>Componente</th>
                        <th>Fechas</th>
                        <th>Temporada</th>
                        <th>Registros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propios.map((t) => (
                        <tr key={t.id_terreno}>
                          <td>{t.nombre}</td>
                          <td>{TIPOS[t.tipo] ?? t.tipo}</td>
                          <td>{COMPONENTES[t.componente] ?? t.componente}</td>
                          <td className="demo-muted">{fechasLabel(t)}</td>
                          <td className="demo-muted">{t.temporada ? TEMPORADAS[t.temporada] : '—'}</td>
                          <td>{registros ? (counts.porTerreno.get(t.id_terreno) ?? 0) : '…'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="demo-muted m-0 text-sm">Sin terrenos todavía.</p>
              )}

              {abierto === p.id_proyecto && (
                <NuevoTerrenoForm key={p.id_proyecto} proyecto={p} onCreated={loadTerrenos} onCancel={() => setAbierto(null)} />
              )}
            </section>
          )
        })}
    </main>
  )
}
