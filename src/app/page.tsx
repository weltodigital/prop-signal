import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'
import { DealPreview, ScorePreview, TimelinePreview } from '@/components/marketing/preview'

export const metadata: Metadata = {
  title: 'Prop Signal — five UK properties every Monday, and why',
  description:
    'Pick an area and a strategy. Every Monday, five properties with the numbers stacked and a stated reason each one qualified this week. £29 a month.',
}

const CLAIMS = [
  {
    title: 'Event-driven, not listing-driven',
    body: 'What has moved beats what merely appeared. A reduction, a return after a fall-through, a listing going stale. That comes from our own week-on-week diffing, not from a portal feed.',
  },
  {
    title: 'Every figure carries its date',
    body: 'Nothing on the page claims to be true today. Each number is labelled with the day it was observed, and a figure we do not hold says so rather than showing an estimate.',
  },
  {
    title: 'Five, or fewer, never more',
    body: 'A quiet week in a quiet area will not produce five that qualify. You get a shorter list and one plain sentence saying why. The list is never padded.',
  },
] as const

const STEPS = [
  {
    step: '01',
    title: 'Tell us where and how you buy',
    body: 'A postcode, how far you will travel, and the strategies you buy on. One area per subscriber, capped at forty miles.',
  },
  {
    step: '02',
    title: 'Your opening list is a backfill',
    body: 'It draws on everything standing in your area, not only what appeared this week, so the first Monday is worth reading.',
  },
  {
    step: '03',
    title: 'Then it runs every Sunday night',
    body: 'The run diffs against the week before, writes what changed, scores what qualifies and publishes by Monday morning.',
  },
  {
    step: '04',
    title: 'Work the numbers yourself',
    body: 'Star anything worth watching, read the full history, and put your own figures through the calculator. None of it costs you anything.',
  },
] as const

