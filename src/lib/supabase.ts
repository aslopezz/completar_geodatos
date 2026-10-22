import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

// Creación perezosa: sin variables de entorno solo fallan las vistas de auth, no todo el sitio.
// La sesión vive en localStorage: usar solo en el navegador (rutas protegidas con ssr: false).
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
    client = createClient(url, key)
  }
  return client
}
