import type { Metadata } from 'next'
import Image from 'next/image'
import listings from '@/assets/multiple-listings.jpg'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'
import { DealPreview, ScorePreview, TimelinePreview } from '@/components/marketing/preview'
import { Arrive, Press, Reveal } from '@/components/marketing/motion'
import { PLAN_LIST } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Prop Signal. Sourced deals for how you invest',
  description:
    'We continuously filter the property market for properties that fit how you invest, and put the ones worth a closer look in front of you. BRRR in Portsmouth, HMOs in Leeds, buy to let near home. From £29 a month.',
}

/**
 * The whole product in three lines, immediately under the hero.
 *
 * Before any of the reasoning, the evidence or the pricing. Somebody who has
 * read this far should be able to say what Prop Signal does without scrolling
 * again, and the temptation on a product with this much machinery behind it is
 * to lead with the machinery.
 */
const HOW_IT_WORKS = [
  { step: '01', title: 'You tell us what you are looking for', body: 'Your area, how far you will travel, and how you make money from a property.' },
  { step: '02', title: 'We monitor the market', body: 'Every week, across everything for sale in that area — not just what was listed this morning.' },
  { step: '03', title: 'We show you what deserves a closer look', body: 'Ranked, with the numbers worked out and the reasons stated.' },
] as const

const CLAIMS = [
  {
    title: 'We search the market',
    body: 'Everything for sale in your area, every week. Not just what appeared this morning and not just what has come down in price.',
  },
  {
    title: 'We analyse the numbers',
    body: 'Cashflow, price against nearby sold prices, local demand — worked out before you open it, so what does not stack is obvious without a spreadsheet.',
  },
  {
    title: 'We rank the opportunities',
    body: 'Ordered by what deserves your attention first, under whichever of your strategies the property actually suits.',
  },
  {
    title: 'You decide what to pursue',
    body: 'We have no stake in which one you buy, or whether you buy at all. The reasoning is in the open so you can disagree with it.',
  },
] as const


/**
 * The three ways somebody gets an investment property in front of them.
 *
 * Nobody is named. What separates them is the model rather than the brand: who
 * does the filtering, who picks, and what the money buys — and those are facts
 * about how each one works rather than claims about how well they work.
 */
const COMPARISON = {
  columns: ['Prop Signal', 'A deal sourcer', 'A deal-sourcing site'],
  rows: [
    {
      label: 'What you get',
      cells: [
        'Every property in your area that stacks against the way you invest',
        'One property, the one they picked',
        'A search tool, and whatever you find with it',
      ],
    },
    {
      label: 'Who does the filtering',
      cells: ['We do, every week, across the whole area', 'They do, once, for one deal', 'You do'],
    },
    {
      label: 'Scored for your strategy',
      cells: [
        'Buy to let, HMO or BRRR, with every factor shown',
        'Their judgment, and you take it on trust',
        'A yield, if the listing carries the figures',
      ],
    },
    {
      label: 'What it costs',
      cells: ['From £29 a month', 'A fee in the thousands, on each deal', 'A subscription, and your weekends'],
    },
    {
      label: 'What we earn if you buy',
      cells: [
        'The same £29. No sourcing fee, no success fee',
        'A fee on completion, typically in the thousands',
        'The same subscription',
      ],
    },
  ],
} as const

