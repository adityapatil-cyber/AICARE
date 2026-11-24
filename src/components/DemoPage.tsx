import React, { useState } from 'react';
import { ArrowLeft, Clock, MapPin, Package, ShieldCheck } from 'lucide-react';
import {
  DEMO_BOT_PROFILE,
  DEMO_FEATURED_IMAGE,
  DEMO_KNOWLEDGE_ITEMS,
} from '../data/demoGreenLeaf';
import { CustomerChatbot } from './CustomerChatbot';

interface DemoPageProps {
  onBack: () => void;
  onStartFree: () => void;
}

const SAMPLE_QUESTIONS = [
  { label: 'English · Delivery', text: 'Do you provide home delivery and what does it cost?' },
  { label: 'हिन्दी · कीमतें', text: 'आपके पास कौन-कौन से पौधे और गमले हैं और उनकी कीमत क्या है?' },
  { label: 'ગુજરાતી · સમય', text: 'તમારી દુકાન કેટલા વાગ્યે ખુલે છે અને રવિવારે ખુલ્લી હોય છે?' },
  { label: 'తెలుగు · రిటర్న్', text: 'మీ రిటర్న్ పాలసీ ఏమిటి? మొక్క పాడైతే మార్చుకోవచ్చా?' },
  { label: 'മലയാളം · വില', text: 'ഗ്ലാസ് ടെറേറിയത്തിന്റെ വില എത്രയാണ്?' },
  { label: '中文 · 退货政策', text: '你们提供送货上门吗？植物有健康保证吗？' },
];

export function DemoPage({ onBack, onStartFree }: DemoPageProps) {
  const [botSeedKey, setBotSeedKey] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<{ id: number; text: string } | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to AICare
            </button>
            <span className="text-slate-300 hidden sm:inline">|</span>
            <span className="text-sm font-semibold text-amber-700 hidden sm:inline">
              DEMO DATA · GreenLeaf Store
            </span>
          </div>

          <button
            type="button"
            onClick={onStartFree}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            Create Your Own Assistant
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Demo Store Info & Sample Knowledge */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="aspect-4/3 bg-slate-100">
              <img
                src={DEMO_FEATURED_IMAGE}
                alt="Handcrafted geometric glass terrarium and ceramic planter at GreenLeaf Store"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5">
              <div className="text-xs font-semibold text-amber-700 mb-1">
                DEMO DATA · FICTIONAL SAMPLE BUSINESS
              </div>
              <h1 className="text-xl font-bold text-slate-900">GreenLeaf Store</h1>
              <p className="mt-1.5 text-sm text-slate-600">
                A fictional local home & garden shop configured with sample products, pricing, hours, and policies so you can test text and voice support immediately.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Mon–Sat 9am–7pm</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>418 Botanical Lane</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Free delivery over $50</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>14-day plant guarantee</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Uploaded Demo Knowledge Base ({DEMO_KNOWLEDGE_ITEMS.length} items)
              </h2>
              <button
                type="button"
                onClick={() => {
                  setBotSeedKey((k) => k + 1);
                  setPendingPrompt(null);
                }}
                className="text-xs text-blue-700 hover:underline"
              >
                Reset chat
              </button>
            </div>
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {DEMO_KNOWLEDGE_ITEMS.map((item) => (
                <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                  <p className="mt-1 text-xs text-slate-600 whitespace-pre-line line-clamp-4">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Live Multilingual Text & Voice Chatbot */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-medium text-slate-500 mb-2">
              Click any sample question in multiple languages to ask the assistant (or switch to Voice mode below):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setPendingPrompt({ id: Date.now(), text: q.text })}
                  className="text-left p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-[11px] font-semibold text-blue-700">{q.label}</div>
                  <div className="text-xs text-slate-700 truncate mt-0.5">{q.text}</div>
                </button>
              ))}
            </div>
          </div>

          <CustomerChatbot
            key={botSeedKey}
            bot={DEMO_BOT_PROFILE}
            channel="text"
            externalPrompt={pendingPrompt}
          />
        </div>
      </main>
    </div>
  );
}
