'use client'

import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The app's movement, which is a smaller vocabulary than the front page's.
 *
 * Three things only: a figure counts up when it arrives, a bar fills to what it
 * measures, and a row rises into place. Nothing loops, nothing moves while it is
 * being read, and nothing animates opacity — the server sends the finished
 * numbers, so a slow or broken script leaves a dashboard that works rather than
 * a blank page.
 *
 * Reduced motion is a branch, not a faster animation: the value is printed and
 * the bar is drawn at its final width with nothing attached.
 */

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * A figure that arrives by counting.
 *
 * The server renders the final number, so it is correct before any of this
 * runs. On mount it drops to the floor and climbs back, which is what makes a
 * page of figures feel like it is being worked out rather than pasted in.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 0.9,
}: {
  value: number
  /** How the figure is printed. Described rather than passed as a formatter,
   *  because a server component cannot hand a function to a client one. */
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const started = useRef(false)

  useEffect(() => {
    if (reduced) {
      setShown(value)
      return
    }
    // Only on arrival. A re-render with the same figure should not replay it.
    if (started.current) {
      setShown(value)
      return
    }
    started.current = true

    const controls = animate(value * 0.4, value, {
      duration,
      ease: EASE,
      onUpdate: (latest) => setShown(latest),
    })
    return () => controls.stop()
  }, [value, duration, reduced])

  return (
    <>
      {prefix}
      {shown.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </>
  )
}

/**
 * A bar that fills to what it measures.
 *
 * The width is the number, so the fill is the only honest animation available:
 * it ends where the figure says and never overshoots.
 */
export function Meter({
  share,
  className = '',
  trackClassName = '',
}: {
  /** Between 0 and 1. */
  share: number
  className?: string
  trackClassName?: string
}) {
  const reduced = useReducedMotion()
  const width = `${Math.max(0, Math.min(1, share)) * 100}%`

  return (
    <div className={`overflow-hidden ${trackClassName}`}>
      {reduced ? (
        <div className={className} style={{ width }} />
      ) : (
        <motion.div
          className={className}
          initial={{ width: 0 }}
          animate={{ width }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
        />
      )}
    </div>
  )
}

/** A row that rises into place. Transform only, so nothing is ever hidden. */
export function Rise({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The bar across the top of a page that is still fetching.
 *
 * Indeterminate on purpose. We do not know how long the query will take and a
 * percentage that guesses is a lie, so it says work is happening and nothing
 * else.
 */
export function LoadingBar() {
  const reduced = useReducedMotion()

  return (
    <div className="h-0.5 w-full overflow-hidden bg-line" role="presentation">
      {reduced ? (
        <div className="h-full w-1/3 bg-highlight-deep/40" />
      ) : (
        <motion.div
          className="h-full w-1/3 bg-highlight-deep"
          animate={{ x: ['-100%', '400%'] }}
          transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
    </div>
  )
}
