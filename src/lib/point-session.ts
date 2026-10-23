import type { ImportResult, LngLat } from '#/lib/geo-import'
import { findProtocolo } from '#/lib/protocolos'
import type { Species } from '#/lib/species'

// Sesión de edición de un archivo: las estaciones y lo que el usuario decide sobre cada punto.
// Los índices de punto son posiciones en data.points.

export type Estacion = { id: string; nombre: string; protocolo: string }

// Lo escrito a mano en un punto; lo que falta se hereda de su estación.
// metodologia guarda solo lo escrito a mano: la sigla del protocolo se calcula al resolver.
type PointEdit = { species?: Species; cantidad?: number; protocolo?: string; metodologia?: string }

export type PointSessionState = {
  estaciones: Estacion[]
  pointEstacion: Record<number, string> // un punto sin entrada está sin asignar
  edits: Record<number, PointEdit>
  removed: ReadonlySet<number>
  terreno: string
  sma: SmaDatos
}

// Lo que pide la planilla SMA y el archivo no trae. Se llena una vez por archivo, salvo el tipo de monitoreo (por estación).
export type SmaDatos = {
  objetivo: string
  comentarios: string
  muestreadoPor: string // también va como "Identificado por"
  comuna: string // región y provincia salen de la comuna (src/lib/sma/comunas.ts)
  localidad: string
  ecosistema1: string
  ecosistema2: string
  tipoRegistro: string
  tipoMonitoreo: Record<string, string> // por nombre de estación en minúsculas; lo que falta se propone desde el protocolo
}

export const initialSmaDatos: SmaDatos = {
  objetivo: '', comentarios: '', muestreadoPor: '',
  comuna: '', localidad: '', ecosistema1: '', ecosistema2: '',
  tipoRegistro: 'Observación directa', tipoMonitoreo: {},
}

export const initialPointSession: PointSessionState = {
  estaciones: [], pointEstacion: {}, edits: {}, removed: new Set(), terreno: '', sma: initialSmaDatos,
}

// Los ids los genera quien llama (el reducer es puro: sin crypto ni fechas).
export type PointSessionAction =
  | { type: 'createEstacion'; id: string }
  | { type: 'updateEstacion'; id: string; patch: { nombre?: string; protocolo?: string } }
  | { type: 'removeEstacion'; id: string } // sus puntos quedan sin asignar
  | { type: 'assign'; id: string | null; points: number[] } // null = sin estación
  // Mueve los puntos a la estación con ese nombre y la crea (con newId) si no existe; nombre vacío = sin estación.
  | { type: 'assignByName'; nombre: string; points: number[]; newId: string; protocolo?: string }
  | { type: 'setSpecies'; index: number; species: Species }
  | { type: 'setCantidad'; index: number; cantidad: number }
  | { type: 'setProtocolo'; points: number[]; protocolo: string }
  | { type: 'setMetodologia'; points: number[]; metodologia: string }
  | { type: 'removePoint'; index: number }
  | { type: 'restorePoints' }
  | { type: 'setTerreno'; terreno: string }
  | { type: 'setSma'; patch: Partial<Omit<SmaDatos, 'tipoMonitoreo'>> }
  | { type: 'setTipoMonitoreo'; estacion: string; tipo: string } // tipo vacío = volver al propuesto

export function pointSessionReducer(state: PointSessionState, action: PointSessionAction): PointSessionState {
  switch (action.type) {
    case 'createEstacion':
      if (state.estaciones.some((e) => e.id === action.id)) return state
      return { ...state, estaciones: [...state.estaciones, { id: action.id, nombre: '', protocolo: '' }] }
    case 'updateEstacion':
      return { ...state, estaciones: state.estaciones.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)) }
    case 'removeEstacion':
      return {
        ...state,
        estaciones: state.estaciones.filter((e) => e.id !== action.id),
        pointEstacion: Object.fromEntries(Object.entries(state.pointEstacion).filter(([, id]) => id !== action.id)),
      }
    case 'assign': {
      if (action.id !== null && !state.estaciones.some((e) => e.id === action.id)) return state
      const pointEstacion = { ...state.pointEstacion }
      for (const point of action.points) {
        if (action.id === null) delete pointEstacion[point]
        else pointEstacion[point] = action.id
      }
      return { ...state, pointEstacion }
    }
    case 'assignByName': {
      const nombre = action.nombre.trim()
      if (!nombre) return pointSessionReducer(state, { type: 'assign', id: null, points: action.points })
      const existing = findEstacionByName(state.estaciones, nombre)
      const withEstacion = existing
        ? state
        : { ...state, estaciones: [...state.estaciones, { id: action.newId, nombre, protocolo: action.protocolo ?? '' }] }
      return pointSessionReducer(withEstacion, { type: 'assign', id: existing?.id ?? action.newId, points: action.points })
    }
    case 'setSpecies':
      return editPoints(state, [action.index], (edit) => ({ ...edit, species: action.species }))
    case 'setCantidad': {
      const cantidad = Number.isFinite(action.cantidad) && action.cantidad >= 1 ? Math.floor(action.cantidad) : 1
      return editPoints(state, [action.index], (edit) => ({ ...edit, cantidad }))
    }
    case 'setProtocolo':
      // Si el protocolo nuevo tiene sigla, la metodología escrita a mano se descarta y vuelve a seguir al protocolo.
      return editPoints(state, action.points, ({ protocolo: _, metodologia, ...edit }) => ({
        ...edit,
        ...(action.protocolo ? { protocolo: action.protocolo } : {}),
        ...(metodologia !== undefined && !metodologiaFor(action.protocolo) ? { metodologia } : {}),
      }))
    case 'setMetodologia':
      return editPoints(state, action.points, ({ metodologia: _, ...edit }) => (action.metodologia ? { ...edit, metodologia: action.metodologia } : edit))
    case 'removePoint':
      return { ...state, removed: new Set(state.removed).add(action.index) }
    case 'restorePoints':
      return { ...state, removed: new Set() }
    case 'setTerreno':
      return { ...state, terreno: action.terreno }
    case 'setSma':
      return { ...state, sma: { ...state.sma, ...action.patch } }
    case 'setTipoMonitoreo': {
      const { [estacionKey(action.estacion)]: _, ...tipoMonitoreo } = state.sma.tipoMonitoreo
      if (action.tipo) tipoMonitoreo[estacionKey(action.estacion)] = action.tipo
      return { ...state, sma: { ...state.sma, tipoMonitoreo } }
    }
  }
}

