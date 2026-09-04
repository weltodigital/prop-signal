/**
 * What the customer-facing copy says we are.
 *
 * A deal sourcer introduces a specific property to a specific buyer for a fee.
 * That is estate agency work under the Estate Agents Act 1979 and carries
 * anti-money-laundering supervision with it. Prop Signal publishes analysis of a
 * market and is paid the same whether anybody buys anything, which is a
 * different activity with different obligations — and the thing that decides
 * which one a regulator thinks we are doing is what the website says.
 *
 * So the copy is pinned. This walks every file a customer or a regulator reads
 * and fails if any of them describes the product as sourcing or as a sourcer.
 *
 * What is deliberately allowed:
 *
 *   - Naming a deal sourcer in order to say we are not one. The comparison
 *     table and the FAQ both do, and both are protective.
 *   - `sourcingLists` and its relatives, which are the internal name for which
 *     PropertyData endpoints a search draws on.
 *   - Anything under src/lib/pipeline, which is internal and is not read by
 *     anybody outside the team.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Everything a customer or a regulator can read. */
const CUSTOMER_FACING = [
  join(process.cwd(), 'src', 'app'),
  join(process.cwd(), 'src', 'components'),
]
const ALSO = ['README.md']

/**
 * Self-descriptions, not mentions.
 *
 * Each of these only matches text that claims the product *is* the thing. "How
 * is this different from a deal sourcer" does not match; "a deal sourcing
 * subscription" does.
 */
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /sourced deals/i, why: 'describes the output as sourced' },
  { pattern: /deal[- ]sourcing (subscription|service|site|platform|product|tool)/i, why: 'describes the product as deal sourcing' },
  { pattern: /sourcing (subscription|service|fee)/i, why: 'describes what we sell or charge as sourcing' },
  { pattern: /we (are|do) .{0,20}sourc/i, why: 'first person claim to source' },
  { pattern: /property sourcer/i, why: 'names the product as a sourcer' },
]

/** Lines that name a sourcer in order to disclaim being one. */
const CONTRASTING = /\b(different from|compares with|are you a|a deal sourcer|not a deal sourcer|A sourcer)\b/i

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx|md)$/.test(entry) ? [full] : []
  })
}

describe('the product is described as research, not as an introduction', () => {
  const files = [
    ...CUSTOMER_FACING.flatMap(sourceFiles),
    ...ALSO.map((f) => join(process.cwd(), f)),
  ]

  it('finds the customer-facing files to check', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(FORBIDDEN)('never $why', ({ pattern }) => {
    const offenders: string[] = []

    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')

      lines.forEach((line, index) => {
        if (!pattern.test(line)) return
        if (CONTRASTING.test(line)) return
        offenders.push(`${relative(process.cwd(), file)}:${index + 1}  ${line.trim().slice(0, 120)}`)
      })
    }

    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
  })

  it('says plainly somewhere that this is not advice', () => {
    const footer = readFileSync(join(process.cwd(), 'src', 'components', 'legal-footer.tsx'), 'utf8')

    expect(footer).toMatch(/research and analysis/i)
    expect(footer).toMatch(/does\s*\n?\s*\*?\s*not give financial/i)
  })
})
