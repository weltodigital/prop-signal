'use client'

import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

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

/**
 * The hero band, and the white pool that follows the pointer across it.
 *
 * The wash behind the headline is the one saturated surface on the page, which
 * makes it the one place a response to the pointer is worth having: the reader
 * moves the mouse, the colour thins under it, and the page reads as something
 * running rather than something printed. It lifts the wash and never the ink —
 * the pool sits under the content, so the headline is at full contrast whether
 * the pointer is on it or not, and nothing about the page's meaning is carried
 * by where the mouse happens to be.
 *
 * Renders the `<section>` itself rather than reaching for a parent element,
 * because the listeners have to live on the band and a `pointer-events-none`
 * overlay by definition receives nothing. The children are still server
 * components: they arrive as a slot and are never re-rendered here, which
 * matters because this component re-renders on the pointer.
 *
 * Two ways out of it. Anybody who asked for less motion gets none of it, and
 * so does anybody without a fine pointer — a spotlight on a touchscreen is a
 * smear that appears where you tapped, which is worse than nothing.
 */

const WASH_RADIUS = 340

/**
 * Slow and heavy on purpose. The pool trails the cursor rather than being
 * pinned to it, which is what makes it read as light falling on a surface
 * instead of a cursor with a decoration attached.
 */
const WASH_SPRING = { stiffness: 90, damping: 26, mass: 0.9 } as const

export function HeroWash({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLElement>(null)

  // Resolved after mount, so the server and the first client render agree.
  const [finePointer, setFinePointer] = useState(false)

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const lit = useMotionValue(0)

  const springX = useSpring(x, WASH_SPRING)
  const springY = useSpring(y, WASH_SPRING)
  const opacity = useSpring(lit, { stiffness: 60, damping: 20 })

  useEffect(() => {
    setFinePointer(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])

  const enabled = finePointer && !reduced

  function positionFrom(event: React.PointerEvent<HTMLElement>): { left: number; top: number } | null {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    return { left: event.clientX - rect.left, top: event.clientY - rect.top }
  }

  return (
    <section
      ref={ref}
      className={className}
      onPointerEnter={(event) => {
        if (!enabled) return
        const at = positionFrom(event)
        if (!at) return
        // Placed rather than sprung. Easing in from wherever the pointer was
        // last would drag a stripe of white across the band on every entry.
        springX.jump(at.left)
        springY.jump(at.top)
        x.set(at.left)
        y.set(at.top)
        lit.set(1)
      }}
      onPointerMove={(event) => {
        if (!enabled) return
        const at = positionFrom(event)
        if (!at) return
        x.set(at.left)
        y.set(at.top)
      }}
      onPointerLeave={() => lit.set(0)}
    >
      {enabled ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 rounded-full"
          style={{
            x: springX,
            y: springY,
            opacity,
            width: WASH_RADIUS * 2,
            height: WASH_RADIUS * 2,
            marginLeft: -WASH_RADIUS,
            marginTop: -WASH_RADIUS,
            background:
              'radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.68) 38%, rgba(255,255,255,0) 70%)',
          }}
        />
      ) : null}

      {children}
    </section>
  )
}
