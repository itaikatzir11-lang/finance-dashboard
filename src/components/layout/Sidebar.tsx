'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  TrendingUp,
  BarChart3,
  Shield,
  LogOut,
  FlaskConical,
  Menu,
  X,
  BrainCircuit,
  Settings,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/',              label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/accounts',     label: 'Accounts',      icon: Building2 },
  { href: '/holdings',     label: 'Holdings',      icon: TrendingUp },
  { href: '/analytics',    label: 'Analytics',     icon: BarChart3 },
  { href: '/advisor',      label: 'AI Advisor',    icon: BrainCircuit },
  { href: '/research',     label: 'Research',      icon: FlaskConical },
  { href: '/settings',     label: 'Settings',      icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => {})
    router.push('/login')
  }

  function handleNavClick() {
    setMobileOpen(false)
  }

  const sidebarContent = (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen w-[220px] flex flex-col',
        'backdrop-blur-2xl border-r border-white/[0.05]',
        mobileOpen ? 'flex' : 'hidden lg:flex'
      )}
      style={{ backgroundColor: 'var(--sidebar-bg)' }}
    >
      {/* Ambient glow blob — top-left indigo */}
      <div
        className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-indigo-500/[0.07] blur-3xl"
        aria-hidden="true"
      />
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/20 flex-shrink-0">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-[15px] font-semibold text-white tracking-tight">FinDash</span>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className="h-2.5 w-2.5 text-emerald-500" />
              <span className="text-[9px] text-emerald-500/80 font-medium uppercase tracking-wider">Private</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-slate-600 hover:text-slate-300 transition-colors p-1"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={cn(
                'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-indigo-500/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25),0_2px_12px_rgba(99,102,241,0.08)]'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]',
                isActive && 'before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-[60%] before:w-[3px] before:rounded-r-full before:bg-indigo-500 before:shadow-[0_0_8px_rgba(99,102,241,0.6)]'
              )}
            >
              <Icon
                className={cn(
                  'flex-shrink-0 transition-colors duration-150',
                  isActive ? 'text-indigo-400' : 'text-slate-600'
                )}
                size={16}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-white/[0.05]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
            IK
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-slate-400 truncate">Personal Portfolio</p>
            <p className="text-[10px] text-slate-600 truncate">private.mode</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-slate-700 hover:text-rose-400 transition-colors flex-shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-2xl border-b border-white/[0.05] flex items-center justify-between px-4" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-slate-500 hover:text-slate-200 transition-colors p-1"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600">
            <TrendingUp className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-white tracking-tight">FinDash</span>
        </div>
        <div className="w-7" />
      </div>

      {/* ── Mobile backdrop ────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {sidebarContent}
    </>
  )
}
