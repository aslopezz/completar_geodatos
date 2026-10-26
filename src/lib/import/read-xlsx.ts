import { strFromU8, unzipSync } from 'fflate'

// Lector mínimo de xlsx para importar archivos: hojas → filas con los encabezados como clave.
// Con expresiones regulares y no DOMParser, para poder probarlo fuera del navegador (igual que src/lib/sma/xlsx.ts).

export type Valor = string | number | null
export type Fila = Record<string, Valor>

export type Tabla = { hoja: string; encabezados: string[]; filas: Fila[]; primeraFila: number }

// Sin tildes, en minúsculas y con espacios simples: "Año del  evento" → "ano del evento".
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Ruta del XML de cada hoja según su nombre (workbook.xml + sus relaciones).
export function sheetPaths(files: Record<string, Uint8Array>): Map<string, string> {
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const targets = new Map([...rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map(([, id, target]) => [id, target]))
  const paths = new Map<string, string>()
  for (const [, name, id] of strFromU8(files['xl/workbook.xml']).matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const target = targets.get(id) ?? ''
    paths.set(unescapeXml(name), target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  return paths
}

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()]!
  })
}

// Texto de una celda o string compartido; con texto enriquecido hay varios <t> que se concatenan.
function textOf(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>(.*?)<\/t>/gs)].map(([, t]) => unescapeXml(t)).join('')
}

function colIndex(col: string): number {
  return [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)
}

export class Libro {
  private files: Record<string, Uint8Array>
  private paths: Map<string, string>
  private strings: string[]
  readonly hojas: string[]
  // Con calendario 1904 (Excel de Mac antiguo) los números de fecha parten otro día.
  readonly date1904: boolean

  constructor(data: Uint8Array) {
    this.files = unzipSync(data)
    if (!this.files['xl/workbook.xml']) throw new Error('El archivo no es un xlsx válido')
    this.paths = sheetPaths(this.files)
    this.hojas = [...this.paths.keys()]
    this.date1904 = /<workbookPr[^>]*date1904="(1|true)"/.test(strFromU8(this.files['xl/workbook.xml']))
    const shared = this.files['xl/sharedStrings.xml']
    this.strings = shared ? [...strFromU8(shared).matchAll(/<si>(.*?)<\/si>|<si\/>/gs)].map(([, si]) => (si ? textOf(si) : '')) : []
  }

  tiene(hoja: string): boolean {
    return this.hojas.some((h) => normalizar(h) === normalizar(hoja))
  }

  // Filas de la hoja como mapas columna → valor. Las celdas se ubican por su referencia (r="B7"), no por el orden.
  private *filasCrudas(hoja: string): Generator<[number, Map<number, Valor>]> {
    const name = this.hojas.find((h) => normalizar(h) === normalizar(hoja))
    const path = name && this.paths.get(name)
    if (!path || !this.files[path]) return
    const xml = strFromU8(this.files[path])
    for (const [, num, inner] of xml.matchAll(/<row [^>]*?\br="(\d+)"[^>]*?(?:\/>|>(.*?)<\/row>)/gs)) {
      const cells = new Map<number, Valor>()
      for (const [, col, attrs, content] of (inner ?? '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
        const value = this.celda(attrs, content ?? '')
        if (value !== null) cells.set(colIndex(col), value)
      }
      yield [Number(num), cells]
    }
  }

  private celda(attrs: string, content: string): Valor {
    const type = attrs.match(/\bt="([^"]+)"/)?.[1]
    if (type === 'inlineStr') return textOf(content).trim() || null
    const raw = content.match(/<v>(.*?)<\/v>/s)?.[1]
    if (raw === undefined) return null
    if (type === 's') return (this.strings[Number(raw)] ?? '').trim() || null
    if (type === 'str') {
      const text = unescapeXml(raw).trim()
      // Resultado de una fórmula con error (EDMAR trae "#N/A" en clase, orden y familia).
      return /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!|NULL!|NUM!)$/.test(text) ? null : text || null
    }
    if (type === 'e') return null // #N/A y similares: se leen como vacío
    if (type === 'b') return raw === '1' ? 1 : 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  // Busca la fila de encabezados: la primera (dentro de las primeras 10) que contiene todos los textos pedidos.
  // Las columnas se llaman por el encabezado normalizado; si se repite, el segundo lleva "#2", etc.
  // `conservar` descarta filas al leerlas (las hojas de las plantillas SMA traen ~1 millón de filas vacías).
  tabla(hoja: string, requeridos: string[], conservar: (fila: Fila) => boolean = () => true): Tabla | null {
    let columnas: [number, string][] | null = null
    let primeraFila = 0
    const filas: Fila[] = []
    for (const [num, cells] of this.filasCrudas(hoja)) {
      if (!columnas) {
        if (num > 10) return null
        const textos = [...cells].filter(([, v]) => typeof v === 'string').map(([i, v]) => [i, normalizar(v as string)] as [number, string])
        if (!requeridos.every((r) => textos.some(([, t]) => t === normalizar(r)))) continue
        const vistos = new Map<string, number>()
        columnas = textos.map(([i, t]) => {
          const n = (vistos.get(t) ?? 0) + 1
          vistos.set(t, n)
          return [i, n === 1 ? t : `${t}#${n}`]
        })
        primeraFila = num + 1
        continue
      }
      if (cells.size === 0) continue
      const fila: Fila = {}
      for (const [i, key] of columnas) fila[key] = cells.get(i) ?? null
      if (conservar(fila)) filas.push({ ...fila, __fila: num })
    }
    return columnas ? { hoja, encabezados: columnas.map(([, t]) => t), filas, primeraFila } : null
  }

  // Número de día de Excel → "AAAA-MM-DD". Cuenta en UTC: con Date local el día se corre en Chile.
  fecha(serial: number): string {
    const ms = Date.UTC(this.date1904 ? 1904 : 1899, this.date1904 ? 0 : 11, this.date1904 ? 1 : 30) + Math.floor(serial) * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }
}

// Fracción de día → "HH:MM:SS", redondeando al segundo más cercano.
export function hora(fraccion: number): string {
  const total = Math.round((fraccion - Math.floor(fraccion)) * 86400) % 86400
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

// Texto con coma decimal ("-32,84491") o número → número; vacío o ilegible → null.
export function numero(valor: Valor | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor !== 'string') return null
  const n = Number(valor.trim().replace(',', '.'))
  return valor.trim() !== '' && Number.isFinite(n) ? n : null
}

export const texto = (valor: Valor | undefined): string | null => (valor === null || valor === undefined ? null : String(valor).trim() || null)
