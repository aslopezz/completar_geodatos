import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isCompanyEmail } from '#/lib/auth'
import { getSupabase } from '#/lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let auth
    try {
      auth = getSupabase().auth
    } catch {
      // Sin configuración de Supabase el sitio público sigue funcionando, solo sin sesión.
      setReady(true)
      return
    }
    auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  return { session, ready, isAuthenticated: !!session && isCompanyEmail(session.user.email) }
}
