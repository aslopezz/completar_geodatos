import { redirect } from '@tanstack/react-router'
import { clearRegistrosCache } from '#/lib/registros'
import { getSupabase } from '#/lib/supabase'

export const ALLOWED_EMAIL_DOMAIN = 'ecorestaura.cl'

export function isCompanyEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  // Dominio exacto y un único "@": evita variantes como "a@b.com@ecorestaura.cl".
  return at > 0 && normalized.indexOf('@') === at && normalized.slice(at + 1) === ALLOWED_EMAIL_DOMAIN
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!isCompanyEmail(email)) return `Solo se permiten correos @${ALLOWED_EMAIL_DOMAIN}.`
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
  clearRegistrosCache()
  return error ? 'Correo o contraseña incorrectos.' : null
}

export const MIN_PASSWORD_LENGTH = 10

export async function changePassword(password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
  const { error } = await getSupabase().auth.updateUser({ password })
  return error ? 'No se pudo cambiar la contraseña. Inicia sesión de nuevo e inténtalo otra vez.' : null
}

// Respuesta siempre neutra para no revelar qué correos tienen cuenta.
export async function requestPasswordReset(email: string): Promise<void> {
  if (!isCompanyEmail(email)) return
  await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
}

export async function signOut() {
  clearRegistrosCache()
  await getSupabase().auth.signOut()
}

// Sesión válida solo si el correo es de la empresa (defensa extra ante cuentas creadas por otras vías).
export async function getAuthorizedSession() {
  const { data } = await getSupabase().auth.getSession()
  const session = data.session
  return session && isCompanyEmail(session.user.email) ? session : null
}

// Guard de rutas privadas: sin sesión válida redirige a /login y vuelve a la ruta original al ingresar.
export async function requireSession(location: { pathname: string }) {
  const session = await getAuthorizedSession()
  if (!session) throw redirect({ to: '/login', search: { redirect: location.pathname } })
  return session
}