function editPoints(state: PointSessionState, points: number[], update: (edit: PointEdit) => PointEdit): PointSessionState {
  const edits = { ...state.edits }
  for (const point of points) edits[point] = update(edits[point] ?? {})
  return { ...state, edits }
}

export const estacionKey = (nombre: string) => nombre.trim().toLowerCase()

// Única regla para comparar nombres de estación (sesión y planilla SMA): sin espacios a los lados ni mayúsculas.
export function findEstacionByName(estaciones: Estacion[], nombre: string): Estacion | undefined {
  const key = estacionKey(nombre)
  return estaciones.find((e) => estacionKey(e.nombre) === key)
}

export function estacionOf(state: PointSessionState, index: number): Estacion | undefined {
  const id = state.pointEstacion[index]
  return id === undefined ? undefined : state.estaciones.find((e) => e.id === id)
}

export function metodologiaFor(protocolo: string | undefined): string {
  return findProtocolo(protocolo)?.sigla ?? ''
}

export function pointEdit(state: PointSessionState, index: number): PointEdit {
  return state.edits[index] ?? {}
}

export type PointAttributes = { estacion: string; protocolo: string; metodologia: string }

// Lo que toma el punto en cada campo que no se escribió a mano; la tabla lo muestra como placeholder.
// Estación: la asignada, o el nombre del punto. Protocolo: el de la estación. Metodología: la sigla del protocolo que aplica.
export function inheritedAttributes(state: PointSessionState, index: number, pointName: string): PointAttributes {
  const estacion = estacionOf(state, index)
  const protocolo = pointEdit(state, index).protocolo?.trim() || estacion?.protocolo.trim() || ''
  return { estacion: estacion?.nombre.trim() || pointName, protocolo: estacion?.protocolo.trim() ?? '', metodologia: metodologiaFor(protocolo) }
}

// Único lugar que decide estación/protocolo/metodología de un punto: lo escrito a mano manda, si no se hereda.
export function resolveAttributes(state: PointSessionState, index: number, pointName: string): PointAttributes {
  const edit = pointEdit(state, index)
  const inherited = inheritedAttributes(state, index, pointName)
  return {
    estacion: inherited.estacion,
    protocolo: edit.protocolo?.trim() || inherited.protocolo,
    metodologia: edit.metodologia?.trim() || inherited.metodologia,
  }
}

// Un punto listo para exportar: todo lo que la edición decidió sobre él, ya resuelto.
export type ExportPoint = PointAttributes & {
  name: string
  coord: LngLat
  timestamp?: string
  species?: Species
  cantidad: number
}

export function visibleIndexes(data: ImportResult, removed: ReadonlySet<number>): number[] {
  return data.points.map((_, index) => index).filter((index) => !removed.has(index))
}

// Puntos visibles (sin los quitados), en el orden del archivo, con sus atributos resueltos.
export function resolvePoints(data: ImportResult, state: PointSessionState): ExportPoint[] {
  return visibleIndexes(data, state.removed).map((index) => {
    const point = data.points[index]
    const edit = pointEdit(state, index)
    return {
      ...resolveAttributes(state, index, point.name),
      name: point.name,
      coord: point.coord,
      timestamp: point.timestamp,
      species: edit.species,
      cantidad: edit.cantidad ?? 1,
    }
  })
}

const ESTACION_COLORS = 8

// Color (variable CSS --estacion-N de styles.css) según la posición de la estación en la lista.
export function estacionColor(order: number): string {
  return `var(--estacion-${(order % ESTACION_COLORS) + 1})`
}

export function estacionColorOf(state: PointSessionState, index: number): string | undefined {
  const order = state.estaciones.findIndex((e) => e.id === state.pointEstacion[index])
  return order >= 0 ? estacionColor(order) : undefined
}

// Puntos visibles por estación.
export function estacionCounts(state: PointSessionState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [point, id] of Object.entries(state.pointEstacion)) {
    if (!state.removed.has(Number(point))) counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

// label null = tabla sin agrupar (no hay estaciones): no se dibuja fila de encabezado.
export type PointGroup = { key: string; label: string | null; color?: string; indexes: number[] }

// Un grupo por estación (en orden de creación, sin los vacíos) y "Sin asignar" al final.
// Sin estaciones queda un solo grupo sin encabezado, igual que la tabla de siempre.
export function groupPoints(state: PointSessionState, indexes: number[]): PointGroup[] {
  if (state.estaciones.length === 0) return [{ key: 'all', label: null, indexes }]
  return [
    ...state.estaciones.map((estacion, order) => ({
      key: estacion.id,
      label: [estacion.nombre.trim() || '(sin nombre)', estacion.protocolo.trim()].filter(Boolean).join(' · '),
      color: estacionColor(order),
      indexes: indexes.filter((index) => state.pointEstacion[index] === estacion.id),
    })),
    { key: 'none', label: 'Sin asignar', indexes: indexes.filter((index) => state.pointEstacion[index] === undefined) },
  ].filter((group) => group.indexes.length > 0)
}
