import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChangePasswordForm } from '#/components/ChangePasswordForm'
import { getAuthorizedSession } from '#/lib/auth'

export const Route = createFileRoute('/reset-password')({
  ssr: false,
  // El cliente de Supabase procesa el enlace del correo al iniciarse y crea la sesión de recuperación;
  // getSession espera a que termine ese proceso.
  loader: async () => ({ hasSession: !!(await getAuthorizedSession()) }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { hasSession } = Route.useLoaderData()
  const navigate = useNavigate()

  return (
    <main className="demo-page demo-center">
      {hasSession ? (
        <ChangePasswordForm title="Nueva contraseña" onDone={() => setTimeout(() => navigate({ to: '/registros' }), 1500)} />
      ) : (
        <div className="demo-panel flex w-full max-w-sm flex-col gap-3">
          <h1 className="demo-section-title">Enlace no válido</h1>
          <p className="demo-muted m-0 text-sm">El enlace expiró o ya fue usado. Solicita uno nuevo.</p>
          <Link to="/forgot-password" className="text-sm">
            Recuperar contraseña
          </Link>
        </div>
      )}
    </main>
  )
}
