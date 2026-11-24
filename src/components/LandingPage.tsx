import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Code2,
  Globe2,
  Headphones,
  Menu,
  Mic,
  X,
} from 'lucide-react';
import { HERO_PREVIEW_IMAGE } from '../data/demoGreenLeaf';
import { SELECTABLE_PRIMARY_LANGUAGES } from '../utils/languages';
import { LegalModal, type LegalTopic } from './LegalModal';

interface LandingPageProps {
  isAuthenticated: boolean;
  onStartFree: () => void;
  onSignIn: () => void;
  onExploreDemo: () => void;
  onOpenDashboard: () => void;
}

const FAQS = [
  {
    q: 'Do I need any programming or coding skills to set up AICare?',
    a: 'No. You simply enter your business details, upload your FAQs, price lists, or PDF/CSV/TXT/DOCX documents, pick your assistant tone and brand color, test it, and paste one short snippet onto your website.',
  },
  {
    q: 'Which languages does the AI assistant support?',
    a: 'AICare automatically detects and responds in Indian languages (English, Hindi, Gujarati, Bengali, Marathi, Tamil, Telugu, Malayalam, Kannada, Punjabi, Urdu) and international languages (Mandarin Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, Arabic, Portuguese, Russian), plus other languages supported by Gemini.',
  },
  {
    q: 'How is my business data kept separate from other businesses?',
    a: 'Every business receives an isolated Cloud Firestore workspace linked strictly to its owner account. Knowledge documents are encrypted on the server before runtime use, and public visitors can never read internal business files, conversation logs, or support tickets.',
  },
  {
    q: 'What happens if the AI does not know the answer or free-tier quota is reached?',
    a: 'The assistant never invents prices or policies. When an answer is missing from your knowledge base—or if free-tier AI limits are reached—it shares your business contact information and offers a Human Support Request form that saves directly to your dashboard.',
  },
];

