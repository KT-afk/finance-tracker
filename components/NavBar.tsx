'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/transactions', label: 'Transactions', icon: ListIcon },
  { href: '/accounts', label: 'Accounts', icon: AccountsIcon },
  { href: '/insights', label: 'Insights', icon: TrendingIcon },
  { href: '/ask', label: 'Ask', icon: AskIcon },
]

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function TrendingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function AskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function AccountsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  )
}

export default function NavBar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col bg-zinc-950 border-r border-zinc-800 z-40">
        <div className="px-5 py-5 border-b border-zinc-800">
          <p className="text-sm font-semibold text-white tracking-tight">Finance Tracker</p>
          <p className="text-xs text-zinc-500 mt-0.5">SG</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                }`}
              >
                <span className={isActive ? 'text-blue-400' : 'text-zinc-500'}>
                  <Icon />
                </span>
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800 flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors ${
                isActive ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
