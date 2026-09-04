/**
 * Fails the build while a legal page is still a scaffold.
 *
 * Runs as `prebuild`, so `next build` cannot complete and the deploy cannot
 * happen. That is the point: a terms page reading "sample text" in production is
 * worse than no terms page, because it looks like the question was answered.
 *
 * This is deliberately not clever. It reads the flag the documents set about
 * themselves rather than grepping for a phrase, so it cannot be defeated by
 * rewording the placeholder, and it names what to do next rather than only
 * saying no.
 */
import { LEGAL_DOCUMENTS, PLACEHOLDER_MARKER, unapprovedDocuments } from '../src/lib/legal'

const unapproved = unapprovedDocuments()

if (unapproved.length > 0) {
  const lines = unapproved.map((slug) => {
    const document = LEGAL_DOCUMENTS[slug as keyof typeof LEGAL_DOCUMENTS]
    return `  /${slug}  — ${document.title}`
  })

  console.error(
    [
      '',
      `Build stopped: ${unapproved.length} legal ${unapproved.length === 1 ? 'page is' : 'pages are'} still ${PLACEHOLDER_MARKER}.`,
      '',
      ...lines,
      '',
      'These routes exist, are linked from the footer and from checkout, and render',
      'a written but unapproved draft. Read it, get it reviewed, then release it.',
      '',
      'To release: resolve every CONFIRM_ marker in src/lib/legal.ts, set `lastUpdated`',
      'to the date it was approved, and set `placeholder: false` on that document.',
      '',
    ].join('\n'),
  )

  process.exit(1)
}

console.log(`Legal pages approved: ${Object.keys(LEGAL_DOCUMENTS).join(', ')}.`)
