import { nombreParaBuscar, type ImportPreview } from '#/lib/import/types'

// Correcciones a mano sobre lo leído del archivo (el archivo no se modifica): el nombre de la especie, para volver a buscar su clave.

export type Correcciones = {
  nombres: Record<string, string> // nombre en el archivo -> nombre corregido
}

export const SIN_CORRECCIONES: Correcciones = { nombres: {} }

// Cambia el nombre que se está buscando (`actual`) por `nuevo`, también para los nombres del archivo que ya se habían corregido a `actual`.
export function renombrar(nombres: Record<string, string>, actual: string, nuevo: string): Record<string, string> {
  const salida = { ...nombres }
  for (const [original, corregido] of Object.entries(salida)) if (corregido === actual) salida[original] = nuevo
  if (!(actual in salida)) salida[actual] = nuevo
  return salida
}

export function aplicarCorrecciones(preview: ImportPreview, { nombres }: Correcciones): ImportPreview {
  const registros = preview.registros.map((r) => {
    const buscado = nombreParaBuscar(r)
    const nuevo = buscado ? nombres[buscado] : undefined
    return nuevo ? { ...r, nombreCientifico: nuevo, advertencias: [...r.advertencias, 'Nombre corregido a mano.'] } : r
  })
  return { ...preview, registros }
}
