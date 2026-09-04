import type { Metadata } from 'next'
import { LegalDocumentPage } from '@/components/legal-document'
import { TERMS } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Terms of service — Prop Signal',
  description: 'The terms on which Prop Signal is provided.',
}

export default function TermsPage() {
  return <LegalDocumentPage document={TERMS} />
}