export function LandingPage({
  isAuthenticated,
  onStartFree,
  onSignIn,
  onExploreDemo,
  onOpenDashboard,
}: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [legalTopic, setLegalTopic] = useState<LegalTopic>(null);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top Bar Contract: Brand wordmark — 5 nav links — 1 primary action */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            AICare
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#languages" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Languages
            </a>
            <a href="#about" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              About
            </a>
            <a href="#faq" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="hidden md:flex items-center shrink-0">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Open Dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 space-y-3">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 py-1"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 py-1"
            >
              How It Works
            </a>
            <a
              href="#languages"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 py-1"
            >
              Languages
            </a>
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-700 py-1"
            >
              About
            </a>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (isAuthenticated) onOpenDashboard();
                else onSignIn();
              }}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              {isAuthenticated ? 'Open Dashboard' : 'Sign In'}
            </button>
          </div>
        )}
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-semibold text-blue-700 tracking-tight mb-3">
                Your Business. Always Answered.
              </p>
              <h1
                className="text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-slate-900 leading-[1.08]"
                style={{ textWrap: 'balance' }}
              >
                Customer Support That Never Sleeps.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Create your own multilingual AI customer assistant. Answer questions, solve customer problems and serve customers through text and voice, around the clock.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={isAuthenticated ? onOpenDashboard : onStartFree}
                  className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  Create Your Free Assistant
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onExploreDemo}
                  className="px-6 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap"
                >
                  Explore Demo
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>5-minute no-code setup</span>
                <span aria-hidden="true">·</span>
                <span>20+ Indian & global languages</span>
                <span aria-hidden="true">·</span>
                <span>Text + Voice + Website widget</span>
              </div>
            </div>

            <div className="lg:col-span-6 flex flex-col">
              <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm flex flex-col">
                <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-800">AICare Workspace Preview</span>
                  <span>Text & Voice Assistant</span>
                </div>
                <div className="relative flex-1 min-h-[280px]">
                  <img
                    src={HERO_PREVIEW_IMAGE}
                    alt="AICare multilingual customer support workspace on a laptop in a bright retail studio"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4 bg-white border-t border-slate-200 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">Knowledge Sources</div>
                    <div className="font-semibold text-slate-900 mt-0.5">PDF · CSV · TXT · DOCX</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Customer Channels</div>
                    <div className="font-semibold text-slate-900 mt-0.5">Web Link & Iframe Widget</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Handover</div>
                    <div className="font-semibold text-slate-900 mt-0.5">Built-in Support Tickets</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Asymmetric Bento Grid */}
        <section id="features" className="bg-slate-50 border-y border-slate-200 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Built for small shops, clinics, and growing online stores
              </h2>
              <p className="mt-3 text-slate-600">
                Everything needed to turn your existing documents and policies into a private, multilingual support desk.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-6">
                <Globe2 className="w-6 h-6 text-blue-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">Multilingual AI Support</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Automatically detects the customer’s language—including Hindi, Gujarati, Telugu, Malayalam, Tamil, Bengali, Mandarin Chinese, Spanish, and Arabic—and replies in the same native script.
                </p>
              </div>

              <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-6">
                <Mic className="w-6 h-6 text-violet-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900">AI Voice Conversations</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Customers can speak naturally without typing. Uses real-time voice streaming with automatic browser speech fallback and seamless context sharing with text chat.
                </p>
              </div>

              <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6">
                <BookOpen className="w-5 h-5 text-blue-600 mb-4" />
                <h3 className="text-base font-semibold text-slate-900">Easy Knowledge-Base Setup</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Paste FAQs and product catalogs or upload PDF, CSV, TXT, and DOCX files. Edit or reprocess entries anytime.
                </p>
              </div>

              <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6">
                <Code2 className="w-5 h-5 text-blue-600 mb-4" />
                <h3 className="text-base font-semibold text-slate-900">Website Chatbot Integration</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Publish to get a shareable chatbot link and a copy-paste iframe widget matched to your brand color and logo.
                </p>
              </div>

              <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6">
                <Headphones className="w-5 h-5 text-violet-700 mb-4" />
                <h3 className="text-base font-semibold text-slate-900">Automated Customer Assistance</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Answers strictly from your verified policies. When human help is needed, customers submit a support ticket straight to your inbox.
                </p>
              </div>

              <div className="md:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-2">
                    <BarChart3 className="w-4 h-4" />
                    Support Analytics & Transcript Controls
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Track real customer questions, top languages, and unanswered gaps
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600">
                    Review conversation logs, manage open and resolved support tickets, and delete transcripts or disable storage whenever you choose.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExploreDemo}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  Try Live Demo Store
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Go from zero to live support in three clear steps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border-t-2 border-slate-900 pt-5">
              <h3 className="text-lg font-semibold text-slate-900">
                01. Add your business knowledge
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Enter your store hours, contact details, product prices, FAQs, or upload your existing PDF, CSV, TXT, and DOCX documents.
              </p>
            </div>
            <div className="border-t-2 border-blue-600 pt-5">
              <h3 className="text-lg font-semibold text-slate-900">
                02. Customize your AI assistant
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Pick your assistant name, welcome greeting, tone, response length, language auto-detection, voice support, and brand color.
              </p>
            </div>
            <div className="border-t-2 border-violet-700 pt-5">
              <h3 className="text-lg font-semibold text-slate-900">
                03. Publish and serve customers
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Test your assistant right in the builder, publish with one click, and share your direct link or embed the floating website widget.
              </p>
            </div>
          </div>
        </section>

        {/* Supported Languages */}
        <section id="languages" className="bg-slate-50 border-y border-slate-200 py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Speak to every customer in their own script
              </h2>
              <p className="mt-3 text-slate-600">
                Customers can switch languages mid-conversation or select their preferred language manually.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {SELECTABLE_PRIMARY_LANGUAGES.map((lang) => (
                <div
                  key={lang.code}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-3"
                >
                  <div className="text-sm font-semibold text-slate-900">{lang.nativeName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {lang.name} · {lang.group}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="max-w-7xl mx-auto px-6 py-20">
          <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Designed for local businesses, built on transparent free-tier technology
              </h2>
              <p className="mt-4 text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
                Small businesses shouldn’t need complex engineering or expensive seat licenses to answer common customer questions after hours. AICare runs on Google Cloud Firestore, Firebase Authentication, and free-tier Gemini models with clear daily usage visibility and zero credit card requirements.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
              <button
                type="button"
                onClick={isAuthenticated ? onOpenDashboard : onStartFree}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition-colors text-center"
              >
                Create Your Free Assistant
              </button>
              <button
                type="button"
                onClick={onExploreDemo}
                className="px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm rounded-xl transition-colors text-center"
              >
                Test GreenLeaf Store Demo
              </button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-4xl mx-auto px-6 pb-24">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {FAQS.map((item, idx) => (
              <details key={idx} className="group py-5">
                <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-slate-900 text-base">
                  <span>{item.q}</span>
                  <span className="text-slate-400 group-open:rotate-45 transition-transform text-xl leading-none">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">
            AICare <span className="font-normal text-slate-500">· Your Business. Always Answered.</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <button type="button" onClick={() => setLegalTopic('privacy')} className="hover:text-slate-900">
              Privacy Policy
            </button>
            <button type="button" onClick={() => setLegalTopic('terms')} className="hover:text-slate-900">
              Terms
            </button>
            <button type="button" onClick={() => setLegalTopic('contact')} className="hover:text-slate-900">
              Contact
            </button>
            <button type="button" onClick={() => setLegalTopic('about')} className="hover:text-slate-900">
              About
            </button>
          </div>
        </div>
      </footer>

      <LegalModal topic={legalTopic} onClose={() => setLegalTopic(null)} />
    </div>
  );
}
