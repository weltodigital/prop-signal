import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Exactly one module may spend money.
 *
 * This walks the source tree and fails if PropertyData is reachable from
 * anywhere except `src/lib/propertydata`. It is a blunt instrument on purpose —
 * the rule is easy to break by accident and expensive to break in production.
 */

// Both trees are scanned. A script can spend money just as easily as a page.
const ROOTS = [join(process.cwd(), 'src'), join(process.cwd(), 'scripts')]
const WRAPPER = join('src', 'lib', 'propertydata')

const FORBIDDEN = [
  'api.propertydata.co.uk',
  'PROPERTYDATA_API_KEY',
  'propertyDataEnv',
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

describe('the credit wrapper is the only thing that can spend', () => {
  const files = ROOTS.flatMap(sourceFiles)

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(FORBIDDEN)('keeps %s out of the rest of the codebase', (needle) => {
    const offenders = files
      .map((file) => relative(process.cwd(), file))
      .filter((file) => !file.startsWith(WRAPPER + sep))
      .filter((file) => {
        // env.ts defines the configuration the wrapper reads. Defining it is
        // allowed; reaching for it from a page is not.
        if (file === join('src', 'lib', 'env.ts')) return false
        return readFileSync(join(process.cwd(), file), 'utf8').includes(needle)
      })

    expect(offenders, `${needle} must only appear inside ${WRAPPER}`).toEqual([])
  })

  it('routes every caller through the wrapper index rather than its internals', () => {
    const offenders = files
      .map((file) => relative(process.cwd(), file))
      .filter((file) => !file.startsWith(WRAPPER + sep))
      .filter((file) => {
        const source = readFileSync(join(process.cwd(), file), 'utf8')
        return (
          /from ['"]@\/lib\/propertydata\/(?!index)/.test(source) ||
          /from ['"][^'"]*lib\/propertydata\/(?!index)/.test(source)
        )
      })

    expect(offenders).toEqual([])
  })
})
