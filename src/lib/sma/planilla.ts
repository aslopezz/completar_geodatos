import { trackLengthKm, type LngLat } from '#/lib/geo-import'
import { findProtocolo } from '#/lib/protocolos'
import { estacionKey, type ExportPoint, type SmaDatos } from '#/lib/point-session'
import { speciesLabel } from '#/lib/species'
import { ubicacionDe } from '#/lib/sma/comunas'
import { PROTOCOLOS_SMA } from '#/lib/sma/listas'

// Planilla SMA de monitoreo y línea base (FormatoBiodiversidadMonitoreoYLineaBase_v5.2):
// una campaña (el archivo), una EstacionReplica por estación y una Ocurrencia por punto con especie.
// Aquí solo se arman las filas; sma/xlsx.ts las escribe sobre la plantilla oficial.

export type Celda = string | number | null
export type Fila = Record<string, Celda> // columna de Excel ("A", "AF"…) → valor

export type Planilla = {
  campana: Fila
  estaciones: Fila[]
  ocurrencias: Fila[] // las columnas B y D (nombres autocompletados) las pone la fórmula de la plantilla
  avisos: string[]
}

type Fecha = { year: number; month: number; day: number; hora: number | null } // hora = fracción del día, como la guarda Excel

// La SMA pide las horas en huso horario -4 (Diccionario de la plantilla). Según cómo venga la fecha del archivo:
// - solo fecha ("2024-03-01"): ese mismo día, sin hora (correrla a UTC-4 la pasaría al día anterior);
// - fecha y hora sin zona ("2024-03-01T10:00:00"): la hora del GPS tal cual, sin depender de la zona del computador;
// - con zona ("…Z", "…-03:00"): se convierte a UTC-4 fijo.
const UTC_MENOS_4 = -4 * 3600 * 1000
const FECHA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i

const fraccionDia = (h: number, m: number, s: number) => (h * 3600 + m * 60 + s) / 86400

function fechaDe(timestamp: string | undefined): Fecha | null {
  const texto = timestamp?.trim() ?? ''
  const m = texto.match(FECHA)
  if (m && !m[7]) {
    const [, year, month, day, h, min, sec] = m
    return { year: Number(year), month: Number(month), day: Number(day), hora: h ? fraccionDia(Number(h), Number(min), Number(sec ?? 0)) : null }
  }
  const time = texto ? Date.parse(texto) : NaN
  if (Number.isNaN(time)) return null
  const d = new Date(time + UTC_MENOS_4)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hora: fraccionDia(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) }
}

const diaDe = (f: Fecha) => f.year * 10000 + f.month * 100 + f.day

export function protocoloSma(protocolo: string): string | undefined {
  const sma = findProtocolo(protocolo)?.sma ?? protocolo.trim()
  return (PROTOCOLOS_SMA as readonly string[]).includes(sma) ? sma : undefined
}

export type EstacionSma = { nombre: string; protocolo: string; puntos: ExportPoint[]; track?: LngLat[] }

// Lo que la planilla toma de la sesión además de los puntos: estaciones sin puntos y los tracks (ya con su nombre).
export type Extras = { estaciones: { nombre: string; protocolo: string }[]; tracks: { nombre: string; coords: LngLat[] }[] }

// El elegido a mano, o el que se propone: el del protocolo, Transecto si tiene track, Registro individual si es un solo punto.
export function tipoMonitoreoDe(sma: SmaDatos, e: EstacionSma): string {
  return (
    sma.tipoMonitoreo[estacionKey(e.nombre)] ||
    findProtocolo(e.protocolo)?.tipoMonitoreo ||
    (e.track ? 'Transecto' : e.puntos.length === 1 ? 'Registro individual' : '')
  )
}

