'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'deep' | 'normal' | 'light'

export interface ThemeDef {
  id: Theme
  name: string
  tagline: string
  bg: string
  surface: string
  glow1: string
  glow2: string
  isDark: boolean
}

export const THEMES: ThemeDef[] = [
  {
    id: 'deep',
    name: 'Deep',
    tagline: 'Near-black with indigo glow. Bloomberg terminal energy.',
    bg: '#07080F',
    surface: 'rgba(255,255,255,0.035)',
    glow1: 'rgba(99,102,241,0.22)',
    glow2: 'rgba(139,92,246,0.14)',
    isDark: true,
  },
  {
    id: 'normal',
    name: 'Finance',
    tagline: 'Dark navy with crisp contrast. Built for serious trading.',
    bg: '#0E1629',
    surface: 'rgba(255,255,255,0.06)',
    glow1: 'rgba(59,130,246,0.20)',
    glow2: 'rgba(99,102,241,0.13)',
    isDark: true,
  },
  {
    id: 'light',
    name: 'Light',
    tagline: 'Clean and bright. Maximum readability, minimal eye strain.',
    bg: '#F0F4F8',
    surface: 'rgba(255,255,255,0.92)',
    glow1: 'rgba(99,102,241,0.10)',
    glow2: 'rgba(59,130,246,0.07)',
    isDark: false,
  },
]

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'deep', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('deep')

  // On first mount: read saved preference and apply immediately
  useEffect(() => {
    const saved = localStorage.getItem('findash-theme') as Theme | null
    if (saved && THEMES.some((t) => t.id === saved)) {
      setThemeState(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  // Keep <html data-theme="..."> in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('findash-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
