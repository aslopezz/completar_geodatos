import type { LngLat } from '#/lib/geo-import'

export function formatCoordinate([lng, lat]: LngLat): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function formatTimestampPart(timestamp: string, part: 'date' | 'time'): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat('es-CL', {
    ...(part === 'date' ? { dateStyle: 'short' as const } : { timeStyle: 'short' as const }),
  }).format(date)
}
