// Forma común de lo que sale de cualquier archivo: cada formato tiene su adaptador y todo lo que sigue
// (vista previa, búsqueda de especies, guardado) trabaja sobre esto. Los campos de ImportRegistro
// siguen las columnas de `registros` para que guardar sea mecánico.

export type Formato = 'sma' | 'darwin-core'

export const FORMATOS: Record<Formato, string> = {
  sma: 'Planilla SMA (Monitoreo y Línea Base)',
  'darwin-core': 'Darwin Core',
}

export type ImportTerreno = {
  clave: string // id de la campaña en el archivo, o el nombre del conjunto de datos
  nombre: string
  numero: number | null
  fechaInicio: string | null
  fechaFin: string | null
  objetivo: string | null
  comentarios: string | null
}

export type ImportEstacion = {
  clave: string
  nombre: string
  tipoMonitoreo: string | null
  comuna: string | null
  localidad: string | null
  lat: number | null
  lon: number | null
}

export type ImportRegistro = {
  origen: { hoja: string; fila: number }
  terreno: string // ImportTerreno.clave
  estacion: string | null // nombre de la estación
  protocolo: string | null // protocolo_muestreo
  tipoRegistro: string | null
  // Taxón tal como viene en el archivo; la clave GBIF se busca después.
  nombreCientifico: string | null
  genero: string | null
  epiteto: string | null
  nombreComun: string | null
  clase: string | null
  orden: string | null
  familia: string | null
  cantidad: number | null
  fecha: string | null // AAAA-MM-DD
  hora: string | null // HH:MM:SS
  usuario: string | null
  // Identificador del individuo (SMA "Código individuo"). Distinto de id_registro; la columna aún no existe en la base.
  codigoIndividuo: string | null
  idOrigen: string | null // occurrenceID en Darwin Core
  comuna: string | null
  localidad: string | null
  lat: number | null
  lon: number | null
  advertencias: string[]
}

export type ImportPreview = {
  formato: Formato
  terrenos: ImportTerreno[]
  estaciones: ImportEstacion[]
  registros: ImportRegistro[]
  omitidos: number // filas leídas que no se importan (p. ej. ausencias)
  advertencias: string[] // del archivo completo
}

export type ImportOpciones = { zonaUtm: 18 | 19 }

// Resultado de abrir un archivo: o se reconoce, o se explica por qué no.
export type Deteccion = { formato: Formato } | { formato: null; motivo: string }

// Adónde va lo importado: un proyecto de la base y, por cada terreno del archivo, un terreno existente o uno nuevo.
// El tipo y el componente no vienen en las planillas: los elige quien importa.
export type DestinoTerreno = { modo: 'existente'; idTerreno: string } | { modo: 'nuevo'; tipo: string; componente: string }
export type Destino = { idProyecto: string; terrenos: Record<string, DestinoTerreno> }

// Texto con el que se busca la especie de un registro: el nombre científico o, si no lo trae, el nombre común.
export const nombreParaBuscar = (r: Pick<ImportRegistro, 'nombreCientifico' | 'nombreComun'>): string | null => (r.nombreCientifico ?? r.nombreComun)?.trim() || null
