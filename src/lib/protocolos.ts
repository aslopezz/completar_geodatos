// sma: nombre en la lista de la planilla SMA (src/lib/sma/listas.ts); sin él, la planilla avisa que no calza.
// tipoMonitoreo: el que se propone para sus estaciones en la planilla SMA.
export type Protocolo = { id: string; nombre: string; sigla: string; alias?: readonly string[]; sma?: string; tipoMonitoreo?: string }

// Fuente única de protocolos y siglas. La sigla alimenta la columna "NOMBRE METODOLOGIA".
// sigla '' = sin sigla definida.
const PROTOCOLOS: readonly Protocolo[] = [
  // TA era la sigla anterior: queda como alias para que los nombres viejos (TA1-01) se sigan reconociendo.
  { id: 'transecta', nombre: 'Transecta', sigla: 'TR', alias: ['TA'], sma: 'Transecta', tipoMonitoreo: 'Transecto' },
  { id: 'poa', nombre: 'Punto de observación de aves', sigla: 'POA', alias: ['Punto de aves', 'Puntos de aves'], sma: 'Punto de aves' },
  { id: 'bat', nombre: 'Ecolocalizadores', sigla: 'BAT', alias: ['Detección de ecolocalizaciones'], sma: 'Detección de ecolocalizaciones' },
  { id: 'ct', nombre: 'Cámaras trampa', sigla: 'CT', alias: ['Trampas cámara', 'Trampa cámara'], sma: 'Trampas cámara' },
  { id: 'tsh', nombre: 'Trampas Sherman', sigla: 'TSH', alias: ['Trampas sherman'], sma: 'Trampas Sherman' },
  { id: 'mn', nombre: 'Monitoreo nocturno', sigla: 'MN', alias: ['Muestreo nocturno'] },
  { id: 'mta', nombre: 'Tránsito aéreo', sigla: 'MTA', sma: 'Observación de tránsito aéreo' },
  { id: 'censo', nombre: 'Censo', sigla: 'C', sma: 'Censo' },
  { id: 'punto-conteo', nombre: 'Punto de conteo', sigla: 'PdC', sma: 'Punto de conteo' },
  { id: 'recorrido-pedestre', nombre: 'Recorrido pedestre', sigla: 'RP', sma: 'Recorrido pedestre', tipoMonitoreo: 'Transecto' },
  { id: 'transecta-aves', nombre: 'Transecta para aves', sigla: 'TrA', sma: 'Transecta para aves', tipoMonitoreo: 'Transecto' },
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
