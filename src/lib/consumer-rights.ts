/**
 * The cancellation acknowledgement taken at checkout.
 *
 * Under the Consumer Contracts (Information, Cancellation and Additional
 * Charges) Regulations 2013 a consumer buying at a distance has fourteen days to
 * cancel. That right survives the service starting — unless the consumer has
 * *expressly requested* that it start within the cancellation period and has
 * acknowledged what that costs them. Without both halves on record, a
 * subscriber who has already had their opening list built can cancel inside
 * fourteen days and be entitled to their money back, and we will have spent real
 * PropertyData credits producing it.
 *
 * The opening list is the whole of the first month's value and it is built
 * within minutes of payment, so this is not a technicality here. It is the
 * difference between a refund we owe and one we do not.
 *
 * Two things make the record evidence rather than a flag:
 *
 *   - **The exact wording is stored, not just a boolean.** What matters in a
 *     dispute is what the person was shown, and "they ticked a box" is not an
 *     answer to that. Wording changes get a new version and old records keep
 *     saying what they said.
 *
 *   - **The wording is resolved on the server from the version posted**, never
 *     taken from the form. A form that carries its own wording is a form that
 *     can be edited before it is submitted, and a stored acknowledgement that
 *     the customer could have authored is worth nothing.
 */

export type AcknowledgementVersion = keyof typeof ACKNOWLEDGEMENT_WORDING

/**
 * Every wording ever shown, by version. Nothing is ever removed from here —
 * a record pointing at a version this file no longer knows is a record that
 * cannot be read back, which defeats the purpose of keeping it.
 */
export const ACKNOWLEDGEMENT_WORDING = {
  '2026-09-04': `I ask Prop Signal to start straight away, and I understand that my first list is built immediately. I accept that once it has been built I lose my right to cancel within 14 days under the Consumer Contracts Regulations 2013, and that my subscription can still be cancelled at any time from my account page to stop future payments.`,
} as const

/** The version shown to anybody arriving at checkout today. */
export const CURRENT_ACKNOWLEDGEMENT: AcknowledgementVersion = '2026-09-04'

/** The form field the tick posts under, in one place so the two ends agree. */
export const ACKNOWLEDGEMENT_FIELD = 'cancellationAck'

/** The exact words shown for a version, or null where the version is not one of ours. */
export function acknowledgementWording(version: string): string | null {
  return version in ACKNOWLEDGEMENT_WORDING
    ? ACKNOWLEDGEMENT_WORDING[version as AcknowledgementVersion]
    : null
}

export type AcknowledgementSubmission = {
  ticked: boolean
  version: string
}

export type AcknowledgementCheck =
  | { ok: true; version: AcknowledgementVersion; wording: string }
  | { ok: false; reason: 'not_ticked' | 'unknown_version' }

/**
 * Whether a checkout request carries a valid acknowledgement.
 *
 * Pure, so the rule can be tested without a request. The route calls it and
 * refuses on anything but `ok` — the tick in the browser is a courtesy, and this
 * is the thing that actually holds, because a POST can be made without ever
 * loading the page that has the checkbox on it.
 */
export function checkAcknowledgement(submission: AcknowledgementSubmission): AcknowledgementCheck {
  if (!submission.ticked) return { ok: false, reason: 'not_ticked' }

  const wording = acknowledgementWording(submission.version)
  if (wording === null) return { ok: false, reason: 'unknown_version' }

  return { ok: true, version: submission.version as AcknowledgementVersion, wording }
}