// Estaciones en el orden en que aparecen en el archivo, más las creadas sin puntos (p. ej. desde un track).
// Incluye las que no tienen especies: también se muestrearon. Un track con el mismo nombre le da su geometría.
// Un punto sin estación usa su propio nombre; si tampoco tiene nombre, "Punto N" (su posición), para no dejar
// una estación sin nombre en la planilla. estacionesSma y buildPlanilla lo aplican igual, así que calzan.
function conNombreEstacion(points: ExportPoint[]): ExportPoint[] {
  return points.map((p, i) => (p.estacion.trim() ? p : { ...p, estacion: `Punto ${i + 1}` }))
}

export function estacionesSma(points: ExportPoint[], extras: Extras): EstacionSma[] {
  const byKey = new Map<string, EstacionSma>()
  for (const point of conNombreEstacion(points)) {
    const key = estacionKey(point.estacion)
    const estacion = byKey.get(key) ?? { nombre: point.estacion.trim(), protocolo: point.protocolo, puntos: [] }
    estacion.puntos.push(point)
    if (!estacion.protocolo) estacion.protocolo = point.protocolo
    byKey.set(key, estacion)
  }
  for (const { nombre, protocolo } of extras.estaciones) {
    const key = estacionKey(nombre)
    if (key && !byKey.has(key)) byKey.set(key, { nombre: nombre.trim(), protocolo: protocolo.trim(), puntos: [] })
  }
  for (const track of extras.tracks) {
    const estacion = byKey.get(estacionKey(track.nombre))
    if (estacion && !estacion.track && track.coords.length > 1) estacion.track = track.coords
  }
  // Una estación creada en la herramienta sin puntos ni track no tiene ubicación: no va a la planilla.
  return [...byKey.values()].filter((e) => e.puntos.length > 0 || e.track)
}

// Tracks que no corresponden a ninguna estación (para ofrecer agregarlos como estación).
export function tracksSinEstacion(estaciones: EstacionSma[], tracks: Extras['tracks']): string[] {
  const nombres = new Set(estaciones.map((e) => estacionKey(e.nombre)))
  const sueltos = new Map<string, string>() // sin repetir: varios tracks pueden llamarse igual ("Track")
  for (const t of tracks) {
    const nombre = t.nombre.trim()
    if (nombre && !nombres.has(estacionKey(nombre)) && !sueltos.has(estacionKey(nombre))) sueltos.set(estacionKey(nombre), nombre)
  }
  return [...sueltos.values()]
}

