import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import { especieLabel, type RegistroPunto } from '#/lib/registros'

// Chile continental (sin Isla de Pascua ni Antártica), para el encuadre inicial.
const CHILE_BOUNDS: [[number, number], [number, number]] = [
  [-56, -76],
  [-17, -66],
]

function popupContent(r: RegistroPunto): HTMLElement {
  // DOM en vez de HTML en string: los textos vienen de datos ingresados por usuarios.
  const root = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = especieLabel(r)
  root.appendChild(title)
  const lines = [
    r.nombre_comun_terreno,
    r.nombre_proyecto,
    r.nombre_comuna,
    r.fecha,
    r.cantidad != null ? `Cantidad: ${r.cantidad}` : null,
    `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`,
  ]
  for (const line of lines) {
    if (!line) continue
    root.appendChild(document.createElement('br'))
    root.appendChild(document.createTextNode(line))
  }
  return root
}

export function RegistrosMap({ registros }: { registros: RegistroPunto[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let cleanup = () => {}

    // Leaflet usa window al importarse: se carga solo en el navegador.
    import('leaflet').then((L) => {
      if (cancelled) return
      const map = L.map(container, { preferCanvas: true }).fitBounds(CHILE_BOUNDS)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const color = getComputedStyle(document.documentElement).getPropertyValue('--lagoon-deep').trim()
      const group = L.featureGroup(
        registros.map((r) =>
          L.circleMarker([r.lat, r.lon], { radius: 5, color, weight: 1, fillColor: color, fillOpacity: 0.6 }).bindPopup(
            () => popupContent(r),
          ),
        ),
      ).addTo(map)

      if (registros.length) map.fitBounds(group.getBounds(), { padding: [32, 32], maxZoom: 12 })
      cleanup = () => map.remove()
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [registros])

  // isolate: los z-index internos de Leaflet (400–1000) quedan dentro del mapa y no tapan el header fijo.
  return <div ref={containerRef} className="isolate h-[70vh] w-full overflow-hidden rounded-xl border border-[var(--line)]" />
}
