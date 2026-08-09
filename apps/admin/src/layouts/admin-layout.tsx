import { Link, Outlet } from 'react-router-dom'

export function AdminLayout() {
  return (
    <div className="flex min-h-svh bg-zinc-100">
      <aside className="flex w-64 shrink-0 flex-col bg-white ring-1 ring-zinc-950/5">
        <div className="flex h-16 items-center border-b border-zinc-950/5 px-4">
          <span className="text-sm font-semibold text-zinc-950">Sabz Admin</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          <Link
            to="/dashboard"
            className="rounded-lg px-2 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950"
          >
            Dashboard
          </Link>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-zinc-950/5 bg-white px-6">
          <span className="text-sm font-medium text-zinc-500">Header placeholder</span>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
