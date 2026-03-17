'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedCountProps {
  value: number
  duration?: number
  formatter?: (v: number) => string
  className?: string
}

/**
 * Smoothly animates a number from its previous value to the new one.
 * Uses an ease-out cubic curve over `duration` ms.
 */
export function AnimatedCount({
  value,
  duration = 700,
  formatter = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
  className,
}: AnimatedCountProps) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    prevRef.current = to

    const start = performance.now()

    function step(now: number) {
      const elapsed = now - start
      const t = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(from + (to - from) * eased)
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step)
      } else {
        setDisplayed(to)
      }
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return <span className={className}>{formatter(displayed)}</span>
}
