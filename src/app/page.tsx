import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'
import { DealPreview, ScorePreview, TimelinePreview } from '@/components/marketing/preview'

export const metadata: Metadata = {
  title: 'Prop Signal — find the sellers who are ready to take less',
  description:
    'Five properties in your area every Monday, chosen because something moved. A price cut, a fall-through, a year unsold. You get the leverage and the numbers, without the scrolling. £29 a month.',
}

const CLAIMS = [
  {
    title: 'Know what to offer',
    body: 'Every property arrives with what it was asking, what it is asking now, and how long it has been stuck. A seller who has cut twice and sat unsold for a year has told you where they are. That is what an offer is built on.',
  },
  {
    title: 'Get your Sunday back',
    body: 'No saved searches to triage, no alerts about properties you have already dismissed. We watch the whole area every week and only put something in front of you when it has actually changed.',
  },
  {
    title: 'Rule it out in thirty seconds',
    body: 'Rent, gross yield, the gap to the estimated value and local demand are worked out before you open it. A deal that does not stack is obvious without a spreadsheet or a phone call.',
  },
] as const

const STEPS = [
  {
    step: '01',
    title: 'Tell us where you buy',
    body: 'A postcode, how far you will travel, and the strategies you buy on. It takes about a minute and you never have to set up a search again.',
  },
  {
    step: '02',
    title: 'Your first list arrives full',
    body: 'The opening list draws on every property standing in your area, not only this week, so there is something to act on from the first Monday.',
  },
  {
    step: '03',
    title: 'After that, only what changed',
    body: 'Each Monday you get the properties where a seller has moved since you last looked. Nothing you have already seen and dismissed comes back.',
  },
  {
    step: '04',
    title: 'Make the call',
    body: 'Check the history, put your own purchase price and rent through the calculator, and ring the agent knowing more than they expect.',
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
  const primaryHref = signedIn ? '/dashboard' : '/signup'
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
                Find the sellers who are ready to take less.
              </h1>

              <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
                Five properties in your area every Monday, chosen because something moved. A price cut, a fall-through,
                a year on the market with no buyer. You get the leverage and the numbers. You skip the scrolling.
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
                £29 a month for your area. Cancel any time. No free tier, and no card details taken for a trial that
                does not exist.
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
            The best deal in your area was probably listed months ago.
          </h2>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            It has been sitting there, quietly coming down, while every alert you subscribe to shouts about what went
            up this morning. Motivated sellers are made, not born, and they are made slowly.
          </p>

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
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">Leverage</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  Walk in knowing exactly how much room there is.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  An agent will tell you there is interest. The history tells you the price has come down twice, the
                  sale already fell through once, and nobody has bought it in seven hundred days. You make your offer
                  against that rather than against the asking price.
                </p>
                <p className="mt-4 text-muted">
                  You get the whole record, dated. Small trims and properties going under offer are noted and left
                  alone, because neither one means a seller is ready to move.
                </p>
              </div>
              <TimelinePreview />
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="lg:order-2">
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">Fewer wasted Saturdays</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  Decide before you spend a day on a viewing.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  The yield, the gap to the estimated value and the local demand are worked out and shown with the
                  figures behind them. You can see why something scored what it did and disagree with it, which is
                  more use than a number you have to take on trust.
                </p>
                <p className="mt-4 text-muted">
                  Where we hold nothing, it says so and scores nothing. No assumed averages, and no language model
                  anywhere near this.
                </p>
              </div>
              <div className="lg:order-1">
                <ScorePreview />
              </div>
            </div>

            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium tracking-wide text-highlight-deep uppercase">Worth opening</p>
                <h2 className="display mt-4 text-3xl font-semibold sm:text-4xl">
                  A list you can act on without checking it first.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  A quiet week gets a shorter list and one sentence explaining why. You are never handed five when
                  three qualified, so you never have to work out which two are filler.
                </p>
                <p className="mt-4 text-muted">
                  Nothing you have already seen and passed on comes back unless the seller has moved again. The list
                  stays worth the two minutes it takes to read.
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
                <h2 className="display text-3xl font-semibold sm:text-4xl">
                  Less than an hour of your time, every month.
                </h2>
                <p className="mt-5 text-lg text-muted">
                  Most investors lose a weekend a month to portals and still miss the property that quietly dropped
                  twelve per cent in March. This replaces that hour, and costs about what you would spend on lunch
                  while doing it.
                </p>
                <p className="mt-4 text-muted">
                  Every subscriber costs us real data credits every week, opened or not, which is why there is no free
                  plan and no trial. The newsletter is the free tier.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-paper p-8">
                <p className="flex items-baseline gap-2">
                  <span className="nums text-5xl font-semibold tracking-tight">£29</span>
                  <span className="text-muted">a month</span>
                </p>

                <ul className="mt-6 space-y-3 text-muted">
                  {[
                    'Your area, up to forty miles from your postcode',
                    'Five sellers worth a phone call, every Monday',
                    'The full price history, so you know what to offer',
                    'Yield and value gap worked out before you open it',
                    'A calculator that runs your own numbers, not ours',
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
              Next Monday, five sellers worth a phone call.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
              £29 a month for your area. Cancel any time.
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
