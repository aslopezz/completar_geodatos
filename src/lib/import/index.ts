import { leerDarwinCore, hojaDarwinCore } from '#/lib/import/darwin-core'
import { Libro } from '#/lib/import/read-xlsx'
import { esSma, esSmaRescate, leerSma } from '#/lib/import/sma'
import type { Deteccion, ImportOpciones, ImportPreview } from '#/lib/import/types'

export function abrirLibro(data: Uint8Array): Libro {
  try {
    return new Libro(data)
  } catch {
    throw new Error('No se pudo abrir el archivo: no parece un .xlsx válido.')
  }
}

// Reconoce el formato por las hojas, no por la versión oculta de la plantilla SMA.
export function detectar(libro: Libro): Deteccion {
  if (esSma(libro)) return { formato: 'sma' }
  if (esSmaRescate(libro)) return { formato: null, motivo: 'Es la planilla SMA de Rescate y Relocalización (hoja Captura); todavía no se puede importar.' }
  if (hojaDarwinCore(libro)) return { formato: 'darwin-core' }
  return { formato: null, motivo: 'No se reconoce el formato: no es una planilla SMA ni tiene las columnas occurrenceID y scientificName de Darwin Core.' }
}

export function leerImportacion(libro: Libro, opciones: ImportOpciones): ImportPreview {
  const deteccion = detectar(libro)
  if (!deteccion.formato) throw new Error(deteccion.motivo)
  return quitarHorasRepetidas(deteccion.formato === 'sma' ? leerSma(libro) : leerDarwinCore(libro, opciones))
}

// Si todos los registros de un terreno traen la misma hora, es la hora de inicio del evento copiada y no la de cada registro:
// guardarla sería información falsa. Se deja vacía (y se avisa); una hora que varía sí se conserva.
function quitarHorasRepetidas(preview: ImportPreview): ImportPreview {
  for (const terreno of preview.terrenos) {
    const delTerreno = preview.registros.filter((r) => r.terreno === terreno.clave && r.hora)
    if (delTerreno.length < 2 || new Set(delTerreno.map((r) => r.hora)).size > 1) continue
    preview.advertencias.push(`Terreno "${terreno.nombre}": los ${delTerreno.length} registros traen la misma hora (${delTerreno[0].hora}); no se guarda.`)
    for (const r of delTerreno) r.hora = null
  }
  return preview
}
