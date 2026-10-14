import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import GeoPreview from '#/components/GeoPreview'
import { importGeoFile, type ImportResult } from '#/lib/geo-import'

export const Route = createFileRoute('/')({ component: ImportPage })

function ImportPage() {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      setResult(await importGeoFile(file))
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="demo-page">
      <p className="island-kicker mb-2">Importar</p>
      <h1 className="demo-title mb-2">Puntos y tracks</h1>
      <p className="demo-muted mt-2 mb-6 max-w-2xl text-sm">
        Carga un archivo KML, KMZ o GPX para ver su contenido. Todo se procesa
        en el navegador; no se guarda ni se envía nada.
      </p>

      <div className="demo-panel mb-6">
        <input
          type="file"
          accept=".kml,.kmz,.gpx"
          className="demo-input"
          onChange={(e) => {
            handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {loading && <p className="demo-muted mt-3 mb-0 text-sm">Leyendo…</p>}
        {error && <p className="demo-alert demo-alert-danger mt-3 mb-0 text-sm">{error}</p>}
      </div>

      {result && (
        <>
          <h2 className="demo-section-title mb-3">{result.fileName}</h2>
          <GeoPreview data={result} />
        </>
      )}
    </main>
  )
}
