import { redirect } from 'next/navigation'

/**
 * Kept only so an old link still lands somewhere sensible.
 *
 * Watching used to be its own decision, with its own button beside "Track
 * this" and its own page. Nobody could say what the difference was, because
 * there was not really one: anybody working a deal wants to know when it moves.
 * The watch follows the stage now, and what has changed is shown on the deals
 * it changed on.
 */
export default function WatchlistPage() {
  redirect('/deals')
}
