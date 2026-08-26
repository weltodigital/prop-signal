import { describe, expect, it } from 'vitest'
import { directListingUrl, listingPortal } from '@/lib/listing-url'

describe('directListingUrl', () => {
  it('sends a Rightmove listing to Rightmove', () => {
    expect(directListingUrl('https://propertydata.co.uk/outbound/rightmove/165082280')).toBe(
      'https://www.rightmove.co.uk/properties/165082280',
    )
  })

  it('handles the www form and a trailing slash', () => {
    expect(directListingUrl('https://www.propertydata.co.uk/outbound/rightmove/87416295/')).toBe(
      'https://www.rightmove.co.uk/properties/87416295',
    )
  })

  it('leaves a portal we have not confirmed alone', () => {
    // A link with an extra hop beats a link that 404s.
    const zoopla = 'https://propertydata.co.uk/outbound/zoopla/73543942'
    expect(directListingUrl(zoopla)).toBe(zoopla)
  })

  it('passes anything else through untouched', () => {
    expect(directListingUrl('https://www.rightmove.co.uk/properties/1')).toBe(
      'https://www.rightmove.co.uk/properties/1',
    )
    expect(directListingUrl('not a url')).toBe('not a url')
  })

  it('is null for nothing', () => {
    expect(directListingUrl(null)).toBeNull()
    expect(directListingUrl('')).toBeNull()
    expect(directListingUrl(undefined)).toBeNull()
  })

  it('does not follow a lookalike host', () => {
    // The id is real and the shape is right, but the host is not ours to trust.
    const spoof = 'https://propertydata.co.uk.evil.example/outbound/rightmove/165082280'
    expect(directListingUrl(spoof)).toBe(spoof)
  })
})

describe('listingPortal', () => {
  it('names the portal where we know it', () => {
    expect(listingPortal('https://propertydata.co.uk/outbound/rightmove/165082280')).toBe('Rightmove')
  })

  it('is null where we do not', () => {
    expect(listingPortal('https://propertydata.co.uk/outbound/zoopla/1')).toBeNull()
    expect(listingPortal(null)).toBeNull()
  })
})
