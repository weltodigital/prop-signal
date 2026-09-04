/**
 * What a score means, in a word.
 *
 * The arithmetic is not changing. The total is still quality in full plus half
 * of movement, on 0 to 150, and the breakdown still shows every point of it.
 * What changes is what the list leads with.
 *
 * A raw fraction was reading as a percentage and marking the product down for
 * it. A strong new listing — perfect on quality, with no history because
 * nothing has happened to it yet — comes to about 100 of 150, and 100 out of
 * 150 reads as 67%: a C grade, on the best property in somebody's area. The
 * ceiling is only reachable by a property that is both an excellent buy *and*
 * has a seller who has been cutting for a year, which is rare by construction,
 * so most of a good list sits in the sixties and reads as mediocre.
 *
 * The bands are set against what the scale can actually produce rather than
 * against 150. Nothing qualifies below 50 on quality, so 50 is the real floor;
 * 100 is a property with nothing wrong with it and nothing having happened;
 * and everything above that is a good buy whose seller is also moving.
 *
 * The top two boundaries have moved down, because they were set against the
 * scale's arithmetic ceiling rather than against what it produces. Movement
 * counts for half, so it contributes at most 50 of the 150 — and reaching a
 * movement score of 100 needs a property that has been cut by a fifth, has come
 * back from a fall-through, has sat unsold for a year *and* moved this week.
 * Exceptional at 120 therefore asked for a near-flawless property with all four
 * of those true at once, which is not a rare band but an empty one: a five-band
 * scale behaving like four. Strong at 95 had the matching problem one step
 * down, leaving a flawless property with a settled seller — 100, and the best
 * thing this product can find in a quiet week — sitting five points inside the
 * band rather than comfortably within it.
 *
 * So: a perfect property that nothing has happened to is Strong, and
 * Exceptional is that property with a seller who has genuinely moved — quality
 * in the mid-eighties with a movement score around 55. Rare, and reachable.
 *
 * Deliberately not `server-only`: the card renders these.
 */

export type ScoreBand = {
  /** The word shown in place of the fraction. */
  label: string
  /** Where this sits in the run of bands, 1 lowest. Drives the meter. */
  rank: number
  /** One line, on hover, saying what the band is for. */
  note: string
}

/**
 * Five bands, lowest first.
 *
 * `from` is inclusive and read from the top down, so the order here is the
 * order of the thresholds and nothing can fall between two of them.
 */
export const SCORE_BANDS: Array<ScoreBand & { from: number }> = [
  {
    from: 0,
    rank: 1,
    label: 'Modest',
    note: 'Clears the bar and not much more.',
  },
  {
    from: 60,
    rank: 2,
    label: 'Fair',
    note: 'A workable buy with something against it.',
  },
  {
    from: 75,
    rank: 3,
    label: 'Good',
    note: 'Stacks comfortably against your strategy.',
  },
  {
    from: 90,
    rank: 4,
    label: 'Strong',
    note: 'Among the best in your area on the numbers.',
  },
  {
    from: 112,
    rank: 5,
    label: 'Exceptional',
    note: 'A good buy whose seller is moving as well.',
  },
]

export const BAND_COUNT = SCORE_BANDS.length

/** The band a total falls in. Never null: every score is in one of them. */
export function scoreBand(total: number): ScoreBand {
  let found = SCORE_BANDS[0]!
  for (const band of SCORE_BANDS) {
    if (total >= band.from) found = band
  }
  return found
}
