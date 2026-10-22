import { useState } from 'react'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { ALLOWED_EMAIL_DOMAIN, getAuthorizedSession, signInWithPassword } from '#/lib/auth'

export const Route = createFileRoute('/login')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' && search.redirect.startsWith('/') && !search.redirect.startsWith('//') ? search.redirect : '/registros',
  }),
  beforeLoad: async ({ search }) => {
    if (await getAuthorizedSession()) throw redirect({ to: search.redirect })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const message = await signInWithPassword(email, password)
    setLoading(false)
    if (message) setError(message)
    else navigate({ to: redirectTo })
  }

  return (
    <main className="demo-page demo-center">
      <form onSubmit={handleSubmit} className="demo-panel flex w-full max-w-sm flex-col gap-3">
        <h1 className="demo-section-title">Iniciar sesión</h1>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder={`correo@${ALLOWED_EMAIL_DOMAIN}`}
          className="demo-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          className="demo-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="m-0 text-sm text-[var(--alert-text)]">{error}</p>}
        <button type="submit" className="demo-button" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
        <Link to="/forgot-password" className="text-sm">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </main>
  )
}
