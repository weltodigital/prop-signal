'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requestOrigin } from '@/lib/origin'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string; email?: string }

const schema = z.object({
  email: z.string().trim().toLowerCase().email('That does not look like an email address.'),
  next: z.string().optional(),
})

/**
 * Sends a magic link. Supabase Auth does the sending — there is no email
 * service in v1, by design.
 */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    next: formData.get('next'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the email address.' }
  }

  const { email, next } = parsed.data
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  // Built from the request so links work on localhost, previews and the live
  // domain without a per-environment constant.
  const origin = await requestOrigin()

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  })

  if (error) {
    return { status: 'error', message: error.message, email }
  }

  return { status: 'sent', email }
}
