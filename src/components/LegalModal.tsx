import React from 'react';
import { X } from 'lucide-react';

export type LegalTopic = 'privacy' | 'terms' | 'contact' | 'about' | null;

export function LegalModal({
  topic,
  onClose,
}: {
  topic: LegalTopic;
  onClose: () => void;
}) {
  if (!topic) return null;

  const content: Record<Exclude<LegalTopic, null>, { title: string; body: React.ReactNode }> = {
    privacy: {
      title: 'Privacy Policy',
      body: (
        <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            AICare isolates every business workspace in Cloud Firestore with tenant-scoped access controls. Knowledge base documents are encrypted on the server before runtime storage and are never shared across businesses.
          </p>
          <p>
            Customers are advised not to share passwords, payment card numbers, or sensitive personal identifiers in support chats. Business owners control whether conversation transcripts are saved and can delete stored conversations or uploaded documents at any time.
          </p>
        </div>
      ),
    },
    terms: {
      title: 'Terms of Service',
      body: (
        <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            AICare operates on free-tier cloud and Gemini AI infrastructure. Usage is subject to configured daily limits and upstream free-tier quotas. AI-generated responses may occasionally contain inaccuracies and should be verified for critical business commitments.
          </p>
          <p>
            The assistant provides informational customer support and human handover ticket creation. Refunds, bookings, payments, and order modifications require human verification or explicit authorized integrations.
          </p>
        </div>
      ),
    },
    contact: {
      title: 'Contact AICare',
      body: (
        <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            Have questions about setting up AICare for your shop, clinic, or online store? Reach our team at <span className="font-medium text-slate-900">hello@aicare-support.example</span>.
          </p>
          <p>
            You can also explore the interactive GreenLeaf Store demo right from the home page without creating an account.
          </p>
        </div>
      ),
    },
    about: {
      title: 'About AICare',
      body: (
        <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            AICare ("Your Business. Always Answered.") was built to give local shops, clinics, service providers, and MSMEs accessible multilingual customer support over text and voice without requiring engineering teams or expensive subscriptions.
          </p>
        </div>
      ),
    },
  };

  const current = content[topic];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 id="legal-modal-title" className="text-xl font-bold text-slate-900 mb-3">
          {current.title}
        </h2>
        {current.body}
      </div>
    </div>
  );
}
