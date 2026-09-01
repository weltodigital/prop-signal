import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'
import { DealPreview, ScorePreview, TimelinePreview } from '@/components/marketing/preview'

export const metadata: Metadata = {
  title: 'Prop Signal. Sourced deals for how you invest',
  description:
    'Tell us where you buy and how you make your money. We source the best deals in your area against those criteria, score them, and keep them in front of you. BRRR in Portsmouth, HMOs in Leeds, buy to let near home. £29 a month.',
}

const CLAIMS = [
  {
    title: 'Sourced against your criteria',
    body: 'Your area, your radius, your strategy. We look at everything in it every week and keep the ones that stack against the way you actually make money. A property that is a poor buy to let and a strong HMO is scored as both and ranked as whichever it is.',
  },
  {
    title: 'The maths is done',
    body: 'Cashflow, price against nearby sales and local demand are worked out before you open it, under the strategy you actually run. A property that does not stack is obvious without a spreadsheet or a phone call.',
  },
  {
    title: 'It stays until you say otherwise',
    body: 'A good deal does not stop being one because you saw it last week. It stays on your list until you buy it, it sells, or you say it is not for you. When something changes on it, that is flagged rather than being the reason it appears.',
  },
] as const

const STEPS = [
  {
    step: '01',
    title: 'Tell us where you buy',
    body: 'A postcode, how far you will travel, and how you make your money, whether that is buy to let, an HMO or a flip. It takes about a minute, and it is the last search you will ever set up.',
  },
  {
    step: '02',
    title: 'Your list is built from everything',
    body: 'We look at every property standing in your area, not only what appeared this week, and keep the ones that clear the bar against your strategy. There is something to act on from the first Monday.',
  },
  {
    step: '03',
    title: 'It stays and it stays current',
    body: 'Deals stay on your list while they stack. Each Monday the scores are refreshed, anything new that qualifies is added, and anything that has moved since you last looked is flagged.',
  },
  {
    step: '04',
    title: 'Make the call',
    body: 'Check the history, put your own purchase price and rent through the calculator, and ring the agent knowing more than they expect. Track it from interested through to completed as you go.',
  },
] as const

