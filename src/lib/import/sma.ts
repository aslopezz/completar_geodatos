import { hora, numero, texto, type Fila, type Libro, type Valor } from '#/lib/import/read-xlsx'
import type { ImportEstacion, ImportPreview, ImportRegistro, ImportTerreno } from '#/lib/import/types'
import { UBICACION_COMUNA } from '#/lib/sma/comunas'

// Planilla SMA de Monitoreo y Línea Base (RE 343/2022): hojas Campaña, EstacionReplica y Ocurrencia.
// En la planilla "campaña" es lo que acá se llama terreno. Las columnas se buscan por el texto del encabezado.

export const esSma = (libro: Libro) => libro.tiene('Campaña') && libro.tiene('EstacionReplica') && libro.tiene('Ocurrencia')
// El formato de rescate guarda los registros en "Captura" en vez de "Ocurrencia".
export const esSmaRescate = (libro: Libro) => libro.tiene('Campaña') && libro.tiene('EstacionReplica') && libro.tiene('Captura')

export function fechaDe(año: Valor | undefined, mes: Valor | undefined, día: Valor | undefined): string | null {
  const [y, m, d] = [numero(año), numero(mes), numero(día)]
  if (!y || !m || !d) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  const valida = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  return valida ? date.toISOString().slice(0, 10) : null
}

// Rango aproximado de Chile continental e insular: atrapa latitud y longitud invertidas o con el signo perdido.
export const enChile = (lat: number, lon: number) => lat >= -56 && lat <= -17 && lon >= -110 && lon <= -66

function horaDe(valor: Valor | undefined): string | null {
  const n = numero(valor)
  return typeof valor === 'number' && n !== null ? hora(n) : texto(valor)
}

