import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal-document'
import { PRIVACY } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Privacy policy — Prop Signal',
  description: 'What Prop Signal does with your personal data.',
}

export default function PrivacyPage() {
  return <LegalDocumentPage document={PRIVACY} />
}
