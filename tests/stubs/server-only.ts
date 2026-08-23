// `server-only` throws when it is imported outside a React Server Component.
// Vitest runs plain Node, so it is aliased to this no-op. The guard still does
// its job in the Next build, which is where it matters.
export {}
