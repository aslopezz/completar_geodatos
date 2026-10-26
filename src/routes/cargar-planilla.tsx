import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from '#/lib/auth'
import { abrirLibro, detectar, leerImportacion } from '#/lib/import'
import type { Libro } from '#/lib/import/read-xlsx'
import { guardarImportacion, impedimentos, type ResultadoGuardado } from '#/lib/import/guardar'
import { buscarEspecies, type EspecieMatch } from '#/lib/import/species-match'
import { buscarEnRce, buscarEnTaxaCache, buscarNombresComunes } from '#/lib/import/taxa-cache'
import { FORMATOS, nombreParaBuscar, type Destino, type ImportPreview, type ImportRegistro } from '#/lib/import/types'
import { aplicarCorrecciones, renombrar, SIN_CORRECCIONES, type Correcciones } from '#/lib/import/correcciones'
import { DestinoImportacion } from '#/components/DestinoImportacion'
import type { UtmZone } from '#/lib/utm'

export const Route = createFileRoute('/cargar-planilla')({
  // La sesión está en el navegador, por eso el guard corre solo en cliente.
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireSession(location)
  },
  component: CargarPlanillaPage,
})

const MAX_FILAS = 200 // filas de registros que se muestran; el resto se cuenta pero no se dibuja

type Abierto = { nombre: string; libro: Libro }

// Agrupa las advertencias de los registros por texto, sin los valores entre paréntesis, con cuántos registros afecta cada una.
function agruparAdvertencias(preview: ImportPreview): [string, number][] {
  const grupos = new Map<string, number>()
  for (const r of preview.registros) {
    for (const a of new Set(r.advertencias.map((t) => t.replace(/\s*\([^)]*\)/g, '')))) grupos.set(a, (grupos.get(a) ?? 0) + 1)
  }
  return [...grupos].sort((a, b) => b[1] - a[1])
}

function Cuenta({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-semibold">{valor}</span>
      <span className="demo-muted text-xs">{etiqueta}</span>
    </div>
  )
}

// Campo para corregir el nombre de una especie sin clave y buscarla de nuevo.
function EditorNombre({ nombre, texto, ocupado, onTexto, onBuscar }: { nombre: string; texto: string | undefined; ocupado: boolean; onTexto: (t: string) => void; onBuscar: () => void }) {
  const nuevo = (texto ?? nombre).trim()
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(ev) => {
        ev.preventDefault()
        onBuscar()
      }}
    >
      <input className="demo-input demo-input-cell" aria-label={`Corregir el nombre ${nombre}`} value={texto ?? nombre} onChange={(ev) => onTexto(ev.target.value)} />
      <button type="submit" className="demo-button demo-button-secondary" disabled={ocupado || !nuevo || nuevo === nombre}>
        Buscar
      </button>
    </form>
  )
}

