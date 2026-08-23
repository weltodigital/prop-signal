/** Canned PropertyData responses for wrapper tests. */

export type Recorded = { url: string; headers: Record<string, string> }

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Builds a fetch stand-in that replays the given responses in order. */
export function fakeFetch(responses: Array<Response | (() => Response)>) {
  const calls: Recorded[] = []
  let index = 0

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })

    const next = responses[Math.min(index, responses.length - 1)]
    index += 1

    if (!next) throw new Error('fakeFetch ran out of responses')
    // Cloned because a Response body can only be read once, and the last entry
    // is replayed for every attempt after it.
    return typeof next === 'function' ? next() : next.clone()
  }) as unknown as typeof fetch

  return { impl, calls }
}

export function sourcedProperties(count: number) {
  return {
    status: 'success',
    properties: Array.from({ length: count }, (_, i) => ({
      address: `${i + 1} Example Street`,
      price: 200_000 + i * 1_000,
      type_standardised: 'Terraced house',
      image_url: `https://media.example.com/${i}.jpeg`,
      url: `https://www.rightmove.co.uk/properties/${i}`,
    })),
    process_time: '0.42',
  }
}

export function propertyDataError(code: string, message: string) {
  return { status: 'error', code, message, process_time: '0.10' }
}
