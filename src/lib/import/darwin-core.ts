import { enChile, fechaDe } from '#/lib/import/sma'
import { hora, normalizar, numero, texto, type Libro, type Tabla, type Valor } from '#/lib/import/read-xlsx'
import type { ImportEstacion, ImportOpciones, ImportPreview, ImportRegistro, ImportTerreno } from '#/lib/import/types'
import { fromUtm } from '#/lib/utm'

// Darwin Core en xlsx: una hoja cuyos encabezados son los términos (occurrenceID, scientificName…).
// Sigue la planilla EDMAR: la fila 2 trae las etiquetas en español y se salta.

const REQUERIDOS = ['occurrenceID', 'scientificName']

// Primera hoja del libro con los encabezados de Darwin Core.
export function hojaDarwinCore(libro: Libro): Tabla | null {
  for (const hoja of libro.hojas) {
    const tabla = libro.tabla(hoja, REQUERIDOS, (f) => f['occurrenceid'] !== null || f['scientificname'] !== null)
    if (tabla) return tabla
  }
  return null
}

const PRESENTE = new Set(['present', 'presente'])
const AUSENTE = new Set(['absent', 'ausente'])

function fechaTexto(valor: Valor | undefined, libro: Libro): string | null {
  if (typeof valor === 'number') return libro.fecha(valor)
  return texto(valor)?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null // eventDate puede traer hora o un rango
}

function horaTexto(valor: Valor | undefined): string | null {
  if (typeof valor === 'number') return hora(valor)
  const m = texto(valor)?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}` : null
}

export function leerDarwinCore(libro: Libro, { zonaUtm }: ImportOpciones): ImportPreview {
  const tabla = hojaDarwinCore(libro)
  if (!tabla) return { formato: 'darwin-core', terrenos: [], estaciones: [], registros: [], omitidos: 0, advertencias: ['No se encontró una hoja con occurrenceID y scientificName.'] }

  const advertencias: string[] = []
  const terrenos = new Map<string, ImportTerreno>()
  const estaciones = new Map<string, ImportEstacion>()
  const registros: ImportRegistro[] = []
  let omitidos = 0
  let sinHallazgos = 0
  let usoUtm = false

  for (const f of tabla.filas) {
    // La fila de etiquetas en español (debajo de los encabezados) no es un registro.
    if (normalizar(texto(f['occurrenceid']) ?? '') === 'id del registro biologico') continue
    const aviso: string[] = []

    const estado = normalizar(texto(f['occurrencestatus']) ?? '')
    if (AUSENTE.has(estado)) {
      omitidos++
      continue
    }
    if (estado && !PRESENTE.has(estado)) aviso.push(`occurrenceStatus es "${texto(f['occurrencestatus'])}", no present/absent: se toma como presente.`)

    const nombreCientifico = texto(f['scientificname'])
    // "No encontrado en resultados" es una fila de muestreo sin hallazgos, no una especie: se trata como una ausencia.
    if (nombreCientifico && /^no encontrad/.test(normalizar(nombreCientifico))) {
      omitidos++
      sinHallazgos++
      continue
    }
    if (!nombreCientifico) aviso.push('Sin scientificName.')
    const [generoNombre, ...resto] = (nombreCientifico ?? '').split(/\s+/)
    const genero = texto(f['genus']) ?? (generoNombre || null)
    const epiteto = texto(f['specificepithet']) ?? (resto.join(' ').replace(/^(sp|spp)\.?$/i, '') || null)
    if (nombreCientifico && !epiteto) aviso.push('Solo género (sin epíteto específico).')

    // Fecha: eventDate, que se contrasta con year/month/day.
    const desdeEvento = fechaTexto(f['eventdate'], libro)
    const desdePartes = fechaDe(f['year'], f['month'], f['day'])
    if (desdeEvento && desdePartes && desdeEvento !== desdePartes) aviso.push(`eventDate (${desdeEvento}) no coincide con year/month/day (${desdePartes}): se usa eventDate.`)
    const fecha = desdeEvento ?? desdePartes
    if (!fecha) aviso.push('Sin fecha.')

    // Coordenadas: decimales, o UTM en verbatimLatitude (este) / verbatimLongitude (norte) con el huso elegido.
    let lat = numero(f['decimallatitude'])
    let lon = numero(f['decimallongitude'])
    if (lat === null || lon === null) {
      lat = lon = null
      const a = numero(f['verbatimlatitude'])
      const b = numero(f['verbatimlongitude'])
      if (a !== null && b !== null) {
        const [este, norte] = a < 1_000_000 && b >= 1_000_000 ? [a, b] : [b, a]
        ;[lon, lat] = fromUtm(este, norte, zonaUtm)
        usoUtm = true
        lat = Math.round(lat * 1e6) / 1e6
        lon = Math.round(lon * 1e6) / 1e6
      }
    }
    if (lat === null || lon === null) aviso.push('Sin coordenadas.')
    else if (!enChile(lat, lon)) aviso.push(`Coordenadas fuera de Chile (${lat}, ${lon}): revisa el huso UTM.`)

    const terrenoNombre = texto(f['datasetname']) ?? texto(f['expedition']) ?? texto(f['ownerinstitutioncode'])
    if (!terrenoNombre) aviso.push('Sin datasetName: no se sabe a qué terreno pertenece.')
    const terreno = terrenoNombre ?? '(sin nombre)'
    if (!terrenos.has(terreno)) terrenos.set(terreno, { clave: terreno, nombre: terreno, numero: null, fechaInicio: null, fechaFin: null, objetivo: null, comentarios: null })

    const comuna = texto(f['municipality']) ?? texto(f['county'])
    const localidad = texto(f['verbatimlocality']) ?? texto(f['locality'])
    const estacion = texto(f['eventid'])
    if (estacion && !estaciones.has(estacion)) estaciones.set(estacion, { clave: estacion, nombre: estacion, tipoMonitoreo: null, comuna, localidad, lat, lon })

    registros.push({
      origen: { hoja: tabla.hoja, fila: Number(f['__fila']) },
      terreno,
      estacion,
      protocolo: texto(f['samplingprotocol']),
      tipoRegistro: texto(f['occurrenceremarks']),
      nombreCientifico,
      genero,
      epiteto,
      nombreComun: texto(f['vernacularname']),
      clase: texto(f['class']),
      orden: texto(f['order']),
      familia: texto(f['family']),
      cantidad: numero(f['individualcount']),
      fecha,
      hora: horaTexto(f['eventtime']),
      usuario: texto(f['recordedby']),
      codigoIndividuo: texto(f['organismid']),
      idOrigen: texto(f['occurrenceid']),
      comuna,
      localidad,
      lat,
      lon,
      advertencias: aviso,
    })
  }

  if (sinHallazgos > 0) advertencias.push(`${sinHallazgos} filas dicen "No encontrado en resultados" (muestreo sin hallazgos): no se importan.`)
  if (usoUtm) advertencias.push(`Las coordenadas están en UTM (este en verbatimLatitude, norte en verbatimLongitude) y se convirtieron con el huso ${zonaUtm}S.`)
  return { formato: 'darwin-core', terrenos: [...terrenos.values()], estaciones: [...estaciones.values()], registros, omitidos, advertencias }
}
