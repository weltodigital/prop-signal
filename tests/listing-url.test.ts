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

  it('sends a Zoopla listing to Zoopla', () => {
    // Confirmed against the supplier's own /forward redirect, not guessed. An
    // earlier version left this alone because a plain request came back 403,
    // which was Cloudflare refusing curl rather than a broken URL.
    expect(directListingUrl('https://propertydata.co.uk/outbound/zoopla/72676674')).toBe(
      'https://www.zoopla.co.uk/for-sale/details/72676674/',
    )
  })

  it('sends an OnTheMarket listing to OnTheMarket', () => {
    // The supplier abbreviates the portal to otm; the site does not.
    expect(directListingUrl('https://propertydata.co.uk/outbound/otm/16140942')).toBe(
      'https://www.onthemarket.com/details/16140942/',
    )
  })

  it('leaves a portal we have never seen alone', () => {
    const unknown = 'https://propertydata.co.uk/outbound/someportal/12345'
    expect(directListingUrl(unknown)).toBe(unknown)
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

  it('names each portal it knows', () => {
    expect(listingPortal('https://propertydata.co.uk/outbound/zoopla/1')).toBe('Zoopla')
    expect(listingPortal('https://propertydata.co.uk/outbound/otm/1')).toBe('OnTheMarket')
  })

  it('is null where we do not', () => {
    expect(listingPortal('https://propertydata.co.uk/outbound/someportal/1')).toBeNull()
    expect(listingPortal(null)).toBeNull()
  })
})