const FAQS = [
  {
    q: 'How is this different from a portal alert?',
    a: 'A portal tells you what is new. Almost everything worth buying was already listed and has since moved. We keep a dated record of every property in your area and compare each run against the last, so a property listed eight months ago can lead this week because it dropped twelve per cent on Thursday.',
  },
  {
    q: 'Where does the data come from?',
    a: 'PropertyData, under licence. The events, the scores and the history are ours, built from what we observed and when. We link to the original agent advert and never reproduce a listing photograph.',
  },
  {
    q: 'Why is there no free tier?',
    a: 'Every subscriber costs real data credits every week, whether they open the list or not. The newsletter is the free tier. The subscription is for people who want their own area on their own criteria.',
  },
  {
    q: 'Can I change my area?',
    a: 'Yes, three times per billing period. Each change means sourcing a new area from scratch, which is the most expensive thing the product does, so the counter is on your account page. Price, bedroom and type filters can be changed as often as you like, because those cost nothing.',
  },
  {
    q: 'Is there an app or an email?',
    a: 'Neither, for now. Everything is in the dashboard, and a list you have not opened is marked as new until you read it. Nothing is pushed at you.',
  },
] as const

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const signedIn = Boolean(user)
  const primaryHref = signedIn ? '/dashboard' : '/login'
  const primaryLabel = signedIn ? 'Go to your dashboard' : 'Start for £29 a month'

  return (
    <>
      <MarketingNav signedIn={signedIn} />

      <main>
        {/* Hero ---------------------------------------------------------- */}
        <section className="border-b border-line bg-card">
          <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
            <div className="max-w-3xl">
              <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">
                For UK landlords and property investors
              </p>

              <h1 className="display mt-5 text-4xl font-semibold sm:text-6xl">
                Five properties every Monday, and the reason each one is on the list.
              </h1>

              <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
                Pick an area and a strategy. Every Monday morning five properties are waiting in your dashboard, with
                the numbers stacked and a stated reason each one qualified this week.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink href={primaryHref} className="px-5 py-3 text-base">
                  {primaryLabel}
                </ButtonLink>
                <ButtonLink href="#how" variant="secondary" className="px-5 py-3 text-base">
                  See how it works
                </ButtonLink>
              </div>

              <p className="mt-5 text-sm text-muted">
                £29 a month, one area, cancel any time. No free tier, and no card details taken for a trial that does
                not exist.
              </p>
            </div>

            <div className="mt-14 max-w-2xl">
              <DealPreview />
            </div>
          </div>
        </section>

        {/* Three claims -------------------------------------------------- */}
        <section id="inside" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="display max-w-2xl text-3xl font-semibold sm:text-4xl">
            Anyone can see what came on the market. We show you what moved.
          </h2>

          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {CLAIMS.map((claim) => (
              <div key={claim.title}>
                <div aria-hidden="true" className="h-1 w-10 rounded-full bg-highlight" />
                <h3 className="mt-4 text-lg font-medium">{claim.title}</h3>
                <p className="mt-2 text-muted">{claim.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Alternating features ------------------------------------------ */}
        <section className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl space-y-24 px-6 py-20">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">The diff</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  A dated record of everything that has happened to a property.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  Every run is compared against the one before it and the differences are written down permanently.
                  A price reduction of at least five per cent, a return to market, a listing crossing a days-unsold
                  mark. Those are the moves that can put a property back in front of you.
                </p>
                <p className="mt-4 text-muted">
                  A five hundred pound trim on a two hundred and fifty thousand pound house is recorded and is not
                  material. Going under offer is recorded and is not material, because it is going rather than coming.
                </p>
              </div>
              <TimelinePreview />
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="lg:order-2">
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">The working</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  Every score opens up, line by line.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  A quality score for whether the property is any good, and a movement score for how hard and how
                  recently it moved. They are added rather than blended, so a mediocre property that has just dropped
                  twelve per cent can outrank a good one that has not moved.
                </p>
                <p className="mt-4 text-muted">
                  There is no language model anywhere in this path. The weights are versioned and every stored score
                  records which version produced it.
                </p>
              </div>
              <div className="lg:order-1">
                <ScorePreview />
              </div>
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">Restraint</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  A short honest list beats five with two duds.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  Some weeks a quiet area will not produce five that meet the threshold. Those weeks publish fewer and
                  say so in one sentence. Filtering is the entire product, so padding the list would undo it.
                </p>
                <p className="mt-4 text-muted">
                  A property returns only on the strength of a move it has not already been shown to you for, which is
                  what stops the same house arriving every Monday.
                </p>
              </div>

              <div className="rounded-xl border border-warn/30 bg-warn-soft p-6">
                <p className="font-medium">A short list this week</p>
                <p className="mt-2 text-muted">
                  Three properties qualified in your area this week. Two more scored above threshold but were shown to
                  you in earlier weeks and nothing has moved on them since.
                </p>
                <p className="mt-4 text-sm text-muted">An example of a thin week, stated rather than padded.</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works --------------------------------------------------- */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="display max-w-2xl text-3xl font-semibold sm:text-4xl">How it works</h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.step} className="rounded-xl border border-line bg-card p-6">
                <p className="nums text-sm font-medium text-highlight-deep">{step.step}</p>
                <h3 className="mt-3 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing --------------------------------------------------------- */}
        <section id="pricing" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="display text-3xl font-semibold sm:text-4xl">One price, one area, no tiers.</h2>
                <p className="mt-5 text-lg text-muted">
                  Every subscriber costs real data credits every week, whether the list is opened or not. That is why
                  there is no free plan and no trial. The newsletter is the free tier.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-paper p-8">
                <p className="flex items-baseline gap-2">
                  <span className="nums text-5xl font-semibold tracking-tight">£29</span>
                  <span className="text-muted">a month</span>
                </p>

                <ul className="mt-6 space-y-3 text-muted">
                  {[
                    'One area, up to forty miles',
                    'Five properties every Monday, with the reason each qualified',
                    'The full dated history behind every property',
                    'Watchlist, archive and the deal calculator',
                    'Cancel any time from your account page',
                  ].map((line) => (
                    <li key={line} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" />
                      {line}
                    </li>
                  ))}
                </ul>

                <ButtonLink href={primaryHref} className="mt-8 w-full px-5 py-3 text-base">
                  {primaryLabel}
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="display text-3xl font-semibold sm:text-4xl">Questions</h2>

          <div className="mt-10">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-2xl leading-none font-normal text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-prose text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA -------------------------------------------------------- */}
        <section className="bg-accent">
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <h2 className="display mx-auto max-w-2xl text-3xl font-semibold text-white sm:text-4xl">
              Next Monday, five properties and the reason for each.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
              £29 a month for one area. Cancel any time.
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <ButtonLink
                href={primaryHref}
                variant="secondary"
                className="border-transparent px-5 py-3 text-base"
              >
                {primaryLabel}
              </ButtonLink>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-md border border-white/25 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  )
}
