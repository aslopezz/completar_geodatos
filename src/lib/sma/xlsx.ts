import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { ExportFile } from '#/lib/export-file'
import { sheetPaths } from '#/lib/import/read-xlsx'
import type { Celda, Fila, Planilla } from '#/lib/sma/planilla'
import templateUrl from '#/assets/sma/FormatoBiodiversidadMonitoreoYLineaBase_v5.2.xlsx?url'

// Escribe las filas sobre la plantilla oficial de la SMA, tocando lo mínimo del XML:
// se mantienen las hojas, encabezados, validaciones, protección y la hoja oculta ID con la versión.

// Primera fila de datos de cada hoja (las anteriores son encabezados y se dejan tal cual).
const HOJAS = { campana: ['Campaña', 3], estaciones: ['EstacionReplica', 2], ocurrencias: ['Ocurrencia', 3] } as const

function escapeXml(text: string): string {
  // Fuera los caracteres de control que XML no admite.
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function colIndex(col: string): number {
  return [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
}

// Celdas de una fila de la plantilla ('' si la fila no existe o está vacía, <row …/>).
function rowContent(xml: string, r: number): string {
  return xml.match(new RegExp(`<row r="${r}"(?:[^>]*?/>|[^>]*>(.*?)</row>)`, 's'))?.[1] ?? ''
}

// Estilo de cada columna: el de la primera fila de datos de la plantilla, o el de la columna (<cols>).
// Sirve para que las celdas nuevas queden desbloqueadas como las de la plantilla (las hojas están protegidas).
function columnStyles(xml: string, firstRow: number): Map<number, string> {
  const styles = new Map<number, string>()
  for (const [, min, max, style] of xml.matchAll(/<col min="(\d+)" max="(\d+)"[^>]*?style="(\d+)"/g)) {
    for (let i = Number(min); i <= Math.min(Number(max), 60); i++) styles.set(i, style)
  }
  const row = rowContent(xml, firstRow)
  for (const [, col, style] of row.matchAll(/<c r="([A-Z]+)\d+" s="(\d+)"/g)) styles.set(colIndex(col), style)
  return styles
}

function cellXml(ref: string, value: Celda, style: string | undefined): string {
  const s = style ? ` s="${style}"` : ''
  if (value === null || value === '') return ''
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : ''
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

type Hoja = { filas: Fila[]; firstRow: number; extraStyles?: Record<string, string>; formulas?: Record<string, string> }

function fillSheet(xml: string, { filas, firstRow, extraStyles = {}, formulas = {} }: Hoja): string {
  const styles = columnStyles(xml, firstRow)
  const rows = filas.map((fila, i) => {
    const r = firstRow + i
    const cells = new Map<number, string>()
    for (const [col, value] of Object.entries(fila)) {
      const cell = cellXml(`${col}${r}`, value, extraStyles[col] ?? styles.get(colIndex(col)))
      if (cell) cells.set(colIndex(col), cell)
    }
    // Las fórmulas de la plantilla se copian a cada fila, cambiando el número de fila de sus referencias.
    for (const [col, formula] of Object.entries(formulas)) {
      const f = formula.replace(new RegExp(`(?<![$A-Z])([A-Z]+)${firstRow}(?!\\d)`, 'g'), `$1${r}`)
      const style = styles.get(colIndex(col))
      cells.set(colIndex(col), `<c r="${col}${r}"${style ? ` s="${style}"` : ''} t="str"><f>${f}</f></c>`)
    }
    return `<row r="${r}">${[...cells.entries()].sort(([a], [b]) => a - b).map(([, c]) => c).join('')}</row>`
  })
  // Se quedan solo los encabezados; las filas vacías de la plantilla se reemplazan por los datos.
  return xml.replace(/<sheetData>(.*?)<\/sheetData>/s, (_, inner: string) => {
    const header = [...inner.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>.*?<\/row>)/gs)].filter(([, n]) => Number(n) < firstRow).map(([row]) => row)
    return `<sheetData>${header.join('')}${rows.join('')}</sheetData>`
  }).replace(/<dimension ref="([A-Z]+)1:([A-Z]+)\d+"\/>/, (_, a, b) => `<dimension ref="${a}1:${b}${Math.max(firstRow - 1 + filas.length, firstRow - 1)}"/>`)
}

// Fórmulas de la primera fila de datos (las columnas "AUTOCOMPLETADO" de Ocurrencia).
function templateFormulas(xml: string, firstRow: number): Record<string, string> {
  const row = rowContent(xml, firstRow)
  return Object.fromEntries([...row.matchAll(/<c r="([A-Z]+)\d+"[^>]*><f>(.*?)<\/f>/gs)].map(([, col, f]) => [col, f]))
}

// Agrega dos estilos de hora (h:mm y h:mm:ss), desbloqueados como las celdas de datos; devuelve sus índices.
function addTimeStyles(stylesXml: string): { xml: string; hora: string; horaSegundos: string } {
  const count = Number(stylesXml.match(/<cellXfs count="(\d+)"/)?.[1])
  const xf = (numFmt: number) =>
    `<xf numFmtId="${numFmt}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyProtection="1"><protection locked="0"/></xf>`
  const xml = stylesXml
    .replace(/<cellXfs count="\d+"/, `<cellXfs count="${count + 2}"`)
    .replace('</cellXfs>', `${xf(20)}${xf(21)}</cellXfs>`)
  return { xml, hora: String(count), horaSegundos: String(count + 1) }
}

export async function writePlanilla(planilla: Planilla, fileName: string): Promise<ExportFile> {
  const response = await fetch(templateUrl)
  if (!response.ok) throw new Error('No se pudo cargar la plantilla SMA')
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const paths = sheetPaths(files)
  const read = (path: string) => strFromU8(files[path])
  const write = (path: string, xml: string) => (files[path] = strToU8(xml))

  const time = addTimeStyles(read('xl/styles.xml'))
  write('xl/styles.xml', time.xml)

  const [campanaName, campanaRow] = HOJAS.campana
  const [estacionName, estacionRow] = HOJAS.estaciones
  const [ocurrenciaName, ocurrenciaRow] = HOJAS.ocurrencias
  const campanaPath = paths.get(campanaName)!
  const estacionPath = paths.get(estacionName)!
  const ocurrenciaPath = paths.get(ocurrenciaName)!

  write(campanaPath, fillSheet(read(campanaPath), { filas: [planilla.campana], firstRow: campanaRow }))
  write(estacionPath, fillSheet(read(estacionPath), { filas: planilla.estaciones, firstRow: estacionRow }))
  const ocurrenciaXml = read(ocurrenciaPath)
  write(
    ocurrenciaPath,
    fillSheet(ocurrenciaXml, {
      filas: planilla.ocurrencias,
      firstRow: ocurrenciaRow,
      extraStyles: { H: time.hora, AH: time.horaSegundos },
      formulas: templateFormulas(ocurrenciaXml, ocurrenciaRow),
    }),
  )

  // Las fórmulas nuevas no tienen valor guardado: Excel las recalcula al abrir.
  // calcChain lista las celdas con fórmula de la plantilla; quedaría desactualizado, así que se quita.
  write('xl/workbook.xml', read('xl/workbook.xml').replace(/<calcPr([^>]*?)\/>/, (_, attrs: string) => `<calcPr${attrs.replace(/ fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`))
  delete files['xl/calcChain.xml']
  write('[Content_Types].xml', read('[Content_Types].xml').replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''))
  write('xl/_rels/workbook.xml.rels', read('xl/_rels/workbook.xml.rels').replace(/<Relationship [^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/, ''))

  const blob = new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { fileName: `${fileName.replace(/\.[^.]+$/, '') || 'exportacion'}_SMA.xlsx`, blob }
}
