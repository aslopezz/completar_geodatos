import { useEffect, useState } from 'react'
import { cachedRegistros, loadRegistros, type Registro } from '#/lib/registros'

// data es null mientras carga o si falló; error trae el mensaje en ese caso.
export function useRegistros() {
  const [data, setData] = useState<Registro[] | null>(cachedRegistros)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadRegistros().then(
      (rows) => active && setData(rows),
      (e: Error) => active && setError(e.message),
    )
    return () => {
      active = false
    }
  }, [])

  return { data, error }
}