const FAQS = [
  {
    q: 'How is this different from a portal alert?',
    a: 'A portal answers one question, which is what went up this morning. Whether something is a good buy for the way you invest is a different question and nothing on a portal asks it. We score every property in your area against your strategy, keep the ones that stack, and rank them. A property listed eight months ago and one listed this morning are judged the same way.',
  },
  {
    q: 'How is this different from a deal sourcer?',
    a: 'A sourcer finds one property, charges a fee in the thousands, and you buy what they picked. We show you everything in your area that moved this week, with the numbers and the reasoning in the open, and you pick. Nobody here has an interest in you buying any particular property, because we are paid the same £29 whether you buy or not.',
  },
  {
    q: 'So I never have to search for anything?',
    a: 'That is the idea. You set the area and the strategy once and the deals come to you. There is no saved search to maintain and nothing to check between Mondays. Anything you mark as not for you never comes back.',
  },
  {
    q: 'Where does the data come from?',
    a: 'We search the property portals across your area, under licence, and keep our own dated record of what we find. The events, the scores and the history are ours, built from what we observed and when. We link to the original agent advert and never reproduce a listing photograph, so you are always one click from the listing itself and nothing here asks to be taken on trust.',
  },
  {
    q: 'Does a property have to have dropped in price to appear?',
    a: 'No. A property is on your list because it is a good deal against your criteria, and it can be a good deal from the day it is listed. A price cut or a long stint unsold counts for something, because it tells you the seller is motivated, but it is worth half of what the deal itself is worth and it is never a way in. A property that does not stack is not shown however hard the seller has moved.',
  },
  {
    q: 'Does the same property keep appearing?',
    a: 'Yes, while it is still one of the best deals in your area, because hiding it would not make it a worse deal. What changes is the marking: something that has moved since you last looked is flagged as changed. When you are done with it, mark it as not for you and it is gone for good.',
  },
  {
    q: 'Why is there no free tier?',
    a: 'Searching a whole area properly costs us money every week, whether you open the list or not. The newsletter is the free tier. The subscription is for people who want their own area searched on their own criteria.',
  },
  {
    q: 'Can I change my area?',
    a: 'Yes, three times per billing period. Each change means searching a new area from scratch, so the counter is on your account page. Price, bedroom and type filters can be changed as often as you like, because those only narrow what we already have.',
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
    <div className="min-h-screen bg-ground">
      <MarketingNav signedIn={signedIn} />

      <main>
        {/* Hero ---------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl px-6 pt-14 pb-16 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="label text-muted">For UK landlords and property investors</p>

              <h1 className="font-display mt-5 text-h1 font-normal md:text-h1-lg">
                Stop hunting for deals. We put them in front of you.
              </h1>

              <p className="mt-6 max-w-xl text-body text-muted">
                Tell us where you buy and how you make your money. BRRR in Portsmouth, HMOs in Leeds, buy to let
                within ten miles of home. We source the whole area against those criteria and keep the best of it in
                front of you, with the numbers already worked out.
              </p>

              <p className="mt-4 max-w-xl text-body text-muted">
                A deal earns its place by being a good deal. Not by having been cut last Tuesday, and not by being
                new this morning.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href={primaryHref} variant="signal" className="px-5 py-3 text-base">
                  {primaryLabel}
                </ButtonLink>
                <ButtonLink href="#how" variant="outline" className="px-5 py-3 text-base">
                  See how it works
                </ButtonLink>
              </div>

              <p className="mt-5 max-w-xl text-sm text-muted">
                £29 a month for your area. Cancel any time. No free tier, and no card details taken for a trial that
                does not exist.
              </p>
            </div>

            <div className="lg:pl-4">
              <DealPreview />
            </div>
          </div>
        </section>

        {/* Three claims -------------------------------------------------- */}
        <section id="inside" className="mx-auto max-w-6xl border-t border-rule px-6 py-14">
          <h2 className="font-display max-w-2xl text-h2 font-normal md:text-h2-lg">
            A portal can only tell you what is new.
          </h2>
          <p className="mt-5 max-w-2xl text-body text-muted">
            That is the one question it can answer, so it is the one you get asked. Whether a property is a good buy
            for the way you invest is a different question, and nothing on a portal is set up to ask it.
          </p>
          <p className="mt-4 max-w-2xl text-body text-muted">
            The best deal in your area might have been listed this morning or eight months ago. We score both the same
            way and put whichever is better in front of you.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {CLAIMS.map((claim) => (
              <div key={claim.title} className="border-t border-rule pt-5">
                <h3 className="text-h3 font-medium">{claim.title}</h3>
                <p className="mt-3 text-body text-muted">{claim.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Alternating features ------------------------------------------ */}
        <section className="mx-auto max-w-6xl border-t border-rule px-6 py-14">
          <div className="space-y-16">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="label text-muted">Leverage</p>
                <h2 className="font-display mt-4 text-h2 font-normal md:text-h2-lg">
                  Walk in knowing exactly how much room there is.
                </h2>
                <p className="mt-5 text-body text-muted">
                  An agent will tell you there is interest. The history tells you the price has come down twice, the
                  sale already fell through once, and nobody has bought it in seven hundred days. You make your offer
                  against that rather than against the asking price.
                </p>
                <p className="mt-4 text-body text-muted">
                  None of that decides whether a property reaches you. A good deal reaches you because it is a good
                  deal. What the seller has done since is how you price the offer once it has.
                </p>
              </div>
              <TimelinePreview />
            </div>

            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className="lg:order-2">
                <p className="label text-muted">Already worked out</p>
                <h2 className="font-display mt-4 text-h2 font-normal md:text-h2-lg">
                  Nothing reaches you until it has been through the numbers.
                </h2>
                <p className="mt-5 text-body text-muted">
                  Monthly cashflow, price against what nearby homes actually sold for, and local demand are worked out
                  before you open it, and shown with the figures behind them. You can see why something scored what it
                  did and disagree with it, which is more use than a number you have to take on trust.
                </p>
                <p className="mt-4 text-body text-muted">
                  Where we hold nothing, it says so and scores nothing. No assumed averages, and no language model
                  anywhere near this.
                </p>
              </div>
              <div className="lg:order-1">
                <ScorePreview />
              </div>
            </div>

            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="label text-muted">Worth opening</p>
                <h2 className="font-display mt-4 text-h2 font-normal md:text-h2-lg">
                  Short when it should be short.
                </h2>
                <p className="mt-5 text-body text-muted">
                  A quiet area gets a shorter list and one sentence explaining why. You are never handed five when
                  two stack, so you never have to work out which three are filler.
                </p>
                <p className="mt-4 text-body text-muted">
                  Anything you mark as not for you is gone for good, however well it scores later. The list stays
                  worth the two minutes it takes to read because you decide what is on it.
                </p>
              </div>

              <div className="border-t border-rule pt-6">
                <p className="text-h3 font-medium">A short list this week</p>
                <p className="mt-3 text-body text-muted">
                  Only two properties in your area clear the bar at the moment. The rest do not stack against your
                  strategy, so they are not here.
                </p>
                <p className="mt-5 border-t border-rule pt-4 text-sm text-muted">
                  An example of a thin week, stated rather than padded.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works --------------------------------------------------- */}
        <section id="how" className="mx-auto max-w-6xl border-t border-rule px-6 py-14">
          <h2 className="font-display max-w-2xl text-h2 font-normal md:text-h2-lg">How it works</h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.step} className="border-t border-rule pt-5">
                <p className="figure text-sm text-muted">{step.step}</p>
                <h3 className="mt-3 text-h3 font-medium">{step.title}</h3>
                <p className="mt-3 text-body text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing --------------------------------------------------------- */}
        <section id="pricing" className="mx-auto max-w-6xl border-t border-rule px-6 py-14">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <h2 className="font-display text-h2 font-normal md:text-h2-lg">
                A sourcer charges thousands. This is £29.
              </h2>
              <p className="mt-5 text-body text-muted">
                A deal sourcer finds you one property and takes a fee for it, and you buy what they happened to
                pick. We show you everything in your area that moved, every week, and you pick. Most investors lose
                a weekend a month to portals instead, and still miss the property that quietly dropped twelve per
                cent in March.
              </p>
              <p className="mt-4 text-body text-muted">
                Searching a whole area every week costs us money whether you open the list or not, which is why
                there is no free plan and no trial. The newsletter is the free tier.
              </p>
            </div>

            <div className="rounded-lg border border-rule p-8">
              <p className="flex items-baseline gap-3">
                <span className="figure text-6xl leading-none">£29</span>
                <span className="label text-muted">a month</span>
              </p>

              <ul className="mt-8 space-y-3.5 border-t border-rule pt-6 text-body text-muted">
                {[
                  'Your area, up to forty miles from your postcode',
                  'Scored for how you invest, whether that is a let, an HMO or a flip',
                  'The best deals in your area, kept in front of you',
                  'A deal stays on your list until you say it is not for you',
                  'The full price history, so you know what to offer',
                  'Yield and value gap worked out before you open it',
                  'A calculator that runs your own numbers, not ours',
                  'Track each one from interested through to completed',
                  'Cancel any time from your account page',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 bg-muted" />
                    {line}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={primaryHref}
                variant="signal"
                className="mt-8 w-full px-5 py-3 text-base"
              >
                {primaryLabel}
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="mx-auto max-w-3xl border-t border-rule px-6 py-14">
          <h2 className="font-display text-h2 font-normal md:text-h2-lg">Questions</h2>

          <div className="mt-10">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group border-b border-rule py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-h3 font-medium">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-2xl leading-none font-normal text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 max-w-prose text-body text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA -------------------------------------------------------- */}
        <section className="mx-auto max-w-6xl border-t border-rule px-6 py-16 text-center">
          <h2 className="font-display mx-auto max-w-2xl text-h2 font-normal md:text-h2-lg">
            Tell us how you invest. We will find the deals.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-body text-muted">
            £29 a month for your area. Cancel any time.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href={primaryHref} variant="signal" className="px-5 py-3 text-base">
              {primaryLabel}
            </ButtonLink>
            <ButtonLink href="#how" variant="outline" className="px-5 py-3 text-base">
              See how it works
            </ButtonLink>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
