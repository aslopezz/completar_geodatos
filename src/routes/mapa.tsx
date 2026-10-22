import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RegistrosMap } from '#/components/RegistrosMap'
import { requireSession } from '#/lib/auth'
import { useRegistros } from '#/hooks/useRegistros'
import { conCoordenadas } from '#/lib/registros'

export const Route = createFileRoute('/mapa')({
  // La sesión está en el navegador, por eso el guard corre solo en cliente.
  ssr: false,
  beforeLoad: async ({ location }) => {
    await requireSession(location)
  },
  component: MapaPage,
})

function MapaPage() {
  const { data, error } = useRegistros()

  const puntos = useMemo(() => (data ? conCoordenadas(data) : null), [data])

  return (
    <main className="demo-page">
      <h1 className="demo-title mb-2">Mapa</h1>
      <p className="demo-muted mb-4 text-sm">
        {puntos ? `${puntos.length} registros con coordenadas` : error ? '' : 'Cargando registros…'}
      </p>
      {error && <p className="m-0 text-sm text-[var(--alert-text)]">{error}</p>}
      {puntos && <RegistrosMap registros={puntos} />}
    </main>
  )
}
