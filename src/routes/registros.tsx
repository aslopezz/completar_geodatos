import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from '#/lib/auth'
import { useRegistros } from '#/hooks/useRegistros'
import { especieLabel } from '#/lib/registros'
import { download } from '#/lib/export-file'
import {
  cascadeOptions,
  EMPTY_FILTERS,
  exportRegistrosCsv,
  GEOGRAPHY,
  matches,
  setCascade,
  TAXONOMY,
  uniqueSorted,
  type Filters,
} from '#/lib/registros-filters'

export const Route = createFileRoute('/registros')({
  // La sesión está en el navegador, por eso el guard corre solo en cliente.
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireSession(location)
  },
  component: RegistrosPage,
})

const PAGE_SIZE = 50

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="demo-muted flex flex-col gap-1 text-xs font-semibold">
      {label}
      {children}
    </label>
  )
}

function Select({ label, value, options, all, onChange }: { label: string; value: string; options: string[]; all: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <select className="demo-select font-normal" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </Field>
  )
}

function RegistrosPage() {
  const { data, error } = useRegistros()
  // draft = lo que el usuario está eligiendo; applied = lo que se aplicó con "Buscar".
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)

  const rowsAll = data ?? []
  const proyectos = useMemo(() => uniqueSorted(rowsAll.map((r) => r.nombre_proyecto)), [data])

  const filtered = useMemo(() => rowsAll.filter((r) => matches(r, applied)), [data, applied])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft((f) => ({ ...f, [key]: value }))

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setApplied(draft)
    setPage(0)
  }
  const clear = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(0)
  }

  const cascade = (levels: typeof TAXONOMY | typeof GEOGRAPHY, all: (label: string) => string) =>
    levels.map((level, i) => (
      <Select
        key={level.key}
        label={level.label}
        value={draft[level.key]}
        options={cascadeOptions(rowsAll, levels, draft, i)}
        all={all(level.label)}
        onChange={(v) => setDraft((f) => setCascade(f, levels, i, v))}
      />
    ))

  return (
    <main className="demo-page">
      <h1 className="demo-title mb-2">Registros</h1>
      <p className="demo-muted mt-2 mb-4 text-sm">
        {data ? `${filtered.length} de ${data.length} registros` : error ? '' : 'Cargando registros…'}
      </p>
      {error && <p className="m-0 text-sm text-[var(--alert-text)]">{error}</p>}

      {data && (
        <>
          <form onSubmit={search} className="demo-panel mb-6 flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <input
                className="demo-input min-w-0 flex-1 basis-64"
                type="search"
                placeholder="Buscar especie o nombre común"
                aria-label="Buscar especie o nombre común"
                value={draft.search}
                onChange={(e) => set('search', e.target.value)}
              />
              <button type="submit" className="demo-button">
                Buscar
              </button>
              <button type="button" className="demo-button demo-button-secondary" onClick={clear}>
                Limpiar
              </button>
            </div>

            <section className="flex flex-col gap-2">
              <h2 className="island-kicker m-0">Taxonomía</h2>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{cascade(TAXONOMY, () => 'Todos')}</div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="island-kicker m-0">Geografía</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cascade(GEOGRAPHY, () => 'Todas')}</div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="island-kicker m-0">Proyecto y fecha</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <Select label="Proyecto" value={draft.proyecto} options={proyectos} all="Todos" onChange={(v) => set('proyecto', v)} />
                </div>
                <Field label="Desde">
                  <input className="demo-input font-normal" type="date" value={draft.desde} onChange={(e) => set('desde', e.target.value)} />
                </Field>
                <Field label="Hasta">
                  <input className="demo-input font-normal" type="date" value={draft.hasta} onChange={(e) => set('hasta', e.target.value)} />
                </Field>
              </div>
            </section>
          </form>

          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className="demo-button demo-button-secondary"
              disabled={filtered.length === 0}
              onClick={() => download(exportRegistrosCsv(filtered))}
            >
              Descargar CSV ({filtered.length})
            </button>
          </div>

          <div className="demo-table-shell">
            <table className="demo-table text-sm whitespace-nowrap">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Especie</th>
                  <th>Nombre común</th>
                  <th>Cantidad</th>
                  <th>Ubicación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id_registro}>
                    <td>{r.fecha ?? '—'}</td>
                    <td>{especieLabel(r)}</td>
                    <td className="demo-muted">{r.nombre_comun_terreno ?? '—'}</td>
                    <td>{r.cantidad ?? '—'}</td>
                    <td className="demo-muted">
                      {[r.localidad_especifica, r.nombre_comuna].filter(Boolean).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="demo-muted">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button type="button" className="demo-button demo-button-secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Anterior
            </button>
            <span className="demo-muted">
              Página {current + 1} de {pageCount}
            </span>
            <button
              type="button"
              className="demo-button demo-button-secondary"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </main>
  )
}
