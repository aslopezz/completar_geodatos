import { Link } from '@tanstack/react-router'
import { useAuth } from '#/hooks/useAuth'
import AccountMenu from './AccountMenu'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  const { session, isAuthenticated } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
            Ecorestaura
        </h2>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Inicio
          </Link>
          <Link
            to="/registros"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Registros
          </Link>
          <Link
            to="/mapa"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Mapa
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-sm font-semibold sm:gap-2">
          {isAuthenticated && session?.user.email ? (
            <AccountMenu email={session.user.email} />
          ) : (
            <Link to="/login" search={{ redirect: '/registros' }} className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
              Ingresar
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
