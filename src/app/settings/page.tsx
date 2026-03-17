'use client'

import { Check, Palette, Info, ExternalLink, Zap } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { useTheme, THEMES, type Theme, type ThemeDef } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

// ── Mini theme preview rendered inside each theme card ──────────────────────

function ThemePreview({ t }: { t: ThemeDef }) {
  const textBar    = t.isDark ? 'bg-white/[0.18]'  : 'bg-slate-800/[0.14]'
  const textBarLg  = t.isDark ? 'bg-white/[0.28]'  : 'bg-slate-800/[0.22]'
  const cardBorder = t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const cardShadow = t.isDark
    ? 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 1px 3px rgba(0,0,0,0.4)'
    : '0 1px 4px rgba(0,0,0,0.08)'
  const dotGrid = t.isDark
    ? "url(\"data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.7' fill='rgba(255,255,255,0.06)'/%3E%3C/svg%3E\")"
    : "url(\"data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.7' fill='rgba(0,0,0,0.04)'/%3E%3C/svg%3E\")"

  return (
    <div
      className="relative h-[88px] w-full overflow-hidden rounded-t-xl"
      style={{ backgroundColor: t.bg }}
    >
      {/* Ambient glow orb */}
      <div
        className="absolute -top-6 -left-6 h-28 w-28 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: t.glow1 }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{ backgroundImage: dotGrid }}
      />

      {/* Fake main card */}
      <div
        className="absolute top-3 left-3 right-3 rounded-lg overflow-hidden"
        style={{
          background: `linear-gradient(to bottom, ${t.surface.replace(/[\d.]+\)$/, (m) => String(parseFloat(m) * 1.5) + ')')}, ${t.surface})`,
          boxShadow: cardShadow,
          border: `1px solid ${cardBorder}`,
        }}
      >
        {/* Accent stripe */}
        <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />
        <div className="px-2.5 py-2">
          {/* Fake label */}
          <div className={`h-1 w-10 rounded-full ${textBar} mb-2`} />
          {/* Fake big number */}
          <div className={`h-3.5 w-20 rounded-full ${textBarLg} mb-2`} />
          {/* Fake change pill */}
          <div className="inline-flex items-center gap-1">
            <div className="h-2.5 w-14 rounded-full bg-emerald-500/[0.25]" />
          </div>
          {/* Fake breakdown row */}
          <div className="flex gap-1.5 mt-2.5">
            <div className="h-4 flex-1 rounded bg-emerald-500/[0.12] border border-emerald-500/[0.18]" />
            <div className="h-4 flex-1 rounded bg-blue-500/[0.12] border border-blue-500/[0.18]" />
            <div className="h-4 flex-1 rounded bg-purple-500/[0.12] border border-purple-500/[0.18]" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Theme selector card ──────────────────────────────────────────────────────

function ThemeCard({
  t,
  selected,
  onClick,
}: {
  t: ThemeDef
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col rounded-xl border transition-all duration-200 overflow-hidden text-left w-full',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
        selected
          ? 'border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_4px_24px_rgba(99,102,241,0.12)]'
          : 'border-white/[0.08] hover:border-white/[0.16] hover:-translate-y-0.5'
      )}
    >
      {/* Preview */}
      <ThemePreview t={t} />

      {/* Selected checkmark badge */}
      {selected && (
        <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Info row */}
      <div className="px-3 py-3 border-t border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-100">{t.name}</span>
          {selected && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/[0.1] border border-indigo-500/[0.2] px-1.5 py-[2px] rounded">
              Active
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.tagline}</p>
      </div>
    </button>
  )
}

// ── Section wrapper — GitHub style ──────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="py-8 border-b border-white/[0.06] last:border-b-0">
      {/* Section header */}
      <div className="flex items-start gap-3 mb-6">
        <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-100 tracking-tight">{title}</h2>
          <p className="text-[13px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Info row — used in About section ────────────────────────────────────────

function InfoRow({
  label,
  value,
  href,
}: {
  label: string
  value: string
  href?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-b-0">
      <span className="text-[13px] text-slate-400 font-medium">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[13px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {value}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-[13px] text-slate-300 font-medium tabular-nums">{value}</span>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Settings" />

      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10">
        {/* Page heading */}
        <div className="mb-8 pb-6 border-b border-white/[0.06]">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Settings</h1>
          <p className="text-[14px] text-slate-500 mt-1">
            Manage your dashboard preferences and appearance.
          </p>
        </div>

        {/* Max width container for comfortable reading */}
        <div className="max-w-3xl">

          {/* ── Appearance ───────────────────────────────────────────────── */}
          <Section
            icon={<Palette className="h-4 w-4 text-indigo-400" />}
            title="Appearance"
            description="Choose a color theme that's comfortable for your eyes."
          >
            {/* Theme cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {THEMES.map((t) => (
                <ThemeCard
                  key={t.id}
                  t={t}
                  selected={theme === t.id}
                  onClick={() => setTheme(t.id as Theme)}
                />
              ))}
            </div>

            {/* Current theme callout */}
            <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-indigo-500/[0.06] border border-indigo-500/[0.15]">
              <div className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0" />
              <p className="text-[12px] text-slate-400">
                Currently using{' '}
                <span className="font-semibold text-indigo-400">
                  {THEMES.find((t) => t.id === theme)?.name ?? theme}
                </span>{' '}
                theme. Changes apply instantly and are saved across sessions.
              </p>
            </div>
          </Section>

          {/* ── About ────────────────────────────────────────────────────── */}
          <Section
            icon={<Info className="h-4 w-4 text-slate-400" />}
            title="About"
            description="Application information and version details."
          >
            <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-white/[0.015]">
              <InfoRow label="Application" value="FinDash" />
              <InfoRow label="Version" value="1.0.0-alpha" />
              <InfoRow label="Framework" value="Next.js 14 (App Router)" />
              <InfoRow label="Database" value="PostgreSQL + Prisma 5" />
              <InfoRow label="Charts" value="Recharts" />
            </div>

            {/* Build info / environment badge */}
            <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <Zap className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-[12px] text-slate-500">
                This dashboard runs entirely privately — no data leaves your machine.
                Market prices are fetched from public free-tier APIs only.
              </p>
            </div>
          </Section>

        </div>
      </main>
    </div>
  )
}