// estaciones = estacionesSma(points, extras); se recibe ya calculado porque la ventana también lo muestra.
export function buildPlanilla(puntos: ExportPoint[], terreno: string, sma: SmaDatos, estaciones: EstacionSma[]): Planilla {
  const points = conNombreEstacion(puntos)
  const avisos: string[] = []
  const idEstacion = new Map(estaciones.map((e, i) => [estacionKey(e.nombre), i + 1]))

  const fechas = points.map((p) => fechaDe(p.timestamp)).filter((f): f is Fecha => f !== null)
  const inicio = fechas.reduce<Fecha | null>((min, f) => (!min || diaDe(f) < diaDe(min) ? f : min), null)
  const termino = fechas.reduce<Fecha | null>((max, f) => (!max || diaDe(f) > diaDe(max) ? f : max), null)

  if (!terreno.trim()) avisos.push('Falta el nombre del terreno (será el nombre de la campaña).')
  const ubicacion = ubicacionDe(sma.comuna)
  if (!sma.comuna) avisos.push('Falta la comuna.')
  else if (!ubicacion) avisos.push(`"${sma.comuna}" no está en la lista de comunas de la SMA: elígela de la lista.`)

  const campana: Fila = {
    A: 1,
    B: terreno.trim(),
    C: 1,
    D: inicio?.year ?? null, E: inicio?.month ?? null, F: inicio?.day ?? null,
    G: termino?.year ?? null, H: termino?.month ?? null, I: termino?.day ?? null,
    J: sma.objetivo.trim(),
    K: sma.comentarios.trim(),
  }

  const filasEstacion = estaciones.map((e, i): Fila => {
    // Centro: el de sus puntos, o el punto medio del track si no tiene puntos.
    const [lon, lat] = e.puntos.length
      ? [e.puntos.reduce((sum, p) => sum + p.coord[0], 0) / e.puntos.length, e.puntos.reduce((sum, p) => sum + p.coord[1], 0) / e.puntos.length]
      : e.track![Math.floor(e.track!.length / 2)]
    const inicio = e.track?.[0]
    const termino = e.track?.[e.track.length - 1]
    const tipo = tipoMonitoreoDe(sma, e)
    if (!tipo) avisos.push(`Estación ${e.nombre}: falta el tipo de monitoreo.`)
    return {
      A: i + 1,
      B: e.nombre,
      C: tipo,
      D: 1,
      E: e.protocolo,
      F: e.track ? Math.round(trackLengthKm(e.track) * 1000) : null,
      J: lat, K: lon,
      L: inicio?.[1] ?? null, M: inicio?.[0] ?? null, N: termino?.[1] ?? null, O: termino?.[0] ?? null,
      P: ubicacion?.region ?? '', Q: ubicacion?.provincia ?? '', R: sma.comuna, S: sma.localidad.trim(),
      T: sma.ecosistema1, U: sma.ecosistema2,
      V: 'No Aplica', // exposición: se asume, la herramienta no la conoce
    }
  })

  // Hora de inicio del evento = el primer punto de esa estación ese día.
  const inicioEvento = new Map<string, number>()
  for (const point of points) {
    const f = fechaDe(point.timestamp)
    if (!f || f.hora === null) continue
    const key = `${estacionKey(point.estacion)}|${diaDe(f)}`
    inicioEvento.set(key, Math.min(inicioEvento.get(key) ?? 1, f.hora))
  }

  const sinProtocolo = new Set<string>()
  let sinFecha = 0
  const ocurrencias = points
    .filter((p) => p.species)
    .map((point): Fila => {
      const species = point.species!
      const f = fechaDe(point.timestamp)
      if (!f) sinFecha++
      const protocolo = protocoloSma(point.protocolo)
      if (!protocolo && point.protocolo) sinProtocolo.add(point.protocolo)
      const [genus, epithet] = speciesLabel(species).split(' ')
      return {
        A: 1,
        C: idEstacion.get(estacionKey(point.estacion)) ?? null,
        E: f?.year ?? null, F: f?.month ?? null, G: f?.day ?? null,
        H: f ? (inicioEvento.get(`${estacionKey(point.estacion)}|${diaDe(f)}`) ?? null) : null,
        I: protocolo ?? point.protocolo,
        O: species.kingdom, P: species.phylum, Q: species.class, R: species.order, S: species.family,
        T: species.genero ?? genus ?? null,
        V: species.epiteto_especifico ?? epithet ?? null,
        X: species.nombre_comun_terreno,
        Z: 'Vivo', // estado del organismo: se asume
        AB: 'Abundancia', AC: 'Abundancia absoluta', AD: point.cantidad, AE: 'Individuos',
        AF: point.coord[1], AG: point.coord[0],
        AH: f?.hora ?? null,
        AO: sma.tipoRegistro,
        AP: point.name, // como en las planillas del equipo: el nombre del punto GPS
        AR: sma.muestreadoPor.trim(),
        AS: sma.muestreadoPor.trim(), // identificado por = los mismos que muestrearon
      }
    })

  if (ocurrencias.length === 0) avisos.push('Ningún punto tiene especie: la hoja Ocurrencia queda vacía.')
  if (sinFecha > 0) avisos.push(`${sinFecha} puntos con especie no tienen fecha en el archivo.`)
  for (const p of sinProtocolo) avisos.push(`El protocolo "${p}" no está en la lista de la SMA: revisarlo en la planilla.`)

  return { campana, estaciones: filasEstacion, ocurrencias, avisos }
}
