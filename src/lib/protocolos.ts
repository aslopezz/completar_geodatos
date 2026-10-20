export type Protocolo = { id: string; nombre: string; sigla: string; alias?: readonly string[] }

// Fuente única de protocolos y siglas. La sigla alimenta la columna "NOMBRE METODOLOGIA".
// sigla '' = sin sigla definida.
const PROTOCOLOS: readonly Protocolo[] = [
  { id: 'transecta', nombre: 'Transecta', sigla: 'TA' },
  { id: 'poa', nombre: 'Punto de observación de aves', sigla: 'POA', alias: ['Punto de aves', 'Puntos de aves'] },
  { id: 'bat', nombre: 'Ecolocalizadores', sigla: 'BAT', alias: ['Detección de ecolocalizaciones'] },
  { id: 'ct', nombre: 'Cámaras trampa', sigla: 'CT', alias: ['Trampas cámara', 'Trampa cámara'] },
  { id: 'tsh', nombre: 'Trampas Sherman', sigla: 'TSH', alias: ['Trampas sherman'] },
  { id: 'mn', nombre: 'Monitoreo nocturno', sigla: 'MN', alias: ['Muestreo nocturno'] },
  { id: 'mta', nombre: 'Tránsito aéreo', sigla: 'MTA' },
  { id: 'censo', nombre: 'Censo', sigla: 'C' },
  { id: 'punto-conteo', nombre: 'Punto de conteo', sigla: 'PdC' },
  { id: 'recorrido-pedestre', nombre: 'Recorrido pedestre', sigla: 'RP' },
  { id: 'transecta-aves', nombre: 'Transecta para aves', sigla: 'TrA' },
]

// Sin mayúsculas, tildes ni espacios repetidos.
function normalize(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const INDEX = new Map<string, Protocolo>()
for (const protocolo of PROTOCOLOS) {
  for (const key of [protocolo.nombre, protocolo.sigla, ...(protocolo.alias ?? [])]) {
    const normalized = normalize(key)
    if (normalized && !INDEX.has(normalized)) INDEX.set(normalized, protocolo)
  }
}

export function getProtocolos(): readonly Protocolo[] {
  return PROTOCOLOS
}

export function findProtocolo(texto: string | undefined): Protocolo | undefined {
  const normalized = normalize(texto ?? '')
  return normalized ? INDEX.get(normalized) : undefined
}
