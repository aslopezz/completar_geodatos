import { useState } from 'react'
import { changePassword, MIN_PASSWORD_LENGTH } from '#/lib/auth'

export function ChangePasswordForm({ title = 'Cambiar contraseña', onDone }: { title?: string; onDone?: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setMessage({ text: 'Las contraseñas no coinciden.', isError: true })
    setLoading(true)
    const error = await changePassword(password)
    setLoading(false)
    if (error) return setMessage({ text: error, isError: true })
    setPassword('')
    setConfirm('')
    setMessage({ text: 'Contraseña actualizada.', isError: false })
    onDone?.()
  }

  return (
    <form onSubmit={handleSubmit} className="demo-panel mt-6 flex w-full max-w-sm flex-col gap-3">
      <h2 className="demo-section-title">{title}</h2>
      <input
        type="password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        placeholder="Nueva contraseña"
        className="demo-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        required
        autoComplete="new-password"
        placeholder="Repetir contraseña"
        className="demo-input"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {message && (
        <p className={`m-0 text-sm ${message.isError ? 'text-[var(--alert-text)]' : 'demo-muted'}`}>{message.text}</p>
      )}
      <button type="submit" className="demo-button" disabled={loading}>
        {loading ? 'Guardando…' : title}
      </button>
    </form>
  )
}
