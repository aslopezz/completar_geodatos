import { findProtocolo } from '#/lib/protocolos'

export type Estacion = { id: string; nombre: string; protocolo: string; metodologia: string; trackIndex?: number }

// pointEstacion: índice del punto en data.points → id de estación. Un punto sin entrada está sin asignar.
export type EstacionesState = { estaciones: Estacion[]; pointEstacion: Record<number, string> }

export type EstacionesAction =
  | { type: 'create'; estacion: Estacion }
  | { type: 'update'; id: string; patch: Partial<Omit<Estacion, 'id'>> }
  | { type: 'remove'; id: string } // sus puntos quedan sin asignar
  | { type: 'assign'; id: string; points: number[] }
  | { type: 'unassign'; points: number[] }

export const initialEstacionesState: EstacionesState = { estaciones: [], pointEstacion: {} }

// El id lo genera quien llama (el reducer es puro: sin crypto ni fechas).
export function newEstacion(id: string, nombre = '', protocolo = ''): Estacion {
  return { id, nombre, protocolo, metodologia: findProtocolo(protocolo)?.sigla ?? '' }
}

export function estacionesReducer(state: EstacionesState, action: EstacionesAction): EstacionesState {
  switch (action.type) {
    case 'create':
      if (state.estaciones.some((e) => e.id === action.estacion.id)) return state
      return { ...state, estaciones: [...state.estaciones, action.estacion] }
    case 'update': {
      if (!state.estaciones.some((e) => e.id === action.id)) return state
      const patch = { ...action.patch }
      // Al cambiar de protocolo sin indicar metodología, la sigla sigue al catálogo.
      if (patch.protocolo !== undefined && patch.metodologia === undefined) {
        patch.metodologia = findProtocolo(patch.protocolo)?.sigla ?? ''
      }
      return { ...state, estaciones: state.estaciones.map((e) => (e.id === action.id ? { ...e, ...patch } : e)) }
    }
    case 'remove': {
      const pointEstacion = Object.fromEntries(Object.entries(state.pointEstacion).filter(([, id]) => id !== action.id))
      return { estaciones: state.estaciones.filter((e) => e.id !== action.id), pointEstacion }
    }
    case 'assign': {
      if (!state.estaciones.some((e) => e.id === action.id)) return state
      const pointEstacion = { ...state.pointEstacion }
      for (const point of action.points) pointEstacion[point] = action.id
      return { ...state, pointEstacion }
    }
    case 'unassign': {
      const pointEstacion = { ...state.pointEstacion }
      for (const point of action.points) delete pointEstacion[point]
      return { ...state, pointEstacion }
    }
  }
}

const ESTACION_COLORS = 8

// Color (variable CSS --estacion-N de styles.css) según la posición de la estación en la lista.
export function estacionColor(order: number): string {
  return `var(--estacion-${(order % ESTACION_COLORS) + 1})`
}

export function pointsOf(state: EstacionesState, id: string): number[] {
  return Object.entries(state.pointEstacion)
    .filter(([, estacionId]) => estacionId === id)
    .map(([point]) => Number(point))
    .sort((a, b) => a - b)
}