function CargarPlanillaPage() {
  const [abierto, setAbierto] = useState<Abierto | null>(null)
  const [error, setError] = useState('')
  const [zonaUtm, setZonaUtm] = useState<UtmZone>(19)
  const [soloAvisos, setSoloAvisos] = useState(false)
  const [correcciones, setCorrecciones] = useState<Correcciones>(SIN_CORRECCIONES)
  const [nombreEditado, setNombreEditado] = useState<Record<string, string>>({}) // texto escrito por nombre buscado, aún sin aplicar
  const [especies, setEspecies] = useState<EspecieMatch[] | null>(null)
  const [progreso, setProgreso] = useState<[number, number] | null>(null)
  const [errorEspecies, setErrorEspecies] = useState('')
  const [destino, setDestino] = useState<Destino | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [resultado, setResultado] = useState<ResultadoGuardado | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setAbierto(null)
    setEspecies(null)
    setErrorEspecies('')
    setCorrecciones(SIN_CORRECCIONES)
    setNombreEditado({})
    setDestino(null)
    setErrorGuardar('')
    setResultado(null)
    try {
      const libro = abrirLibro(new Uint8Array(await file.arrayBuffer()))
      const deteccion = detectar(libro)
      if (!deteccion.formato) return setError(deteccion.motivo)
      setAbierto({ nombre: file.name, libro })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    }
  }

  async function handleBuscarEspecies() {
    if (!preview) return
    setErrorEspecies('')
    setProgreso([0, 1])
    try {
      const nombres = preview.registros.flatMap((r) => {
        const nombre = nombreParaBuscar(r)
        return nombre ? [{ nombre, soloComun: !r.nombreCientifico }] : []
      })
      setEspecies(await buscarEspecies(nombres, { base: buscarEnTaxaCache, rce: buscarEnRce, registros: buscarNombresComunes }, { onProgreso: (hechos, total) => setProgreso([hechos, total]) }))
    } catch (err) {
      setErrorEspecies(err instanceof Error ? err.message : 'No se pudieron buscar las especies.')
    }
    setProgreso(null)
  }

  // Corrige el nombre de una especie sin clave y vuelve a buscar solo ese nombre.
  async function handleCorregirNombre(actual: string) {
    const nuevo = nombreEditado[actual]?.trim()
    if (!nuevo || nuevo === actual) return
    setErrorEspecies('')
    setProgreso([0, 1])
    try {
      const [encontrada] = await buscarEspecies([{ nombre: nuevo, soloComun: false }], { base: buscarEnTaxaCache, rce: buscarEnRce, registros: buscarNombresComunes })
      setCorrecciones((c) => ({ ...c, nombres: renombrar(c.nombres, actual, nuevo) }))
      setEspecies((previas) => [...(previas ?? []).filter((e) => e.nombre !== actual && e.nombre !== nuevo), encontrada])
      setNombreEditado(({ [actual]: _, ...resto }) => resto)
    } catch (err) {
      setErrorEspecies(err instanceof Error ? err.message : 'No se pudo buscar el nombre.')
    }
    setProgreso(null)
  }

  async function handleGuardar() {
    if (!preview || !destino || !especies) return
    setGuardando(true)
    setErrorGuardar('')
    try {
      setResultado(await guardarImportacion(preview, destino, especies))
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  // Se vuelve a leer al cambiar el huso UTM; la lectura es rápida porque descarta las filas vacías de la plantilla.
  const lectura = useMemo(() => (abierto ? leerImportacion(abierto.libro, { zonaUtm }) : null), [abierto, zonaUtm])
  // Lo leído más las correcciones a mano (nombres de especie): todo lo que sigue trabaja sobre esto.
  const preview = useMemo(() => (lectura ? aplicarCorrecciones(lectura, correcciones) : null), [lectura, correcciones])
  const grupos = useMemo(() => (preview ? agruparAdvertencias(preview) : []), [preview])
  const terrenoNombre = useMemo(() => new Map(preview?.terrenos.map((t) => [t.clave, t.nombre])), [preview])
  const conteoTerreno = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const r of preview?.registros ?? []) conteo.set(r.terreno, (conteo.get(r.terreno) ?? 0) + 1)
    return conteo
  }, [preview])
  const faltan = useMemo(() => (preview ? impedimentos(preview, destino, especies) : []), [preview, destino, especies])
  const registrosPorNombre = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const r of preview?.registros ?? []) {
      const nombre = nombreParaBuscar(r)
      if (nombre) conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1)
    }
    return conteo
  }, [preview])
  const conClave = useMemo(() => new Set((especies ?? []).filter((e) => e.clave).map((e) => e.nombre)), [especies])
  // Solo tiene sentido después de buscar: antes no se sabe qué especies tienen clave.
  const sinClave = (r: ImportRegistro) => {
    const nombre = nombreParaBuscar(r)
    return !!especies && !!nombre && !conClave.has(nombre)
  }
  const filas = useMemo(() => (preview?.registros ?? []).filter((r) => !soloAvisos || r.advertencias.length > 0), [preview, soloAvisos])

  return (
    <main className="demo-page">
      <h1 className="demo-title mb-2">Cargar planilla</h1>
      <p className="demo-muted mt-2 mb-4 text-sm">
        Sube una planilla SMA (Monitoreo y Línea Base) o un Darwin Core en xlsx. Revisa la vista previa, corrige lo que falte y guarda al final: hasta entonces no se escribe nada en la base de datos.
      </p>

      <section className="demo-panel mb-6 flex flex-col gap-3">
        <input className="demo-input" type="file" accept=".xlsx" aria-label="Archivo xlsx" onChange={handleFile} />
        {error && <p className="m-0 text-sm text-[var(--alert-text)]">{error}</p>}
      </section>

      {abierto && preview && (
        <>
          <section className="demo-panel mb-6 flex flex-col gap-4">
            <div>
              <h2 className="island-kicker m-0">{abierto.nombre}</h2>
              <p className="demo-muted m-0 text-sm">{FORMATOS[preview.formato]}</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Cuenta valor={preview.terrenos.length} etiqueta="terrenos" />
              <Cuenta valor={preview.estaciones.length} etiqueta="estaciones" />
              <Cuenta valor={preview.registros.length} etiqueta="registros" />
              <Cuenta valor={preview.registros.filter((r) => r.advertencias.length > 0).length} etiqueta="con advertencias" />
              {preview.omitidos > 0 && <Cuenta valor={preview.omitidos} etiqueta="omitidos (ausencias)" />}
            </div>
            {preview.formato === 'darwin-core' && (
              <label className="demo-muted flex max-w-xs flex-col gap-1 text-xs font-semibold">
                Huso UTM de las coordenadas
                <select className="demo-select font-normal" value={zonaUtm} onChange={(e) => setZonaUtm(Number(e.target.value) as UtmZone)}>
                  <option value={18}>18 Sur</option>
                  <option value={19}>19 Sur</option>
                </select>
              </label>
            )}
            {(preview.advertencias.length > 0 || grupos.length > 0) && (
              <div className="flex flex-col gap-1">
                <h3 className="island-kicker m-0">Advertencias</h3>
                <ul className="m-0 pl-5 text-sm">
                  {preview.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                  {grupos.map(([texto, n]) => (
                    <li key={texto}>
                      {texto} <span className="demo-muted">({n} registros)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <DestinoImportacion terrenos={preview.terrenos} registrosPorTerreno={conteoTerreno} destino={destino} onChange={setDestino} />

          <section className="mb-6 flex flex-col gap-2">
            <h2 className="island-kicker m-0">Terrenos</h2>
            <div className="demo-table-shell">
              <table className="demo-table text-sm whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Fechas</th>
                    <th>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.terrenos.map((t) => (
                    <tr key={t.clave}>
                      <td>{t.nombre}</td>
                      <td>{t.fechaInicio ? `${t.fechaInicio} → ${t.fechaFin ?? 'en curso'}` : ''}</td>
                      <td>{conteoTerreno.get(t.clave) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="island-kicker m-0">Especies ({registrosPorNombre.size} nombres distintos)</h2>
              <button type="button" className="demo-button demo-button-secondary" disabled={!!progreso} onClick={handleBuscarEspecies}>
                {progreso ? `Buscando… ${progreso[0]} de ${progreso[1]}` : especies ? 'Buscar de nuevo' : 'Buscar clave GBIF'}
              </button>
            </div>
            {errorEspecies && <p className="m-0 text-sm text-[var(--alert-text)]">{errorEspecies}</p>}
            {especies && (
              <>
                <p className="demo-muted m-0 text-sm">
                  {especies.filter((e) => e.clave).length} con clave, {especies.filter((e) => !e.clave).length} sin clave,{' '}
                  {especies.filter((e) => e.clave && e.avisos.length > 0).length} para revisar.
                </p>
                <div className="demo-table-shell">
                  <table className="demo-table text-sm whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Nombre en el archivo</th>
                        <th>Registros</th>
                        <th>Nombre aceptado</th>
                        <th>Clave GBIF</th>
                        <th>Fuente</th>
                        <th>Avisos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...especies].sort((a, b) => Number(!!a.clave && !a.avisos.length) - Number(!!b.clave && !b.avisos.length)).map((e) => (
                        <tr key={e.nombre} className={e.clave ? undefined : 'demo-row-alert'}>
                          <td>
                            {e.clave ? (
                              e.nombre
                            ) : (
                              <EditorNombre
                                nombre={e.nombre}
                                texto={nombreEditado[e.nombre]}
                                ocupado={!!progreso}
                                onTexto={(t) => setNombreEditado((n) => ({ ...n, [e.nombre]: t }))}
                                onBuscar={() => void handleCorregirNombre(e.nombre)}
                              />
                            )}
                          </td>
                          <td>{registrosPorNombre.get(e.nombre) ?? ''}</td>
                          <td>{e.nombreGbif}</td>
                          <td>{e.clave}</td>
                          <td>{e.origen === 'base' ? 'Base de datos' : e.origen === 'gbif' ? 'GBIF' : e.origen === 'rce' ? 'RCE' : e.origen === 'registros' ? 'Registros de la base' : ''}</td>
                          <td className="max-w-md truncate" title={e.avisos.join('\n')}>
                            {e.avisos.join(' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="mb-6 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="island-kicker m-0">
                Registros ({filas.length > MAX_FILAS ? `primeros ${MAX_FILAS} de ${filas.length}` : filas.length})
              </h2>
              <div className="flex flex-wrap gap-4">
                <label className="demo-muted flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={soloAvisos} onChange={(e) => setSoloAvisos(e.target.checked)} />
                  Solo con advertencias
                </label>
              </div>
            </div>
            <div className="demo-table-shell">
              <table className="demo-table text-sm whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Terreno</th>
                    <th>Estación</th>
                    <th>Especie</th>
                    <th>Cantidad</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Latitud</th>
                    <th>Longitud</th>
                    <th>Código individuo</th>
                    <th>Advertencias</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, MAX_FILAS).map((r) => (
                    <tr key={`${r.origen.hoja}-${r.origen.fila}`} className={sinClave(r) ? 'demo-row-alert' : undefined}>
                      <td>{r.origen.fila}</td>
                      <td>{terrenoNombre.get(r.terreno) ?? r.terreno}</td>
                      <td>{r.estacion}</td>
                      <td>
                        {sinClave(r) ? (
                          <EditorNombre
                            nombre={nombreParaBuscar(r)!}
                            texto={nombreEditado[nombreParaBuscar(r)!]}
                            ocupado={!!progreso}
                            onTexto={(t) => setNombreEditado((n) => ({ ...n, [nombreParaBuscar(r)!]: t }))}
                            onBuscar={() => void handleCorregirNombre(nombreParaBuscar(r)!)}
                          />
                        ) : (
                          (r.nombreCientifico ?? r.nombreComun)
                        )}
                      </td>
                      <td>{r.cantidad}</td>
                      <td>{r.fecha}</td>
                      <td>{r.hora}</td>
                      <td>{r.lat?.toFixed(6)}</td>
                      <td>{r.lon?.toFixed(6)}</td>
                      <td>{r.codigoIndividuo}</td>
                      <td className="max-w-md truncate" title={r.advertencias.join('\n')}>
                        {r.advertencias.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="demo-panel mb-6 flex flex-col gap-3">
            <h2 className="island-kicker m-0">Guardar</h2>
            {resultado ? (
              <p className="m-0 text-sm">
                Listo: se guardaron {resultado.registros} registros y se crearon {resultado.terrenos_creados} terrenos.
                {resultado.sin_comuna > 0 && ` ${resultado.sin_comuna} registros quedaron sin comuna porque el nombre no calzó con la lista.`}
              </p>
            ) : (
              <>
                {faltan.length > 0 && (
                  <ul className="demo-muted m-0 pl-5 text-sm">
                    {faltan.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                <div>
                  <button type="button" className="demo-button" disabled={faltan.length > 0 || guardando} onClick={handleGuardar}>
                    {guardando ? 'Guardando…' : `Guardar ${preview.registros.length} registros`}
                  </button>
                </div>
                {errorGuardar && <p className="m-0 text-sm text-[var(--alert-text)]">{errorGuardar}</p>}
              </>
            )}
          </section>
        </>
      )}
    </main>
  )
}
