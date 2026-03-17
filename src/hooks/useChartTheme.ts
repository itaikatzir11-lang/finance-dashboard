'use client'

import { useTheme } from '@/contexts/ThemeContext'

export interface ChartTheme {
  grid:          string
  axis:          string
  tooltipBg:     string
  tooltipBorder: string
  tooltipText:   string
  tooltipLabel:  string
  dotStroke:     string
}

const CHART_THEMES: Record<string, ChartTheme> = {
  deep: {
    grid:          '#1e293b',
    axis:          '#64748b',
    tooltipBg:     'rgba(7,8,15,0.96)',
    tooltipBorder: 'rgba(255,255,255,0.08)',
    tooltipText:   '#f1f5f9',
    tooltipLabel:  '#64748b',
    dotStroke:     '#07080F',
  },
  normal: {
    grid:          '#1a2744',
    axis:          '#64748b',
    tooltipBg:     'rgba(14,22,41,0.97)',
    tooltipBorder: 'rgba(255,255,255,0.10)',
    tooltipText:   '#f1f5f9',
    tooltipLabel:  '#64748b',
    dotStroke:     '#0E1629',
  },
  light: {
    grid:          '#e2e8f0',
    axis:          '#94a3b8',
    tooltipBg:     'rgba(255,255,255,0.98)',
    tooltipBorder: 'rgba(0,0,0,0.09)',
    tooltipText:   '#1e293b',
    tooltipLabel:  '#64748b',
    dotStroke:     '#F0F4F8',
  },
}

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme()
  return CHART_THEMES[theme] ?? CHART_THEMES.deep
}
