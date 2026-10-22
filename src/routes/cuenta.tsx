import { createFileRoute } from '@tanstack/react-router'
import { ChangePasswordForm } from '#/components/ChangePasswordForm'
import { requireSession } from '#/lib/auth'

export const Route = createFileRoute('/cuenta')({
  ssr: false,
  beforeLoad: async ({ location }) => ({ user: (await requireSession(location)).user }),
  component: CuentaPage,
})

function CuentaPage() {
  const { user } = Route.useRouteContext()
  return (
    <main className="demo-page">
      <h1 className="demo-title mb-2">Cuenta</h1>
      <p className="demo-muted text-sm">{user.email}</p>
      <ChangePasswordForm />
    </main>
  )
}
