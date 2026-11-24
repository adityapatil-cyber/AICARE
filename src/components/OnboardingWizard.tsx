import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Globe2,
  Rocket,
} from 'lucide-react';
import type {
  AssistantTone,
  Business,
  KnowledgeItem,
  PublicBotProfile,
  ResponseLength,
} from '../types/aicare';
import {
  createBusinessWorkspace,
  subscribeKnowledgeItems,
  syncPublishedBotRuntime,
  updateBusinessWorkspace,
} from '../lib/firestoreService';
import { validateBusinessForPublish } from '../utils/knowledge';
import { SELECTABLE_PRIMARY_LANGUAGES } from '../utils/languages';
import { CustomerChatbot } from './CustomerChatbot';
import { KnowledgeManager } from './KnowledgeManager';

interface OnboardingWizardProps {
  userId: string;
  userEmail: string;
  existingBusiness?: Business | null;
  onComplete: (businessId: string) => void;
  onCancel?: () => void;
}

export function OnboardingWizard({
  userId,
  userEmail,
  existingBusiness,
  onComplete,
  onCancel,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<number>(existingBusiness?.onboardingStep || 1);
  const [business, setBusiness] = useState<Business | null>(existingBusiness || null);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1 fields
  const [name, setName] = useState(existingBusiness?.name || '');
  const [category, setCategory] = useState(existingBusiness?.category || 'Local Retail Shop');
  const [description, setDescription] = useState(existingBusiness?.description || '');
  const [websiteUrl, setWebsiteUrl] = useState(existingBusiness?.websiteUrl || '');
  const [contactEmail, setContactEmail] = useState(
    existingBusiness?.contactEmail || userEmail || ''
  );
  const [contactPhone, setContactPhone] = useState(existingBusiness?.contactPhone || '');
  const [operatingHours, setOperatingHours] = useState(
    existingBusiness?.operatingHours || 'Monday–Saturday: 9:00 AM – 7:00 PM'
  );
  const [location, setLocation] = useState(existingBusiness?.location || '');
  const [logoUrl, setLogoUrl] = useState(existingBusiness?.logoUrl || '');

  // Step 3 fields
  const [assistantName, setAssistantName] = useState(
    existingBusiness?.assistantName || 'CareBot'
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    existingBusiness?.welcomeMessage ||
      'Hello! How can I help you today? Feel free to ask in your preferred language.'
  );
  const [tone, setTone] = useState<AssistantTone>(existingBusiness?.tone || 'Friendly');
  const [customToneInstructions, setCustomToneInstructions] = useState(
    existingBusiness?.customToneInstructions || ''
  );
  const [responseLength, setResponseLength] = useState<ResponseLength>(
    existingBusiness?.responseLength || 'Balanced'
  );
  const [primaryLanguage, setPrimaryLanguage] = useState(
    existingBusiness?.primaryLanguage || 'English'
  );
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(
    existingBusiness?.autoDetectLanguage ?? true
  );
  const [voiceEnabled, setVoiceEnabled] = useState(existingBusiness?.voiceEnabled ?? true);
  const [brandColor, setBrandColor] = useState(existingBusiness?.brandColor || '#2563EB');

  useEffect(() => {
    if (!business) return;
    return subscribeKnowledgeItems(business.id, userId, setKnowledgeItems);
  }, [business?.id, userId]);

  const handleSaveStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !category.trim() || !contactEmail.trim() || !operatingHours.trim()) {
      setError('Please complete Business Name, Category, Contact Email, and Operating Hours.');
      return;
    }

    setSaving(true);
    try {
      if (!business) {
        const created = await createBusinessWorkspace(userId, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim() || `${name.trim()} customer support workspace`,
          websiteUrl: websiteUrl.trim() || undefined,
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          operatingHours: operatingHours.trim(),
          location: location.trim() || undefined,
          logoUrl: logoUrl.trim() || undefined,
          assistantName: `${name.trim()} Assistant`,
          welcomeMessage: `Welcome to ${name.trim()}! How can I help you today?`,
          tone: 'Friendly',
          responseLength: 'Balanced',
          primaryLanguage: 'English',
          autoDetectLanguage: true,
          voiceEnabled: true,
          brandColor: '#2563EB',
          saveTranscripts: true,
          transcriptRetentionDays: 90,
          dailyAiLimit: 250,
          isPublished: false,
          onboardingStep: 2,
        });
        setBusiness(created);
        setAssistantName(created.assistantName);
        setWelcomeMessage(created.welcomeMessage);
        await syncPublishedBotRuntime(created, []);
      } else {
        await updateBusinessWorkspace(business.id, {
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          websiteUrl: websiteUrl.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          operatingHours: operatingHours.trim(),
          location: location.trim(),
          logoUrl: logoUrl.trim(),
          onboardingStep: Math.max(business.onboardingStep, 2),
        });
        const updated = {
          ...business,
          name: name.trim(),
          category: category.trim(),
          description: description.trim(),
          websiteUrl: websiteUrl.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          operatingHours: operatingHours.trim(),
          location: location.trim(),
          logoUrl: logoUrl.trim(),
        };
        setBusiness(updated);
        await syncPublishedBotRuntime(updated, knowledgeItems);
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business details.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    setError('');
    if (!assistantName.trim() || !welcomeMessage.trim()) {
      setError('Assistant name and welcome message are required.');
      return;
    }

    setSaving(true);
    try {
      await updateBusinessWorkspace(business.id, {
        assistantName: assistantName.trim(),
        welcomeMessage: welcomeMessage.trim(),
        tone,
        customToneInstructions: customToneInstructions.trim(),
        responseLength,
        primaryLanguage,
        autoDetectLanguage,
        voiceEnabled,
        brandColor,
        onboardingStep: 4,
      });
      const updated: Business = {
        ...business,
        assistantName: assistantName.trim(),
        welcomeMessage: welcomeMessage.trim(),
        tone,
        customToneInstructions: customToneInstructions.trim(),
        responseLength,
        primaryLanguage,
        autoDetectLanguage,
        voiceEnabled,
        brandColor,
        onboardingStep: 4,
      };
      setBusiness(updated);
      await syncPublishedBotRuntime(updated, knowledgeItems);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save assistant personality.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!business) return;
    const validation = validateBusinessForPublish(business, knowledgeItems.length);
    if (!validation.valid) {
      setError(`Before publishing, please complete: ${validation.missing.join(', ')}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateBusinessWorkspace(business.id, { isPublished: true, onboardingStep: 4 });
      const publishedBiz = { ...business, isPublished: true, onboardingStep: 4 };
      await syncPublishedBotRuntime(publishedBiz, knowledgeItems);
      onComplete(business.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish assistant.');
    } finally {
      setSaving(false);
    }
  };

  const publishCheck = validateBusinessForPublish(business || {}, knowledgeItems.length);

  const testBotProfile: PublicBotProfile | null = business
    ? {
        businessId: business.id,
        ownerId: business.ownerId,
        businessName: business.name,
        category: business.category,
        logoUrl: business.logoUrl,
        assistantName,
        welcomeMessage,
        brandColor,
        primaryLanguage,
        autoDetectLanguage,
        voiceEnabled,
        widgetPosition: 'bottom-right',
        launcherText: `Ask ${assistantName}`,
        operatingHours: business.operatingHours,
        supportEmail: business.contactEmail,
        supportPhone: business.contactPhone,
        saveTranscripts: business.saveTranscripts,
        dailyAiLimit: business.dailyAiLimit,
        isPublished: business.isPublished,
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-blue-700">AICare Onboarding</span>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
              Set up your AI customer assistant
            </h1>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Back to Dashboard
            </button>
          )}
        </div>

        {/* Stepper */}
        <div className="grid grid-cols-4 gap-2 bg-white border border-slate-200 rounded-xl p-2">
          {[
            { num: 1, label: '01. Business' },
            { num: 2, label: '02. Knowledge' },
            { num: 3, label: '03. Personality' },
            { num: 4, label: '04. Test & Publish' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              disabled={item.num > 1 && !business}
              onClick={() => setStep(item.num)}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors text-center truncate ${
                step === item.num
                  ? 'bg-slate-900 text-white'
                  : item.num < step
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-50 disabled:opacity-40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Business Details */}
        {step === 1 && (
          <form
            onSubmit={handleSaveStep1}
            className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tell us about your business</h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Required fields help your assistant provide accurate hours and human handover contact details.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ob-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Business name *
                </label>
                <input
                  id="ob-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Sunrise Bakery"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="ob-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Business category *
                </label>
                <input
                  id="ob-cat"
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Online Store, Dental Clinic, Salon"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ob-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Short business description
              </label>
              <textarea
                id="ob-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What do you sell or what services do you provide?"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ob-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Business contact email *
                </label>
                <input
                  id="ob-email"
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="support@yourbusiness.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ob-hours" className="block text-xs font-medium text-slate-700 mb-1">
                  Operating hours *
                </label>
                <input
                  id="ob-hours"
                  type="text"
                  required
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="Mon–Sat 9:00 AM – 7:00 PM"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="ob-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Phone number (optional)
                </label>
                <input
                  id="ob-phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ob-web" className="block text-xs font-medium text-slate-700 mb-1">
                  Website URL (optional)
                </label>
                <input
                  id="ob-web"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourbusiness.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ob-loc" className="block text-xs font-medium text-slate-700 mb-1">
                  Store location / address (optional)
                </label>
                <input
                  id="ob-loc"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="123 Main Market Road"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ob-logo" className="block text-xs font-medium text-slate-700 mb-1">
                  Logo URL (optional)
                </label>
                <input
                  id="ob-logo"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl inline-flex items-center gap-2"
              >
                {saving ? 'Saving...' : 'Save & Continue to Knowledge Base'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Knowledge Base */}
        {step === 2 && business && (
          <div className="space-y-6">
            <KnowledgeManager business={business} items={knowledgeItems} />

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl inline-flex items-center gap-2"
              >
                Continue to AI Personality
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Personality & Preview */}
        {step === 3 && business && (
          <form onSubmit={handleSaveStep3} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Customize your AI assistant</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ob-aname" className="block text-xs font-medium text-slate-700 mb-1">
                    Assistant name *
                  </label>
                  <input
                    id="ob-aname"
                    type="text"
                    required
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="ob-color" className="block text-xs font-medium text-slate-700 mb-1">
                    Brand color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="ob-color"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-9 w-12 rounded border border-slate-300 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-600">{brandColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="ob-welcome" className="block text-xs font-medium text-slate-700 mb-1">
                  Welcome message *
                </label>
                <textarea
                  id="ob-welcome"
                  rows={2}
                  required
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ob-tone" className="block text-xs font-medium text-slate-700 mb-1">
                    Tone
                  </label>
                  <select
                    id="ob-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as AssistantTone)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Friendly">Friendly</option>
                    <option value="Professional">Professional</option>
                    <option value="Casual">Casual</option>
                    <option value="Formal">Formal</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ob-len" className="block text-xs font-medium text-slate-700 mb-1">
                    Response length
                  </label>
                  <select
                    id="ob-len"
                    value={responseLength}
                    onChange={(e) => setResponseLength(e.target.value as ResponseLength)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Short">Short</option>
                    <option value="Balanced">Balanced</option>
                    <option value="Detailed">Detailed</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ob-lang" className="block text-xs font-medium text-slate-700 mb-1">
                    Primary language
                  </label>
                  <select
                    id="ob-lang"
                    value={primaryLanguage}
                    onChange={(e) => setPrimaryLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {SELECTABLE_PRIMARY_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.name}>
                        {l.name} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {tone === 'Custom' && (
                <div>
                  <label htmlFor="ob-ctone" className="block text-xs font-medium text-slate-700 mb-1">
                    Custom tone instructions
                  </label>
                  <input
                    id="ob-ctone"
                    type="text"
                    value={customToneInstructions}
                    onChange={(e) => setCustomToneInstructions(e.target.value)}
                    placeholder="e.g., Warm local neighborhood tone, concise bullet points"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="space-y-2.5 pt-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDetectLanguage}
                    onChange={(e) => setAutoDetectLanguage(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Automatically detect customer language and reply in the same script
                </label>
                <label className="flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={voiceEnabled}
                    onChange={(e) => setVoiceEnabled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Enable voice conversations for customers
                </label>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl inline-flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl inline-flex items-center gap-2"
                >
                  {saving ? 'Saving...' : 'Save & Test Assistant'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Preview Card */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
              <div
                className="px-4 py-3 text-white flex items-center justify-between"
                style={{ backgroundColor: brandColor }}
              >
                <div>
                  <div className="text-sm font-semibold">{assistantName || 'Assistant'}</div>
                  <div className="text-xs text-white/85">{business.name}</div>
                </div>
                <Globe2 className="w-4 h-4 text-white/85" />
              </div>
              <div className="p-5 flex-1 bg-slate-50 space-y-3">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-3.5 text-sm text-slate-800 max-w-[90%]">
                  {welcomeMessage}
                </div>
                <div className="text-xs text-slate-500 pt-2">
                  Tone: {tone} · Length: {responseLength} · Voice: {voiceEnabled ? 'On' : 'Off'}
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Step 4: Test & Publish */}
        {step === 4 && business && testBotProfile && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Ready to publish?</h2>
              <p className="text-sm text-slate-600">
                Test your assistant on the right using your real business knowledge. Once all required checks pass, publish to get your public link and website embed snippet.
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      business.name && business.contactEmail ? 'text-emerald-600' : 'text-slate-300'
                    }`}
                  />
                  <span>Business details configured</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2
                    className={`w-4 h-4 ${
                      knowledgeItems.length > 0 ? 'text-emerald-600' : 'text-amber-500'
                    }`}
                  />
                  <span>
                    Knowledge base items: <strong className="tabular-nums">{knowledgeItems.length}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>AI personality & language configured</span>
                </div>
              </div>

              {!publishCheck.valid && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Missing before publishing: {publishCheck.missing.join(', ')}.
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={saving || !publishCheck.valid}
                  onClick={() => void handlePublish()}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Rocket className="w-4 h-4" />
                  {saving ? 'Publishing...' : 'Publish Assistant & Open Dashboard'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full py-2 px-4 text-xs font-medium text-slate-700 border border-slate-300 rounded-xl"
                >
                  Add More Knowledge First
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <CustomerChatbot bot={testBotProfile} ownerTestMode />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
