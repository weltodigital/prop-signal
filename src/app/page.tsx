import Image from 'next/image'
import { ButtonLink } from '@/components/ui'
import logo from '@/assets/prop-signal-logo.png'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Image src={logo} alt="Prop Signal" className="h-16 w-auto" priority />

      <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        Five properties every Monday, and the reason each one is on the list.
      </h1>

      <p className="mt-6 max-w-prose text-lg text-muted">
        Pick your area and your strategy. Every Monday morning there are five properties waiting in your dashboard,
        with the numbers stacked and a stated reason each one qualified this week.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <ButtonLink href={user ? '/dashboard' : '/login'}>
          {user ? 'Go to your dashboard' : 'Start for £29 a month'}
        </ButtonLink>
        <span className="text-sm text-muted">£29 a month. Cancel any time.</span>
      </div>

      <hr className="my-14 border-line" />

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">What makes the list different</h2>
        <p className="max-w-prose text-muted">
          Anyone can see what came onto the market this week for free. Prop Signal shows what has moved. Reduced
          twice. Back on after a fall-through. A hundred and forty days unsold and the agent getting nervous.
        </p>
        <p className="max-w-prose text-muted">
          A property that appeared months ago can lead this week&rsquo;s list because something changed. We diff every
          run against the last one and keep a dated record of what happened, so the reason a property qualified is
          always on the page next to it.
        </p>
      </section>

      <hr className="my-14 border-line" />

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="max-w-prose list-decimal space-y-3 pl-5 text-muted marker:text-ink">
          <li>Tell us your postcode, how far you will travel, and which strategies you buy on.</li>
          <li>Your first list is a backfill. It draws on everything standing in your area, not just this week.</li>
          <li>After that the run happens on Sunday night and the new five are there on Monday morning.</li>
          <li>
            Some weeks a quiet area will not produce five that qualify. You get a shorter list and we say why, rather
            than padding it.
          </li>
        </ol>
      </section>

      <hr className="my-14 border-line" />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Price</h2>
        <p className="max-w-prose text-muted">
          £29 a month for one area. There is no free tier. Every subscriber costs us real data credits each week, so
          the trial is the newsletter.
        </p>
        <ButtonLink href={user ? '/dashboard' : '/login'} variant="secondary">
          {user ? 'Go to your dashboard' : 'Sign in or create an account'}
        </ButtonLink>
      </section>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-muted">
        <p>Prop Signal. Property data supplied by PropertyData. Listings link to the original agent advert.</p>
      </footer>
    </main>
  )
}
