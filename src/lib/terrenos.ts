import { getSupabase } from '#/lib/supabase'

// Valores guardados en la base (sin tildes, ver check de terrenos_aprobacion.sql) → nombre legible.
export const TIPOS = {
  linea_base: 'Línea de base',
  monitoreo: 'Monitoreo',
  rescate: 'Rescate',
  perturbacion_controlada: 'Perturbación controlada',
  microruteo: 'Microruteo',
} as const

export const COMPONENTES = {
  flora: 'Flora',
  fauna: 'Fauna',
  limnologia: 'Limnología',
  entomologia: 'Entomología',
  hongos_liquenes: 'Hongos y líquenes',
} as const

export const TEMPORADAS = {
  verano: 'Verano',
  otono: 'Otoño',
  invierno: 'Invierno',
  primavera: 'Primavera',
} as const

export type Tipo = keyof typeof TIPOS
export type Componente = keyof typeof COMPONENTES
export type Temporada = keyof typeof TEMPORADAS

export type Proyecto = { id_proyecto: string; nombre_proyecto: string; descripcion: string | null }

export type NuevoProyecto = Omit<Proyecto, 'id_proyecto'>

export type Terreno = {
  id_terreno: string
  id_proyecto: string
  nombre: string
  tipo: Tipo
  componente: Componente
  fecha_inicio: string | null
  fecha_fin: string | null // null = en curso
  temporada: Temporada | null
  objetivo: string | null
  comentarios: string | null
}

export type NuevoTerreno = Omit<Terreno, 'id_terreno'>

export async function fetchProyectos(): Promise<Proyecto[]> {
  const { data, error } = await getSupabase().from('proyectos').select('id_proyecto,nombre_proyecto,descripcion')
  if (error) throw new Error(`No se pudieron cargar los proyectos: ${error.message}`)
  return (data as Proyecto[])
    .map((p) => ({ ...p, nombre_proyecto: p.nombre_proyecto.trim() }))
    .sort((a, b) => a.nombre_proyecto.localeCompare(b.nombre_proyecto, 'es'))
}

// Devuelve el mensaje de error, o null si se guardó.
export async function createProyecto(proyecto: NuevoProyecto): Promise<string | null> {
  const { error } = await getSupabase().from('proyectos').insert(proyecto)
  return error ? `No se pudo crear el proyecto: ${error.message}` : null
}

export async function fetchTerrenos(): Promise<Terreno[]> {
  const { data, error } = await getSupabase().from('terrenos').select('*')
  if (error) throw new Error(`No se pudieron cargar los terrenos: ${error.message}`)
  return (data as Terreno[]).sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? '') || a.nombre.localeCompare(b.nombre, 'es'))
}

// Devuelve el mensaje de error, o null si se guardó.
export async function createTerreno(terreno: NuevoTerreno): Promise<string | null> {
  const { error } = await getSupabase().from('terrenos').insert(terreno)
  return error ? `No se pudo crear el terreno: ${error.message}` : null
}

export function fechasLabel(t: Pick<Terreno, 'fecha_inicio' | 'fecha_fin'>): string {
  if (!t.fecha_inicio) return t.fecha_fin ? `hasta ${t.fecha_fin}` : 'Sin fechas'
  return `${t.fecha_inicio} → ${t.fecha_fin ?? 'en curso'}`
}
