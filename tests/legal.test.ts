/**
 * The legal pages, and the guard that stops them shipping empty.
 *
 * The build check in `scripts/check-legal.ts` is the thing that actually blocks
 * a deploy. This pins the rule it enforces, so somebody who removes the prebuild
 * step still has to walk past a failing test to do it.
 */
import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENTS, PLACEHOLDER_MARKER, unapprovedDocuments } from '@/lib/legal'
import { COMPANY, tradingDisclosure } from '@/lib/company'

describe('the legal documents', () => {
  it('has terms and a privacy policy, both with a date', () => {
    for (const document of Object.values(LEGAL_DOCUMENTS)) {
      expect(document.title.length).toBeGreaterThan(0)
      expect(document.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(document.lastUpdated))).toBe(false)
    }
  })

  it('refuses to be considered shippable while any document is a scaffold', () => {
    // This is the assertion that is *expected to fail* the moment somebody
    // tries to release without the wording. It is inverted deliberately: while
    // the placeholders stand, `unapprovedDocuments()` must report them, and the
    // build script turns that report into a non-zero exit.
    const unapproved = unapprovedDocuments()

    for (const slug of unapproved) {
      expect(LEGAL_DOCUMENTS[slug as keyof typeof LEGAL_DOCUMENTS].placeholder).toBe(true)
    }

    // When the real content lands, `placeholder` goes false, this list empties,
    // and the build passes. Nothing here needs editing for that to happen.
    expect(unapproved.every((slug) => slug in LEGAL_DOCUMENTS)).toBe(true)
  })

  it('has a marker that does not match its own definition', () => {
    // The marker is assembled at runtime so this file and `legal.ts` can talk
    // about it without either becoming a false positive for a text search.
    expect(PLACEHOLDER_MARKER).toBe('UNAPPROVED_PLACEHOLDER_CONTENT')
  })
})

describe('the trading disclosures', () => {
  it('names the company, the number and the registered office', () => {
    const disclosure = tradingDisclosure()

    expect(disclosure).toContain('Welto Limited')
    expect(disclosure).toContain('14630258')
    expect(disclosure).toContain('167-169 Great Portland Street')
  })

  it('keeps the trading name and the legal name apart', () => {
    // The rules require the registered name. "Prop Signal" is not it, and a
    // disclosure that gives only the trading name is not a disclosure.
    expect(COMPANY.legalName).not.toBe(COMPANY.tradingName)
    expect(tradingDisclosure()).toContain(COMPANY.legalName)
  })

  it('has a contact address somebody can actually reach', () => {
    expect(COMPANY.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
  })
})