const FAQS = [
  {
    q: 'How is this different from a portal alert?',
    a: 'A portal answers one question, which is what went up this morning. Whether something is worth your attention for the way you invest is a different question and nothing on a portal asks it. We filter every property in your area against your strategy, keep the ones that deserve a closer look, and rank them. A property listed eight months ago and one listed this morning are judged the same way.',
  },
  {
    q: 'How is this different from a deal sourcer?',
    a: 'A sourcer finds one property and is paid when you buy it. We show you everything in your area worth a closer look, with the numbers and the reasoning in the open, and you pick. There is no sourcing fee and no success fee: your subscription is the whole of what we earn, which means we have no reason to prefer one of your properties over another, or to prefer that you buy at all. The reasoning is published so you can disagree with it.',
  },
  {
    q: 'How many properties will I get?',
    a: 'As many as clear the bar, which is decided by what you ask for. Your radius is the biggest lever: ten miles of a quiet market might hold two properties worth your time, and forty miles of the same market holds far more. Price, bedroom and type filters narrow it further, and the number of sourcing lists you tick widens it. A property stays on your list until you buy it, it sells, or you say it is not for you, so the list grows as new ones qualify rather than being replaced each week. We would rather hand you two that stack than five where three are filler.',
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
    a: 'No, and this is the thing most people assume. A property is on your list because it fits how you invest, and it can do that from the day it is listed. Reductions, repossessions, auctions and slow sellers are some of the ways we find properties worth examining — they are not what makes a property good. A price cut counts for something, because it tells you the seller is motivated, but it is worth half of what the property itself is worth and it is never a way in. Something that does not stack is not shown however hard the seller has moved.',
  },
  {
    q: 'Does the same property keep appearing?',
    a: 'Yes, while it is still one of the best deals in your area, because hiding it would not make it a worse deal. What changes is the marking: something that has moved since you last looked is flagged as changed. When you are done with it, mark it as not for you and it is gone for good.',
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
  const primaryLabel = signedIn ? 'Go to your dashboard' : 'Start for £29/month'

  return (
    <div className="min-h-screen bg-ground">
      <MarketingNav signedIn={signedIn} />

      <main>
        {/* Hero ---------------------------------------------------------- */}
        {/* The one place the accent covers a whole band, so the page opens on
            something other than a sheet of off-white. */}
        <section className="relative overflow-hidden bg-gradient-to-b from-tint via-tint/50 to-ground">
          {/* A glow rather than a band: the colour is strongest behind the
              example deal and gone by the time the page starts reading. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,var(--color-tint-deep)_0%,transparent_65%)] opacity-70"
          />

          <div className="relative mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-12 items-center gap-x-6 gap-y-16 pt-16 pb-24 md:gap-x-8">
              <Arrive className="col-span-12 lg:col-span-7">
                <p className="label text-highlight-deep">For UK landlords and property investors</p>

                <h1 className="font-display mt-5 text-h1 font-normal text-pretty md:text-h1-lg">
                  A portal can only tell you
                  <br />
                  what is new.
                </h1>

                <p className="mt-7 max-w-xl text-body text-muted">
                  New is not the same as worth buying. Prop Signal scores every property in your area against the
                  way you invest, keeps the ones that stack in front of you, and looks again every week — whether
                  it was listed this morning or eight months ago.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Press>
                    <ButtonLink href={primaryHref} className="px-5 py-3 text-base">
                      {primaryLabel}
                    </ButtonLink>
                  </Press>
                  <Press>
                    <ButtonLink href="#how" variant="secondary" className="px-5 py-3 text-base">
                      See how it works
                    </ButtonLink>
                  </Press>
                </div>

                <p className="mt-6 text-sm text-muted">From £29 a month, by how many areas you buy in. Cancel any time.</p>
              </Arrive>

              {/* The market, as a stack.
                  
                  Three layers on a shared perspective rather than one flat
                  picture: the two tinted plates behind carry the depth and the
                  contact sheet sits on top of them, which says "there is a
                  great deal of this and we go through all of it" without a
                  caption having to. The tilt is small — enough to read as a
                  physical stack, not enough to look like a mistake.
                  
                  Hidden below large screens. On a phone it would be a wall of
                  postage stamps under the one thing worth reading. */}
              <Arrive className="col-span-12 hidden lg:col-span-5 lg:block" delay={0.12}>
                <div className="relative [perspective:1400px]">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 translate-x-6 translate-y-6 rounded-xl bg-tint-deep/70 [transform:rotate(4deg)]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 translate-x-3 translate-y-3 rounded-xl bg-card/80 ring-1 ring-rule [transform:rotate(2deg)]"
                  />

                  <div className="relative overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-rule/80 shadow-[0_18px_40px_-16px_rgba(13,27,47,0.28)] [transform:rotateX(6deg)_rotateY(-8deg)_rotate(-1.5deg)]">
                    <Image
                      src={listings}
                      alt="A sheet of nine properties of the kind Prop Signal searches through"
                      className="h-auto w-full rounded-lg"
                      sizes="(min-width: 1024px) 40vw, 100vw"
                      priority
                    />
                    {/* The sheet fades into the band it sits on rather than
                        stopping at a hard edge, so it reads as part of the
                        page and not as a screenshot dropped onto it. */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-tr from-tint/45 via-transparent to-transparent"
                    />
                  </div>
                </div>
              </Arrive>
            </div>
          </div>
        </section>

        {/* What it does, in three lines ---------------------------------- */}
        {/* Immediately under the hero and before any of the reasoning. The
            temptation on a product with this much machinery behind it is to
            open with the machinery. */}
        <section id="how" className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-12 gap-x-6 gap-y-10 border-t border-rule pt-16 pb-20 md:gap-x-8">
            {HOW_IT_WORKS.map((step, index) => (
              <Reveal key={step.step} className="col-span-12 sm:col-span-4" delay={index * 0.08}>
                <p className="figure text-sm text-highlight-deep">{step.step}</p>
                <h2 className="mt-4 text-h3 font-medium">{step.title}</h2>
                <p className="mt-3 text-body text-muted">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* One property, analysed -------------------------------------------- */}
        {/* Its own band with a hard edge, rather than floating beside the
            headline where it read as decoration. This is the product: one
            property, why it is here, and the figures behind that. It earns a
            section. */}
        <section id="inside" className="mx-auto max-w-6xl px-6">
          <div className="border-t border-rule pt-16 pb-24">
            <Reveal className="max-w-2xl">
              <p className="label text-highlight-deep">A closer look at one of them</p>
              <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                Every property on your list arrives like this.
              </h2>
              <p className="mt-6 text-body text-muted">
                Not search results. Everything we put in front of you has already been measured against the way you
                invest, with the reasons stated and the figures behind them shown. How many you get depends on your
                area and how wide you search — here is what one of them looks like.
              </p>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="mt-10 rounded-xl border border-highlight-deep/25 bg-card p-7 shadow-[0_1px_3px_rgba(13,27,47,0.04)] lg:p-10">
                <DealPreview />
              </div>
            </Reveal>
          </div>
        </section>

        {/* What that actually involves ------------------------------------ */}
        <section className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-12 gap-x-6 gap-y-16 border-t border-rule pt-16 pb-28 md:gap-x-8">
            <Reveal className="col-span-12 lg:col-span-7">
              <h2 className="font-display text-h2 font-normal text-balance md:text-h2-lg">
                The best buy in your area may have been listed eight months ago.
              </h2>
              <p className="mt-6 text-body text-muted">
                Nothing on a portal is set up to notice it. A saved search answers one question, which is what went
                up this morning, and a property that has sat there since February has already fallen off the bottom
                of it. We judge the whole area every week, on the same four measures, whatever the listing date.
              </p>
            </Reveal>

            <div className="col-span-12 grid grid-cols-12 gap-x-6 gap-y-12 md:gap-x-8">
              {CLAIMS.map((claim, index) => (
                <Reveal key={claim.title} className="col-span-12 sm:col-span-6 lg:col-span-3" delay={index * 0.08}>
                  <div aria-hidden="true" className="h-0.5 w-10 bg-highlight-deep" />
                  <h3 className="mt-5 text-h3 font-medium">{claim.title}</h3>
                  <p className="mt-3 text-body text-muted">{claim.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Alternating features ------------------------------------------ */}
        <section className="bg-gradient-to-b from-ground via-tint/40 to-ground">
          <div className="mx-auto max-w-6xl px-6">
            <div className="space-y-28 border-t border-rule pt-16 pb-28">
            <div className="grid grid-cols-12 items-center gap-x-6 gap-y-12 md:gap-x-8">
              <Reveal className="col-span-12 lg:col-span-5">
                <p className="label text-highlight-deep">Leverage</p>
                <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                  Walk in knowing exactly how much room there is.
                </h2>
                <p className="mt-6 text-body text-muted">
                  An agent will tell you there is interest. The history tells you the price has come down twice and
                  nobody has bought it in seven hundred days. You make your offer against that.
                </p>
              </Reveal>
              <Reveal className="col-span-12 lg:col-span-7" delay={0.1}>
                <div className="rounded-xl border border-highlight-deep/25 bg-card p-7 shadow-[0_1px_3px_rgba(13,27,47,0.04)] lg:p-8">
                  <TimelinePreview />
                </div>
              </Reveal>
            </div>

            <div className="grid grid-cols-12 items-center gap-x-6 gap-y-12 md:gap-x-8">
              <Reveal className="col-span-12 lg:col-span-5 lg:col-start-8">
                <p className="label text-highlight-deep">Already worked out</p>
                <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                  Nothing reaches you until it has been through the numbers.
                </h2>
                <p className="mt-6 text-body text-muted">
                  Cashflow, price against nearby sales and local demand, shown with the figures behind them and the
                  points each one earned. You can see why something scored what it did and disagree with it. Where a
                  factor cannot be worked out it says so and is left out, rather than being scored zero or filled in
                  with an average.
                </p>
              </Reveal>
              <Reveal className="col-span-12 lg:col-span-7 lg:col-start-1 lg:row-start-1" delay={0.1}>
                <div className="rounded-xl border border-highlight-deep/25 bg-card p-7 shadow-[0_1px_3px_rgba(13,27,47,0.04)] lg:p-8">
                  <ScorePreview />
                </div>
              </Reveal>
            </div>

            <div className="grid grid-cols-12 items-center gap-x-6 gap-y-12 md:gap-x-8">
              <Reveal className="col-span-12 lg:col-span-5">
                <p className="label text-highlight-deep">Worth opening</p>
                <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                  Short when it should be short.
                </h2>
                <p className="mt-6 text-body text-muted">
                  How many properties reach you is decided by what you asked for. A wide radius and loose filters give
                  you more; ten miles of a quiet market may give you two. The list is never padded.
                </p>
              </Reveal>

              <Reveal className="col-span-12 lg:col-span-7" delay={0.1}>
                <div className="rounded-xl border border-highlight-deep/25 bg-card p-7 shadow-[0_1px_3px_rgba(13,27,47,0.04)] lg:p-8">
                  <p className="label text-highlight-deep">Nothing new this week</p>
                  <p className="mt-4 text-h3 font-medium">
                    Nothing new in your area was worth adding this week. Everything already on your list is still
                    there and still stacks.
                  </p>
                  <p className="mt-5 border-t border-rule pt-4 text-sm text-muted">
                    Example message. A quiet week says so rather than padding the list.
                  </p>
                </div>
              </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing --------------------------------------------------------- */}
        {/* Priced on areas, because areas are what this costs us to run. One
            postcode is a couple of hundred data credits a month; five is a
            thousand. Charging the same for both would mean overcharging the
            first or losing money on the last. */}
        <section id="pricing" className="bg-gradient-to-b from-tint/30 to-ground">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-12 gap-x-6 gap-y-12 border-t border-rule pt-16 pb-28 md:gap-x-8">
              <Reveal className="col-span-12 lg:col-span-7">
                <p className="label text-highlight-deep">No sourcing fee. No success fee.</p>
                <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                  Your subscription is the whole of what we earn.
                </h2>
                <p className="mt-6 text-body text-muted">
                  Which means nothing here has an interest in you buying any particular property, or in you buying
                  at all. Pick by how many areas you buy in — each one gets its own search, its own list and its own
                  scoring, and they are never mixed. Change tier or cancel any time.
                </p>
              </Reveal>

              <div className="col-span-12 grid grid-cols-12 gap-x-6 gap-y-6 md:gap-x-8">
                {PLAN_LIST.map((plan, index) => (
                  <Reveal key={plan.id} className="col-span-12 lg:col-span-4" delay={index * 0.08}>
                    <div
                      className={`flex h-full flex-col rounded-lg border p-7 ${
                        plan.recommended
                          ? 'border-highlight-deep/40 bg-gradient-to-br from-tint to-tint-deep'
                          : 'border-rule bg-card'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="label text-highlight-deep">{plan.label}</p>
                        {plan.recommended ? (
                          <span className="label border border-highlight-deep/40 px-1.5 py-0.5 text-highlight-deep">
                            Most take this
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-4 flex items-baseline gap-2">
                        <span className="figure text-5xl leading-none text-highlight-deep">
                          £{plan.monthlyPrice}
                        </span>
                        <span className="label text-muted">a month</span>
                      </p>

                      <p className="mt-4 text-body">
                        <span className="figure font-medium">{plan.areas}</span>{' '}
                        {plan.areas === 1 ? 'area' : 'separate areas'}
                      </p>
                      <p className="mt-2 text-sm text-muted">{plan.summary}</p>

                      <Press className="mt-8">
                        <ButtonLink
                          href={signedIn ? `/subscribe?tier=${plan.id}` : `/signup?tier=${plan.id}`}
                          variant={plan.recommended ? 'primary' : 'secondary'}
                          className="w-full px-5 py-3 text-base"
                        >
                          {signedIn ? `Choose ${plan.label}` : `Start with ${plan.label}`}
                        </ButtonLink>
                      </Press>
                    </div>
                  </Reveal>
                ))}
              </div>

              <Reveal className="col-span-12 lg:col-span-8">
                <ul className="space-y-3.5 border-t border-rule pt-6 text-body">
                  {[
                    'Every area searched from one mile to a hundred from your postcode',
                    'Scored for how you invest, whether that is a let, an HMO or a flip',
                    'Everything in your area that stacks, kept in front of you',
                    'The full price history, so you know what to offer',
                    'A calculator that runs your own numbers, not ours',
                    'Track each one from interested through to completed',
                  ].map((line) => (
                    <li key={line} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 bg-highlight-deep" />
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm text-muted">
                  Every plan includes all of it. The only difference is how many areas you search.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* How we compare --------------------------------------------------- */}
        <section id="compare" className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-12 gap-x-6 gap-y-14 border-t border-rule pt-16 pb-28 md:gap-x-8">
            <Reveal className="col-span-12 lg:col-span-7">
              <p className="label text-highlight-deep">The alternatives</p>
              <h2 className="font-display mt-4 text-h2 font-normal text-balance md:text-h2-lg">
                What the money actually buys.
              </h2>
            </Reveal>

            {/* On a phone the same rows are stacked rather than scrolled
                sideways: three columns of prose in 390px is a column of single
                words. Both come from the same rows. */}
            <Reveal className="col-span-12 sm:hidden">
              {COMPARISON.rows.map((row) => (
                <div key={row.label} className="border-t border-rule py-6">
                  <p className="label text-muted">{row.label}</p>
                  <dl className="mt-4 space-y-3">
                    {row.cells.map((cell, index) => (
                      <div key={cell}>
                        <dt className={`text-sm ${index === 0 ? 'font-medium text-highlight-deep' : 'text-muted'}`}>
                          {COMPARISON.columns[index]}
                        </dt>
                        <dd className={`text-sm leading-relaxed ${index === 0 ? '' : 'text-muted'}`}>{cell}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </Reveal>

            <Reveal className="col-span-12 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[44rem] border-collapse text-left">
                <caption className="sr-only">
                  How Prop Signal compares with a deal sourcer and a deal-sourcing site
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[11rem] py-4 pr-6 align-bottom">
                      <span className="sr-only">What is being compared</span>
                    </th>
                    {COMPARISON.columns.map((column, index) => (
                      <th
                        key={column}
                        scope="col"
                        className={`label py-4 align-bottom ${
                          index === 0 ? 'bg-tint px-6 text-highlight-deep' : 'px-6 text-muted'
                        }`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.rows.map((row) => (
                    <tr key={row.label} className="border-t border-rule align-top">
                      <th scope="row" className="py-5 pr-6 text-sm font-medium">
                        {row.label}
                      </th>
                      {row.cells.map((cell, index) => (
                        <td
                          key={cell}
                          className={`py-5 text-sm leading-relaxed ${
                            index === 0 ? 'bg-tint px-6 font-medium' : 'px-6 text-muted'
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* FAQ -------------------------------------------------------------- */}
        <section id="faq" className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-12 gap-x-6 border-t border-rule pt-16 pb-28 md:gap-x-8">
            <Reveal className="col-span-12 lg:col-span-7">
              <h2 className="font-display text-h2 font-normal md:text-h2-lg">Questions</h2>

              <div className="mt-12">
                {FAQS.map((faq) => (
                  <details key={faq.q} className="group border-b border-rule py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-h3 font-medium transition-colors hover:text-highlight-deep">
                      {faq.q}
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-2xl leading-none font-normal text-highlight-deep transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-4 text-body text-muted">{faq.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final CTA -------------------------------------------------------- */}
        <section className="bg-gradient-to-b from-ground to-tint">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-12 gap-x-6 border-t border-rule pt-20 pb-28 md:gap-x-8">
              <Reveal className="col-span-12 lg:col-span-8 lg:col-start-3 lg:text-center">
                <h2 className="font-display text-h2 font-normal text-balance md:text-h2-lg">
                  Tell us how you invest. We will find the deals.
                </h2>
                <p className="mt-6 text-body text-muted">From £29 a month, by how many areas you buy in. Cancel any time.</p>

                <div className="mt-9 flex flex-wrap gap-3 lg:justify-center">
                  <Press>
                    <ButtonLink href={primaryHref} className="px-5 py-3 text-base">
                      {primaryLabel}
                    </ButtonLink>
                  </Press>
                  <Press>
                    <ButtonLink href="#how" variant="secondary" className="px-5 py-3 text-base">
                      See how it works
                    </ButtonLink>
                  </Press>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
