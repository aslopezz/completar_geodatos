import type { Terreno } from '#/lib/terrenos'
import { normalizar } from '#/lib/import/read-xlsx'
import type { Destino, DestinoTerreno, ImportTerreno } from '#/lib/import/types'

// Propuesta inicial: si el proyecto ya tiene un terreno con el mismo nombre se propone ese (evita duplicarlo); si no, uno nuevo.
export function destinoInicial(idProyecto: string, delArchivo: ImportTerreno[], existentes: Terreno[]): Destino {
  const terrenos: Record<string, DestinoTerreno> = {}
  for (const t of delArchivo) {
    const igual = existentes.find((e) => e.id_proyecto === idProyecto && normalizar(e.nombre) === normalizar(t.nombre))
    terrenos[t.clave] = igual ? { modo: 'existente', idTerreno: igual.id_terreno } : { modo: 'nuevo', tipo: '', componente: '' }
  }
  return { idProyecto, terrenos }
}

// Lo que falta elegir antes de poder guardar (vacío = listo).
export function pendientes(destino: Destino | null, delArchivo: ImportTerreno[]): string[] {
  if (!destino?.idProyecto) return ['Elige el proyecto.']
  const faltan: string[] = []
  for (const t of delArchivo) {
    const d = destino.terrenos[t.clave]
    if (!d) faltan.push(`Elige el terreno de "${t.nombre}".`)
    else if (d.modo === 'existente' && !d.idTerreno) faltan.push(`Elige el terreno existente para "${t.nombre}".`)
    else if (d.modo === 'nuevo' && (!d.tipo || !d.componente)) faltan.push(`Elige el tipo y el componente del terreno nuevo "${t.nombre}".`)
  }
  return faltan
}
