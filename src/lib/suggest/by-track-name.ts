import type { EstacionSuggester } from '#/lib/suggest/types'

// TA o TR como prefijo o palabra: "TA1", "TR-2", "TA 3", "Track TA1". No coincide con "Trayecto" ni "Taller".
const TRACK_STATION_PATTERN = /(^|[^A-Za-z])(TA|TR)(?=\d|[^A-Za-z]|$)/i

// Un track cuyo nombre trae TA o TR define una estación (protocolo Transecta), sin puntos asignados.
export const byTrackName: EstacionSuggester = {
  hint: 'tracks con TA o TR en el nombre',
  suggest(data) {
    return data.tracks.flatMap((track, trackIndex) => {
      const nombre = track.name.trim()
      return TRACK_STATION_PATTERN.test(nombre) ? [{ nombre, protocolo: 'Transecta', points: [], trackIndex }] : []
    })
  },
}
