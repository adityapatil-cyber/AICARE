import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { PublicBotProfile } from '../types/aicare';
import { DEMO_BOT_PROFILE, DEMO_BUSINESS_ID } from '../data/demoGreenLeaf';
import { getPublicBotProfile } from '../lib/firestoreService';
import { CustomerChatbot } from './CustomerChatbot';

interface PublicBotPageProps {
  businessId: string;
  isWidget: boolean;
}

export function PublicBotPage({ businessId, isWidget }: PublicBotPageProps) {
  const [bot, setBot] = useState<PublicBotProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (businessId === DEMO_BUSINESS_ID) {
          if (active) setBot(DEMO_BOT_PROFILE);
          return;
        }
        const profile = await getPublicBotProfile(businessId);
        if (!active) return;
        if (!profile || !profile.isPublished) {
          setError('This customer support assistant is not published or could not be found.');
        } else {
          setBot(profile);
        }
      } catch {
        if (active) {
          setError('This customer support assistant is unavailable or not yet published.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [businessId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500">Loading customer support assistant...</div>
      </div>
    );
  }

  if (error || !bot) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
          <h1 className="text-lg font-semibold text-slate-900">Assistant Unavailable</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (isWidget) {
    return (
      <div className="h-screen w-screen bg-white overflow-hidden">
        <CustomerChatbot bot={bot} channel="widget" compact />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <CustomerChatbot bot={bot} channel="text" />
        <div className="text-center text-xs text-slate-400">
          Powered by AICare · Your Business. Always Answered.
        </div>
      </div>
    </div>
  );
}
