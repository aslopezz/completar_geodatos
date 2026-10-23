// Las funciones de exportación devuelven el archivo; quien llama decide cuándo descargarlo.
export type ExportFile = { fileName: string; blob: Blob }

type CsvValue = string | number | null | undefined

// Evita que Excel interprete como fórmula un texto que empiece con = + - @ (los números negativos pasan tal cual).
function csvCell(value: CsvValue): string {
  const text = String(value ?? '')
  return `"${(/^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text).replace(/"/g, '""')}"`
}

// Formato común de los CSV: separador ";", fin de línea \r\n, UTF-8 sin BOM
// (la app Shiny lee con read.csv(encoding = "UTF-8") y el BOM ensuciaría el nombre de la primera columna).
export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
}

export function csvFile(rows: CsvValue[][], fileName: string): ExportFile {
  return { fileName, blob: new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }) }
}

export function download({ blob, fileName }: ExportFile) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
