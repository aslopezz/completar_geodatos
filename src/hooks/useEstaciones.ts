import { useCallback, useReducer } from 'react'
import {
  estacionesReducer,
  initialEstacionesState,
  newEstacion,
  pointsOf,
  type Estacion,
} from '#/lib/estaciones'

export function useEstaciones() {
  const [state, dispatch] = useReducer(estacionesReducer, initialEstacionesState)

  const create = useCallback((nombre = '', protocolo = '') => {
    const id = crypto.randomUUID()
    dispatch({ type: 'create', estacion: newEstacion(id, nombre, protocolo) })
    return id
  }, [])
  const update = useCallback((id: string, patch: { nombre?: string; protocolo?: string }) => dispatch({ type: 'update', id, patch }), [])
  const remove = useCallback((id: string) => dispatch({ type: 'remove', id }), [])
  const assign = useCallback((id: string, points: number[]) => dispatch({ type: 'assign', id, points }), [])
  const unassign = useCallback((points: number[]) => dispatch({ type: 'unassign', points }), [])

  const getEstacionOf = useCallback(
    (index: number): Estacion | undefined => {
      const id = state.pointEstacion[index]
      return id === undefined ? undefined : state.estaciones.find((e) => e.id === id)
    },
    [state],
  )
  const pointsOfEstacion = useCallback((id: string) => pointsOf(state, id), [state])

  return { estaciones: state.estaciones, create, update, remove, assign, unassign, getEstacionOf, pointsOfEstacion }
}
