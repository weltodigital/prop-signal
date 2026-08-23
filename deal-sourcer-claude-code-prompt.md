# Claude Code Build Prompt — Internal Deal Sourcer (PIW)

> Paste everything below this line into Claude Code as the opening prompt.

---

## What we're building

An internal deal sourcing tool. It pulls UK residential property listings from the PropertyData API, enriches them with local rent/price data, scores them against investor criteria, and outputs a shortlist I can drop into a weekly newsletter (Property Investor Weekly, sent via Beehiiv).

This is a single-operator internal tool for now. It will later become a customer-facing SaaS, so architectural seams for that matter — but **do not build any of the SaaS surface yet**.

## Hard scope

Build these, in this order, and stop:

1. PropertyData API client (typed, cached, rate-limit aware)
2. Sourcing run — pull listings for a saved search profile
3. Enrichment — rents, comparable sale prices, yields for each listing
4. Scoring — deterministic scoring against criteria, no LLM in the numbers path
5. Storage — Supabase, raw snapshots plus derived rows
6. Review UI — one page, a sortable table, enough to eyeball a run and mark deals in/out
7. Newsletter export — selected deals rendered as a Beehiiv-ready block

## Explicit non-goals

Do not build: auth, signup, billing, Stripe, multi-tenancy, email sending, a marketing site, onboarding, notifications, a mobile view, or a settings page. If you find yourself building any of these, stop and ask.

If the full scope above looks like more than roughly two days of work, say so before you start writing code and propose what to cut.

## Before you write any code

1. Fetch and read the PropertyData API documentation at `https://propertydata.co.uk/api/documentation`. Build against the endpoints that actually exist, their real parameter names, and their real response shapes. Do not write a client from assumptions about what the API probably looks like.
2. Report back: which endpoints we need, what each one costs in credits per call, and what the rate limits are.
3. Given those costs, propose a pull strategy for a weekly run over 3–5 target areas. I need to know the per-run credit cost before we design around a volume I can't afford.
4. Ask me for anything you need that isn't in this brief — target areas, budget range, API key location, existing Supabase project details.

Wait for my answers to 2–4 before starting the build.

## Stack

- TypeScript throughout
- Next.js (App Router) for the review UI
- Supabase for storage
- No ORM beyond the Supabase client unless you make a case for it
- Keep the sourcing pipeline runnable as a standalone script (`pnpm sourcing:run`) independent of the web app — the pipeline is the product, the UI is a window onto it

## Data model requirements

- **Store raw API responses verbatim**, in a `raw_snapshots` table, alongside the derived/normalised rows. Every run appends; nothing is overwritten. This accumulates a time series I can't buy back later, and it means a scoring change can be re-run over historic data without re-spending credits.
- Search criteria live in a `search_profiles` **table row**, not a config file. Include a nullable `owner_id` column from day one. That's the multi-tenancy seam — leave it null, don't wire it up.
- Scored results reference the scoring version that produced them.

## Scoring requirements

- A pure function: `(listing, enrichment, weights) => { score, breakdown }`
- Weights live in a versioned config object. Every stored score records which version produced it.
- The breakdown must be human-readable per factor — I need to see *why* something scored 82, not just that it did. If I can't defend a number in the newsletter, it's useless to me.
- Factors to start with (tell me if the data doesn't support any of these): gross yield, price vs local comparables, rental demand indicator, price reduction history, time on market.
- No LLM anywhere in this path. Numbers must be reproducible.

## Review UI

One page. A table of the latest run: address, price, key metrics, score, score breakdown on expand. Sortable by score. Two actions per row — include or exclude. That's it. No design work; use whatever is fastest and legible.

## Newsletter export

This is a first-class deliverable, not an afterthought. Every issue of PIW ships deals out of this tool, so the export has to be genuinely usable, not a JSON dump I then hand-edit.

Given the set of included deals, produce a copy-paste block for Beehiiv containing, per deal: a one-line description, the headline numbers, and a one-sentence note on why it scored.

Copy constraints for that block:
- Plain English, dry register, short sentences
- UK spelling
- No colon-drop lists
- No AI tells — never "The pattern is clear:", never "It's not just X, it's Y", no em-dash-heavy hedging
- **No placeholder text of any kind may survive into the output.** Not `PLACEHOLDER`, not `TODO`, not `[insert]`, not lorem ipsum. Add a validation step that hard-fails the export if the rendered block matches a placeholder pattern. This has burned me in production before.
- Every figure in the block must trace back to a stored field. If a number isn't in the data, omit the claim rather than estimating it.

## Working style

- Small commits, each one runnable
- Ask before adding a dependency
- Ask before expanding scope
- When you hit a decision with a cheap reversible option and an expensive thorough one, take the cheap one and flag it in a `DECISIONS.md`
- Write a short `README.md` covering how to run a sourcing pass and produce an export

## First deliverable

A working end-to-end pass over **one** search profile in **one** area, producing an export block for three deals. Get that working before you generalise anything.