export function leerSma(libro: Libro): ImportPreview {
  const advertencias: string[] = []

  const campañas = libro.tabla('Campaña', ['ID Campaña'])
  const terrenos: ImportTerreno[] = (campañas?.filas ?? [])
    .filter((f) => f['id campana'] !== null)
    .map((f) => ({
      clave: String(f['id campana']),
      nombre: texto(f['nombre campana']) ?? `Campaña ${f['id campana']}`,
      numero: numero(f['numero de campana']),
      fechaInicio: fechaDe(f['ano inicio'], f['mes inicio'], f['dia inicio']),
      fechaFin: fechaDe(f['ano termino'], f['mes termino'], f['dia termino']),
      objetivo: texto(f['objetivo de la campana']),
      comentarios: texto(f['comentarios adicionales']),
    }))
  if (!campañas) advertencias.push('No se encontró la hoja Campaña con sus encabezados.')

  const hojaEstaciones = libro.tabla('EstacionReplica', ['ID EstacionReplica'])
  const estaciones: ImportEstacion[] = (hojaEstaciones?.filas ?? [])
    .filter((f) => f['id estacionreplica'] !== null)
    .map((f) => {
      const clave = String(f['id estacionreplica'])
      return {
        clave,
        nombre: texto(f['nombre estacion']) ?? clave,
        tipoMonitoreo: texto(f['tipo de monitoreo']),
        comuna: texto(f['comuna']),
        localidad: texto(f['localidad']),
        // Sin punto central (transectos), se usa el inicio.
        lat: numero(f['latitud decimal central']) ?? numero(f['latitud decimal inicio']),
        lon: numero(f['longitud decimal central']) ?? numero(f['longitud decimal inicio']),
      }
    })
  if (!hojaEstaciones) advertencias.push('No se encontró la hoja EstacionReplica con sus encabezados.')
  const estacionPorClave = new Map(estaciones.map((e) => [e.clave, e]))

  for (const e of estaciones) {
    if (e.comuna && !UBICACION_COMUNA[e.comuna]) advertencias.push(`Estación ${e.nombre}: la comuna "${e.comuna}" no está en la lista de comunas.`)
  }

  // Una fila de Ocurrencia es real si tiene taxón; la plantilla trae ~1 millón de filas con fórmulas.
  const tieneTaxon = (f: Fila) => ['genero', 'epiteto especifico', 'nombre comun'].some((k) => f[k] !== null)
  const ocurrencias = libro.tabla('Ocurrencia', ['ID Campaña', 'Género'], tieneTaxon)
  if (!ocurrencias) advertencias.push('No se encontró la hoja Ocurrencia con sus encabezados.')

  const terrenoClaves = new Set(terrenos.map((t) => t.clave))
  const registros: ImportRegistro[] = []
  let omitidos = 0

  for (const f of ocurrencias?.filas ?? []) {
    const aviso: string[] = []
    const terreno = f['id campana'] === null ? '' : String(f['id campana'])
    if (!terrenoClaves.has(terreno)) aviso.push(`La campaña ${terreno || '(vacía)'} no está en la hoja Campaña.`)

    const estacion = f['id estacionreplica'] === null ? null : estacionPorClave.get(String(f['id estacionreplica']))
    if (!estacion) aviso.push('La estación no está en la hoja EstacionReplica.')

    // Cantidad: en presencia/ausencia, 1 si está y la fila se omite si es una ausencia.
    const valor = numero(f['valor'])
    const cuantificacion = normalizado(f['tipo de cuantificacion'])
    const parametro = normalizado(f['parametro'])
    let cantidad: number | null = null
    if (cuantificacion.includes('presencia') || parametro.includes('presencia')) {
      if (valor === 0) {
        omitidos++
        continue
      }
      cantidad = 1
    } else if (cuantificacion.includes('abundancia')) {
      cantidad = valor
      if (cantidad === null) aviso.push('Abundancia sin valor.')
    } else {
      aviso.push(`Tipo de cuantificación "${texto(f['tipo de cuantificacion']) ?? ''}" no es un conteo: no se guarda cantidad.`)
    }

    const genero = texto(f['genero'])
    const epiteto = texto(f['epiteto especifico'])
    const infra = texto(f['epiteto infraespecifico'])
    const nombreCientifico = genero ? [genero, epiteto, infra].filter(Boolean).join(' ') : null
    if (!genero) aviso.push('Sin género: solo tiene nombre común.')
    else if (!epiteto) aviso.push('Solo género (sin epíteto específico).')

    const fecha = fechaDe(f['ano del evento'], f['mes del evento'], f['dia del evento'])
    if (!fecha) aviso.push('Fecha incompleta o inválida.')

    // Coordenadas: las del registro, y si faltan las de la estación.
    let lat = numero(f['latitud decimal registro'])
    let lon = numero(f['longitud decimal registro'])
    if (lat === null || lon === null) {
      lat = estacion?.lat ?? null
      lon = estacion?.lon ?? null
      aviso.push(lat === null ? 'Sin coordenadas.' : 'Sin coordenadas propias: se usaría el punto de la estación.')
    }
    if (lat !== null && lon !== null && !enChile(lat, lon)) aviso.push(`Coordenadas fuera de Chile (${lat}, ${lon}).`)

    registros.push({
      origen: { hoja: 'Ocurrencia', fila: Number(f['__fila']) },
      terreno,
      estacion: estacion?.nombre ?? null,
      protocolo: texto(f['protocolo de muestreo']),
      tipoRegistro: texto(f['tipo de registro']),
      nombreCientifico,
      genero,
      epiteto: epiteto ? [epiteto, infra].filter(Boolean).join(' ') : null,
      nombreComun: texto(f['nombre comun']),
      clase: texto(f['clase']),
      orden: texto(f['orden']),
      familia: texto(f['familia']),
      cantidad,
      fecha,
      hora: horaDe(f['hora registro']) ?? horaDe(f['hora inicio evento (hh:mm)']),
      usuario: texto(f['muestreado por']),
      codigoIndividuo: texto(f['codigo individuo']),
      idOrigen: null,
      comuna: estacion?.comuna ?? null,
      localidad: estacion?.localidad ?? null,
      lat,
      lon,
      advertencias: aviso,
    })
  }

  return { formato: 'sma', terrenos, estaciones, registros, omitidos, advertencias }
}

const normalizado = (v: Valor | undefined) => (texto(v) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
