import { useEffect, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { signOut } from '#/lib/auth'

// Menú de cuenta sobre <details>: abre/cierra y teclado los da el navegador;
// aquí solo se cierra al hacer clic fuera, con Escape o al elegir una opción.
export default function AccountMenu({ email }: { email: string }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const navigate = useNavigate()
  const close = () => ref.current?.removeAttribute('open')

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  async function handleSignOut() {
    close()
    await signOut()
    navigate({ to: '/login', search: { redirect: '/registros' } })
  }

  return (
    <details ref={ref} className="relative">
      <summary className="nav-link cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="hidden max-w-[14rem] truncate align-bottom sm:inline-block">{email}</span>
        <span className="sm:hidden">Cuenta</span> ▾
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 flex min-w-48 flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-lg backdrop-blur-lg">
        <Link to="/cuenta" className="nav-link rounded-lg px-3 py-2" onClick={close}>
          Cambiar contraseña
        </Link>
        <button
          type="button"
          className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2 text-left text-sm font-semibold text-[var(--alert-text)] hover:bg-[var(--alert-bg)]"
          onClick={handleSignOut}
        >
          Cerrar sesión
        </button>
      </div>
    </details>
  )
}
