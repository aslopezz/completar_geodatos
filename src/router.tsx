import { createRouter as createTanStackRouter, Link } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => (
      <main className="demo-page">
        <h1 className="demo-title mb-2">Página no encontrada</h1>
        <p className="demo-muted mb-4 text-sm">La dirección no existe.</p>
        <Link to="/" className="demo-button demo-button-secondary no-underline">
          Volver al inicio
        </Link>
      </main>
    ),
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
