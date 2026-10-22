import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ALLOWED_EMAIL_DOMAIN, requestPasswordReset } from '#/lib/auth'

export const Route = createFileRoute('/forgot-password')({
  ssr: false,
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await requestPasswordReset(email)
    } catch {
      // Se ignora el error a propósito: la respuesta al usuario es siempre la misma.
    }
    setLoading(false)
    setSent(true)
  }

  return (
    <main className="demo-page demo-center">
      <form onSubmit={handleSubmit} className="demo-panel flex w-full max-w-sm flex-col gap-3">
        <h1 className="demo-section-title">Recuperar contraseña</h1>
        {sent ? (
          <p className="demo-muted m-0 text-sm">
            Si el correo tiene una cuenta, recibirás un enlace para crear una nueva contraseña.
          </p>
        ) : (
          <>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder={`correo@${ALLOWED_EMAIL_DOMAIN}`}
              className="demo-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="demo-button" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </>
        )}
        <Link to="/login" search={{ redirect: '/registros' }} className="text-sm">
          Volver a iniciar sesión
        </Link>
      </form>
    </main>
  )
}
