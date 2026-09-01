'use client'

import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Movement, kept to one idea.
 *
 * Things arrive: a short rise as a block comes into view, once, and never
 * again. Nothing loops, nothing parallaxes, nothing moves while it is being
 * read — a page about numbers should not be busier than the numbers.
 *
 * The rise is a transform and never a fade, which is the important part. An
 * entrance that animates opacity has to render the block invisible first, so a
 * reader whose JavaScript is slow, blocked or broken gets a blank page rather
 * than a page without animation. Offset by eighteen pixels, the worst case is a
 * page that sits a few pixels low and nobody notices.
 *
 * Anybody who has asked their system for less motion gets none of it: the
 * content renders in place with no animation attached at all, rather than a
 * fast version of the same movement.
 */

const EASE = [0.16, 1, 0.3, 1] as const

export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  /** Seconds. Used to let a row arrive a beat after the heading above it. */
  delay?: number
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ y: 18 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/** The hero, which is on screen before anything can scroll into view. */
export function Arrive({
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
      initial={{ y: 20 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A button that answers the pointer.
 *
 * A press that moves is the cheapest way to make a page feel like software
 * rather than a poster, and it is the one place movement is a response to
 * something the reader did.
 */
export function Press({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div className={className} whileHover={{ y: -1 }} whileTap={{ y: 1 }} transition={{ duration: 0.15 }}>
      {children}
    </motion.div>
  )
}
