import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import { sendPasswordResetEmail, signOut, updateProfile, type User } from 'firebase/auth';
import type {
  AssistantTone,
  Business,
  ChatMessage,
  Conversation,
  CustomerFeedback,
  KnowledgeItem,
  PublicBotProfile,
  ResponseLength,
  SupportTicket,
  TicketStatus,
  UsageEvent,
  WidgetPosition,
  WidgetSettings,
} from '../types/aicare';
import { auth } from '../lib/firebase';
import {
  deleteConversationAndMessages,
  getConversationMessages,
  getWidgetSettings,
  saveWidgetSettings,
  subscribeBusinessConversations,
  subscribeBusinessFeedbacks,
  subscribeBusinessTickets,
  subscribeBusinessUsageEvents,
  subscribeKnowledgeItems,
  syncPublishedBotRuntime,
  updateBusinessWorkspace,
  updateConversationStatus,
  updateSupportTicket,
  upsertUserProfile,
} from '../lib/firestoreService';
import {
  buildWidgetEmbedSnippet,
  formatUtcDateKey,
  validateBusinessForPublish,
} from '../utils/knowledge';
import { SELECTABLE_PRIMARY_LANGUAGES } from '../utils/languages';
import { CustomerChatbot } from './CustomerChatbot';
import { KnowledgeManager } from './KnowledgeManager';

type DashTab =
  | 'overview'
  | 'assistant'
  | 'knowledge'
  | 'conversations'
  | 'tickets'
  | 'widget'
  | 'analytics'
  | 'settings';

interface DashboardProps {
  user: User;
  businesses: Business[];
  activeBusinessId: string;
  onSelectBusiness: (id: string) => void;
  onCreateNewBusiness: () => void;
  onBackHome: () => void;
}

export function Dashboard({
  user,
  businesses,
  activeBusinessId,
  onSelectBusiness,
  onCreateNewBusiness,
  onBackHome,
}: DashboardProps) {
  const business = useMemo(
    () => businesses.find((b) => b.id === activeBusinessId) || businesses[0],
    [businesses, activeBusinessId]
  );

  const [tab, setTab] = useState<DashTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [feedbacks, setFeedbacks] = useState<CustomerFeedback[]>([]);
  const [widgetSettings, setWidgetSettings] = useState<WidgetSettings | null>(null);

  // Conversations viewer state
  const [convSearch, setConvSearch] = useState('');
  const [convLangFilter, setConvLangFilter] = useState('all');
  const [convDateFilter, setConvDateFilter] = useState('');
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [selectedConvMessages, setSelectedConvMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Tickets state
  const [ticketFilter, setTicketFilter] = useState<'all' | TicketStatus>('all');
  const [ticketNotesDraft, setTicketNotesDraft] = useState<Record<string, string>>({});

  // Assistant config draft
  const [assistantDraft, setAssistantDraft] = useState({
    assistantName: '',
    welcomeMessage: '',
    tone: 'Friendly' as AssistantTone,
    customToneInstructions: '',
    responseLength: 'Balanced' as ResponseLength,
    primaryLanguage: 'English',
    autoDetectLanguage: true,
    voiceEnabled: true,
    brandColor: '#2563EB',
  });

  // Widget config draft
  const [widgetDraft, setWidgetDraft] = useState({
    position: 'bottom-right' as WidgetPosition,
    launcherText: 'Chat with us',
    brandColor: '#2563EB',
  });
  const [previewWidgetOpen, setPreviewWidgetOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string>('');

  // Settings draft
  const [settingsDraft, setSettingsDraft] = useState({
    name: '',
    category: '',
    description: '',
    contactEmail: '',
    contactPhone: '',
    operatingHours: '',
    location: '',
    websiteUrl: '',
    logoUrl: '',
    saveTranscripts: true,
    transcriptRetentionDays: 90,
    dailyAiLimit: 250,
    displayName: user.displayName || '',
  });

  const [savingMsg, setSavingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!business) return;
    setAssistantDraft({
      assistantName: business.assistantName,
      welcomeMessage: business.welcomeMessage,
      tone: business.tone,
      customToneInstructions: business.customToneInstructions || '',
      responseLength: business.responseLength,
      primaryLanguage: business.primaryLanguage,
      autoDetectLanguage: business.autoDetectLanguage,
      voiceEnabled: business.voiceEnabled,
      brandColor: business.brandColor,
    });
    setSettingsDraft({
      name: business.name,
      category: business.category,
      description: business.description,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone || '',
      operatingHours: business.operatingHours,
      location: business.location || '',
      websiteUrl: business.websiteUrl || '',
      logoUrl: business.logoUrl || '',
      saveTranscripts: business.saveTranscripts,
      transcriptRetentionDays: business.transcriptRetentionDays,
      dailyAiLimit: business.dailyAiLimit,
      displayName: user.displayName || '',
    });

    const unsubs = [
      subscribeKnowledgeItems(business.id, user.uid, setKnowledge),
      subscribeBusinessConversations(business.id, user.uid, setConversations),
      subscribeBusinessTickets(business.id, user.uid, setTickets),
      subscribeBusinessUsageEvents(business.id, user.uid, setUsageEvents),
      subscribeBusinessFeedbacks(business.id, user.uid, setFeedbacks),
    ];

    void getWidgetSettings(business.id).then((ws) => {
      setWidgetSettings(ws);
      setWidgetDraft({
        position: ws?.position ?? 'bottom-right',
        launcherText: ws?.launcherText ?? `Ask ${business.assistantName}`,
        brandColor: ws?.brandColor ?? business.brandColor,
      });
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [business?.id, user.uid]);

  if (!business) return null;

  const todayKey = formatUtcDateKey();
  const toJsDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return null;
  };

  // Real metrics derived strictly from stored Firestore docs
  const todayConversations = conversations.filter((c) => {
    const d = toJsDate(c.createdAt);
    return d ? formatUtcDateKey(d) === todayKey : false;
  });
  const weekAgo = Date.now() - 7 * 86_400_000;
  const monthAgo = Date.now() - 30 * 86_400_000;
  const weeklyCount = conversations.filter((c) => {
    const d = toJsDate(c.createdAt);
    return d ? d.getTime() >= weekAgo : false;
  }).length;
  const monthlyCount = conversations.filter((c) => {
    const d = toJsDate(c.createdAt);
    return d ? d.getTime() >= monthAgo : false;
  }).length;

  const unresolvedCount = conversations.filter(
    (c) => c.hadUnanswered || c.status === 'unanswered' || c.status === 'needs_human'
  ).length;
  const openTicketsCount = tickets.filter((t) => t.status !== 'resolved').length;
  const todayUsageCount = usageEvents.filter((u) => u.date === todayKey).length;

  const languageStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of conversations) {
      const lang = c.language || 'Unknown';
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (convLangFilter !== 'all' && c.language !== convLangFilter) return false;
      if (convDateFilter) {
        const d = toJsDate(c.createdAt);
        if (!d || formatUtcDateKey(d) !== convDateFilter) return false;
      }
      if (convSearch.trim()) {
        const q = convSearch.toLowerCase();
        if (
          !c.lastMessagePreview.toLowerCase().includes(q) &&
          !c.language.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [conversations, convLangFilter, convDateFilter, convSearch]);

  const averageRating = useMemo(() => {
    if (feedbacks.length === 0) return null;
    const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
    return (sum / feedbacks.length).toFixed(1);
  }, [feedbacks]);

  const publicChatUrl = `${window.location.origin}/chat/${business.id}`;
  const embedSnippet = buildWidgetEmbedSnippet(
    window.location.origin,
    business.id,
    widgetDraft.position,
    widgetDraft.launcherText,
    widgetDraft.brandColor
  );

  const botProfileForPreview: PublicBotProfile = {
    businessId: business.id,
    ownerId: business.ownerId,
    businessName: business.name,
    category: business.category,
    logoUrl: business.logoUrl,
    assistantName: assistantDraft.assistantName || business.assistantName,
    welcomeMessage: assistantDraft.welcomeMessage || business.welcomeMessage,
    brandColor: assistantDraft.brandColor || business.brandColor,
    primaryLanguage: assistantDraft.primaryLanguage,
    autoDetectLanguage: assistantDraft.autoDetectLanguage,
    voiceEnabled: assistantDraft.voiceEnabled,
    widgetPosition: widgetDraft.position,
    launcherText: widgetDraft.launcherText,
    operatingHours: business.operatingHours,
    supportEmail: business.contactEmail,
    supportPhone: business.contactPhone,
    saveTranscripts: business.saveTranscripts,
    dailyAiLimit: business.dailyAiLimit,
    isPublished: business.isPublished,
  };

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleOpenConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    setLoadingMessages(true);
    try {
      const msgs = await getConversationMessages(conv.id, user.uid);
      setSelectedConvMessages(msgs);
    } catch {
      setSelectedConvMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSaveAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavingMsg('');
    try {
      await updateBusinessWorkspace(business.id, assistantDraft);
      const updated = { ...business, ...assistantDraft };
      await syncPublishedBotRuntime(updated, knowledge, widgetSettings);
      setSavingMsg('AI Assistant configuration saved and synced.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save assistant settings.');
    }
  };

  const handleTogglePublish = async () => {
    setErrorMsg('');
    setSavingMsg('');
    const nextPub = !business.isPublished;
    if (nextPub) {
      const check = validateBusinessForPublish(business, knowledge.length);
      if (!check.valid) {
        setErrorMsg(`Complete before publishing: ${check.missing.join(', ')}.`);
        return;
      }
    }
    try {
      await updateBusinessWorkspace(business.id, { isPublished: nextPub });
      await syncPublishedBotRuntime({ ...business, isPublished: nextPub }, knowledge, widgetSettings);
      setSavingMsg(nextPub ? 'Assistant published live!' : 'Assistant unpublished.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update publish status.');
    }
  };

  const handleSaveWidget = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavingMsg('');
    try {
      await saveWidgetSettings(business.id, user.uid, widgetDraft);
      await updateBusinessWorkspace(business.id, { brandColor: widgetDraft.brandColor });
      const newWs: WidgetSettings = {
        businessId: business.id,
        ownerId: user.uid,
        ...widgetDraft,
      };
      setWidgetSettings(newWs);
      await syncPublishedBotRuntime({ ...business, brandColor: widgetDraft.brandColor }, knowledge, newWs);
      setSavingMsg('Website widget settings saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save widget settings.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSavingMsg('');
    try {
      await updateBusinessWorkspace(business.id, {
        name: settingsDraft.name,
        category: settingsDraft.category,
        description: settingsDraft.description,
        contactEmail: settingsDraft.contactEmail,
        contactPhone: settingsDraft.contactPhone,
        operatingHours: settingsDraft.operatingHours,
        location: settingsDraft.location,
        websiteUrl: settingsDraft.websiteUrl,
        logoUrl: settingsDraft.logoUrl,
        saveTranscripts: settingsDraft.saveTranscripts,
        transcriptRetentionDays: settingsDraft.transcriptRetentionDays,
        dailyAiLimit: settingsDraft.dailyAiLimit,
      });
      if (settingsDraft.displayName.trim() && settingsDraft.displayName.trim() !== user.displayName) {
        await updateProfile(user, { displayName: settingsDraft.displayName.trim() });
        await upsertUserProfile({
          uid: user.uid,
          email: user.email,
          displayName: settingsDraft.displayName.trim(),
        });
      }
      await syncPublishedBotRuntime(
        { ...business, ...settingsDraft },
        knowledge,
        widgetSettings
      );
      setSavingMsg('Business & privacy settings saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const navItems: { id: DashTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare },
    { id: 'tickets', label: 'Support Tickets', icon: Headphones },
    { id: 'widget', label: 'Website Widget', icon: Code2 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackHome}
            className="text-lg font-bold tracking-tight text-slate-900"
          >
            AICare
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden p-1.5 rounded-lg text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspace Switcher */}
        <div className="p-4 border-b border-slate-200 space-y-2">
          <label htmlFor="biz-select" className="block text-[11px] font-medium text-slate-500">
            Active Business
          </label>
          <select
            id="biz-select"
            value={business.id}
            onChange={(e) => onSelectBusiness(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreateNewBusiness}
            className="w-full py-1.5 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg flex items-center justify-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Business Workspace
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Dashboard sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="w-full py-2 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span className="font-semibold text-slate-900">{business.name}</span>
              <span className="mx-2">/</span>
              <span className="capitalize">{tab}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleTogglePublish()}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                business.isPublished
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              }`}
            >
              {business.isPublished ? 'Published (Live)' : 'Publish Assistant'}
            </button>
            {business.isPublished && (
              <a
                href={`/chat/${business.id}`}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
              >
                Open Public Link
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </header>

        <main className="p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {savingMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {savingMsg}
              </span>
              <button
                type="button"
                onClick={() => setSavingMsg('')}
                className="text-xs text-emerald-700"
              >
                Dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex items-center justify-between">
              <span>{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg('')} className="text-xs text-red-700">
                Dismiss
              </button>
            </div>
          )}

          {/* 1. OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Total Conversations</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {conversations.length}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Conversations Today</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {todayConversations.length}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Unresolved / Unanswered</div>
                  <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
                    {unresolvedCount}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Open Support Tickets</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">
                    {openTicketsCount}
                  </div>
                </div>
              </div>

              {/* Free-Tier Usage Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-semibold text-slate-900">
                    Daily Free-Tier AI Usage ({todayKey})
                  </span>
                  <span className="font-mono text-xs text-slate-600 tabular-nums">
                    {todayUsageCount} / {business.dailyAiLimit} requests
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (todayUsageCount / Math.max(1, business.dailyAiLimit)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-slate-900 mb-4">
                    Most-Used Customer Languages
                  </h2>
                  {languageStats.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No stored conversations yet. Share your chatbot link to start tracking customer languages.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {languageStats.slice(0, 6).map((row) => (
                        <div key={row.language} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{row.language}</span>
                          <span className="font-mono text-xs text-slate-900 tabular-nums">
                            {row.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-slate-900">Recent Conversations</h2>
                    <button
                      type="button"
                      onClick={() => setTab('conversations')}
                      className="text-xs text-blue-700 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  {conversations.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No conversations recorded yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {conversations.slice(0, 5).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setTab('conversations');
                            void handleOpenConversation(c);
                          }}
                          className="w-full py-2.5 text-left flex items-center justify-between gap-4 hover:bg-slate-50 rounded-lg px-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {c.lastMessagePreview}
                            </div>
                            <div className="text-xs text-slate-500">
                              {c.language} · {c.channel} · {c.status}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. AI ASSISTANT */}
          {tab === 'assistant' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleSaveAssistant}
                className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
              >
                <h2 className="text-base font-semibold text-slate-900">
                  Assistant Personality & Language
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="da-name" className="block text-xs font-medium text-slate-700 mb-1">
                      Assistant name
                    </label>
                    <input
                      id="da-name"
                      type="text"
                      required
                      value={assistantDraft.assistantName}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({ ...s, assistantName: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="da-color" className="block text-xs font-medium text-slate-700 mb-1">
                      Brand color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="da-color"
                        type="color"
                        value={assistantDraft.brandColor}
                        onChange={(e) =>
                          setAssistantDraft((s) => ({ ...s, brandColor: e.target.value }))
                        }
                        className="h-9 w-12 rounded border border-slate-300"
                      />
                      <span className="font-mono text-xs text-slate-600">
                        {assistantDraft.brandColor}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="da-welcome" className="block text-xs font-medium text-slate-700 mb-1">
                    Welcome message
                  </label>
                  <textarea
                    id="da-welcome"
                    rows={3}
                    required
                    value={assistantDraft.welcomeMessage}
                    onChange={(e) =>
                      setAssistantDraft((s) => ({ ...s, welcomeMessage: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="da-tone" className="block text-xs font-medium text-slate-700 mb-1">
                      Tone
                    </label>
                    <select
                      id="da-tone"
                      value={assistantDraft.tone}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({
                          ...s,
                          tone: e.target.value as AssistantTone,
                        }))
                      }
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
                    <label htmlFor="da-len" className="block text-xs font-medium text-slate-700 mb-1">
                      Response length
                    </label>
                    <select
                      id="da-len"
                      value={assistantDraft.responseLength}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({
                          ...s,
                          responseLength: e.target.value as ResponseLength,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Short">Short</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Detailed">Detailed</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="da-lang" className="block text-xs font-medium text-slate-700 mb-1">
                      Primary language
                    </label>
                    <select
                      id="da-lang"
                      value={assistantDraft.primaryLanguage}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({ ...s, primaryLanguage: e.target.value }))
                      }
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

                {assistantDraft.tone === 'Custom' && (
                  <div>
                    <label htmlFor="da-ctone" className="block text-xs font-medium text-slate-700 mb-1">
                      Custom tone instructions
                    </label>
                    <input
                      id="da-ctone"
                      type="text"
                      value={assistantDraft.customToneInstructions}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({
                          ...s,
                          customToneInstructions: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={assistantDraft.autoDetectLanguage}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({
                          ...s,
                          autoDetectLanguage: e.target.checked,
                        }))
                      }
                    />
                    Automatically detect customer language
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={assistantDraft.voiceEnabled}
                      onChange={(e) =>
                        setAssistantDraft((s) => ({ ...s, voiceEnabled: e.target.checked }))
                      }
                    />
                    Enable voice conversations
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                >
                  Save Assistant Changes
                </button>
              </form>

              <div className="lg:col-span-6">
                <CustomerChatbot bot={botProfileForPreview} ownerTestMode />
              </div>
            </div>
          )}

          {/* 3. KNOWLEDGE BASE */}
          {tab === 'knowledge' && (
            <KnowledgeManager business={business} items={knowledge} />
          )}

          {/* 4. CONVERSATIONS */}
          {tab === 'conversations' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="search"
                      value={convSearch}
                      onChange={(e) => setConvSearch(e.target.value)}
                      placeholder="Search messages or language..."
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Filter by language"
                      value={convLangFilter}
                      onChange={(e) => setConvLangFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="all">All languages</option>
                      {languageStats.map((l) => (
                        <option key={l.language} value={l.language}>
                          {l.language}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      aria-label="Filter by date"
                      value={convDateFilter}
                      onChange={(e) => setConvDateFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">
                      No matching conversations found.
                    </div>
                  ) : (
                    filteredConversations.map((c) => (
                      <div
                        key={c.id}
                        className={`p-4 flex items-start justify-between gap-2 hover:bg-slate-50 ${
                          selectedConv?.id === c.id ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleOpenConversation(c)}
                          className="text-left flex-1 min-w-0"
                        >
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {c.lastMessagePreview}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {c.language} · {c.channel} · {c.status}
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete conversation ${c.id}`}
                          onClick={() => {
                            void deleteConversationAndMessages(c.id, user.uid);
                            if (selectedConv?.id === c.id) {
                              setSelectedConv(null);
                              setSelectedConvMessages([]);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 min-h-[420px]">
                {!selectedConv ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    Select a conversation on the left to inspect its transcript.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Conversation ({selectedConv.language})
                        </div>
                        <div className="text-xs text-slate-500">
                          Channel: {selectedConv.channel}
                        </div>
                      </div>
                      <select
                        aria-label="Conversation status"
                        value={selectedConv.status}
                        onChange={(e) => {
                          const st = e.target.value as Conversation['status'];
                          void updateConversationStatus(selectedConv.id, st);
                          setSelectedConv({ ...selectedConv, status: st });
                        }}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="active">Active</option>
                        <option value="resolved">Resolved</option>
                        <option value="needs_human">Needs Human</option>
                        <option value="unanswered">Unanswered</option>
                      </select>
                    </div>

                    {loadingMessages ? (
                      <div className="text-sm text-slate-500">Loading messages...</div>
                    ) : (
                      <div className="space-y-3 max-h-[440px] overflow-y-auto">
                        {selectedConvMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`p-3 rounded-xl text-sm ${
                              m.role === 'customer'
                                ? 'bg-blue-50 text-slate-900 ml-8'
                                : 'bg-slate-100 text-slate-900 mr-8'
                            }`}
                          >
                            <div className="text-[11px] font-semibold text-slate-500 mb-1">
                              {m.role === 'customer' ? 'Customer' : business.assistantName} · {m.mode}
                              {m.unanswered ? ' · Unanswered gap' : ''}
                            </div>
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. SUPPORT TICKETS */}
          {tab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Customer Handover Tickets ({tickets.length})
                </h2>
                <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
                  {(['all', 'open', 'in_progress', 'resolved'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setTicketFilter(f)}
                      className={`px-3 py-1 text-xs font-medium rounded-md capitalize ${
                        ticketFilter === f ? 'bg-slate-900 text-white' : 'text-slate-600'
                      }`}
                    >
                      {f.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {tickets.filter((t) => ticketFilter === 'all' || t.status === ticketFilter).length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  No support tickets in this view. Customers can request human help directly inside your chatbot.
                </div>
              ) : (
                <div className="space-y-4">
                  {tickets
                    .filter((t) => ticketFilter === 'all' || t.status === ticketFilter)
                    .map((t) => (
                      <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {t.category} — {t.customerName || 'Customer'} ({t.customerEmail})
                            </div>
                            {t.customerPhone && (
                              <div className="text-xs text-slate-500 mt-0.5">
                                Phone: {t.customerPhone}
                              </div>
                            )}
                          </div>
                          <select
                            aria-label={`Status for ticket ${t.id}`}
                            value={t.status}
                            onChange={(e) => {
                              void updateSupportTicket(t.id, {
                                status: e.target.value as TicketStatus,
                                internalNotes: ticketNotesDraft[t.id] ?? t.internalNotes,
                              });
                            }}
                            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>

                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.description}</p>

                        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Add internal team notes..."
                            value={ticketNotesDraft[t.id] ?? t.internalNotes}
                            onChange={(e) =>
                              setTicketNotesDraft((d) => ({ ...d, [t.id]: e.target.value }))
                            }
                            className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void updateSupportTicket(t.id, {
                                status: t.status,
                                internalNotes: ticketNotesDraft[t.id] ?? t.internalNotes,
                              }).then(() => setSavingMsg('Ticket notes updated.'))
                            }
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                          >
                            Save Notes
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* 6. WEBSITE WIDGET */}
          {tab === 'widget' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 space-y-6">
                <form
                  onSubmit={handleSaveWidget}
                  className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
                >
                  <h2 className="text-base font-semibold text-slate-900">
                    Customize Website Widget
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="w-pos" className="block text-xs font-medium text-slate-700 mb-1">
                        Widget position
                      </label>
                      <select
                        id="w-pos"
                        value={widgetDraft.position}
                        onChange={(e) =>
                          setWidgetDraft((s) => ({
                            ...s,
                            position: e.target.value as WidgetPosition,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="bottom-right">Bottom Right</option>
                        <option value="bottom-left">Bottom Left</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="w-color" className="block text-xs font-medium text-slate-700 mb-1">
                        Brand color
                      </label>
                      <input
                        id="w-color"
                        type="color"
                        value={widgetDraft.brandColor}
                        onChange={(e) =>
                          setWidgetDraft((s) => ({ ...s, brandColor: e.target.value }))
                        }
                        className="h-9 w-16 rounded border border-slate-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="w-text" className="block text-xs font-medium text-slate-700 mb-1">
                      Chat launcher button text
                    </label>
                    <input
                      id="w-text"
                      type="text"
                      required
                      value={widgetDraft.launcherText}
                      onChange={(e) =>
                        setWidgetDraft((s) => ({ ...s, launcherText: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
                  >
                    Save Widget Appearance
                  </button>
                </form>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Direct Chatbot Link</h3>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={publicChatUrl}
                        aria-label="Direct public chatbot URL"
                        className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopy('url', publicChatUrl)}
                        className="px-3 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg inline-flex items-center gap-1"
                      >
                        {copiedKey === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'url' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-900">Website Embed Code</h3>
                      <button
                        type="button"
                        onClick={() => void handleCopy('embed', embedSnippet)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg inline-flex items-center gap-1"
                      >
                        {copiedKey === 'embed' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'embed' ? 'Copied Embed Code' : 'Copy Embed Code'}
                      </button>
                    </div>
                    <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56">
                      {embedSnippet}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Interactive Widget Preview */}
              <div className="lg:col-span-6 bg-slate-100 border border-slate-200 rounded-2xl p-5 min-h-[560px] relative flex flex-col justify-between overflow-hidden">
                <div className="text-xs font-medium text-slate-500">
                  Interactive Widget Preview ({business.isPublished ? 'Published Live' : 'Draft Preview — Publish to activate publicly'})
                </div>

                {previewWidgetOpen && (
                  <div className="my-3 flex-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden h-[440px]">
                    <CustomerChatbot
                      bot={botProfileForPreview}
                      channel="widget"
                      compact
                      ownerTestMode
                      onClose={() => setPreviewWidgetOpen(false)}
                    />
                  </div>
                )}

                <div
                  className={`flex ${
                    widgetDraft.position === 'bottom-left' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewWidgetOpen((v) => !v)}
                    className="px-5 py-3 rounded-full text-white text-sm font-semibold shadow-lg transition-transform active:scale-95"
                    style={{ backgroundColor: widgetDraft.brandColor }}
                  >
                    {previewWidgetOpen ? 'Close Preview' : widgetDraft.launcherText}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 7. ANALYTICS */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Daily Conversations</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {todayConversations.length}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Weekly Conversations (7d)</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {weeklyCount}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Monthly Conversations (30d)</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {monthlyCount}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="text-xs text-slate-500">Customer Rating</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {averageRating ? `${averageRating} / 5` : 'No ratings yet'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {feedbacks.length} feedback submission{feedbacks.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-slate-900 mb-4">
                    Language Distribution (Stored Conversations)
                  </h2>
                  {languageStats.length === 0 ? (
                    <p className="text-sm text-slate-500">No conversation language data yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {languageStats.map((item) => {
                        const pct = Math.round((item.count / Math.max(1, conversations.length)) * 100);
                        return (
                          <div key={item.language}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium text-slate-800">{item.language}</span>
                              <span className="font-mono text-slate-600 tabular-nums">
                                {item.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                  <h2 className="text-sm font-semibold text-slate-900 mb-4">
                    Unanswered Questions & Common Ticket Categories
                  </h2>
                  {conversations.filter((c) => c.hadUnanswered).length === 0 && tickets.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No unanswered questions or support ticket trends recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {conversations
                        .filter((c) => c.hadUnanswered)
                        .slice(0, 5)
                        .map((c) => (
                          <div
                            key={c.id}
                            className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-slate-800"
                          >
                            <span className="font-semibold text-amber-800">Unanswered: </span>
                            {c.lastMessagePreview}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8. SETTINGS */}
          {tab === 'settings' && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 max-w-3xl"
            >
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Business, Privacy & Account Settings
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Manage contact details, transcript storage privacy, daily AI quota limits, and account preferences.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="st-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Business name
                  </label>
                  <input
                    id="st-name"
                    type="text"
                    required
                    value={settingsDraft.name}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="st-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="st-cat"
                    type="text"
                    required
                    value={settingsDraft.category}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="st-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Support contact email
                  </label>
                  <input
                    id="st-email"
                    type="email"
                    required
                    value={settingsDraft.contactEmail}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({ ...s, contactEmail: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="st-phone" className="block text-xs font-medium text-slate-700 mb-1">
                    Support phone
                  </label>
                  <input
                    id="st-phone"
                    type="tel"
                    value={settingsDraft.contactPhone}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({ ...s, contactPhone: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="st-hours" className="block text-xs font-medium text-slate-700 mb-1">
                    Operating hours
                  </label>
                  <input
                    id="st-hours"
                    type="text"
                    required
                    value={settingsDraft.operatingHours}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({ ...s, operatingHours: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="st-logo" className="block text-xs font-medium text-slate-700 mb-1">
                    Logo URL
                  </label>
                  <input
                    id="st-logo"
                    type="url"
                    value={settingsDraft.logoUrl}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, logoUrl: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Privacy & Free-Tier Usage Safeguards
                </h3>
                <label className="flex items-center gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.saveTranscripts}
                    onChange={(e) =>
                      setSettingsDraft((s) => ({ ...s, saveTranscripts: e.target.checked }))
                    }
                  />
                  Save customer conversation transcripts for dashboard review
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="st-ret" className="block text-xs font-medium text-slate-700 mb-1">
                      Transcript retention (days)
                    </label>
                    <input
                      id="st-ret"
                      type="number"
                      min={1}
                      max={365}
                      value={settingsDraft.transcriptRetentionDays}
                      onChange={(e) =>
                        setSettingsDraft((s) => ({
                          ...s,
                          transcriptRetentionDays: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="st-limit" className="block text-xs font-medium text-slate-700 mb-1">
                      Daily AI request cap (per business)
                    </label>
                    <input
                      id="st-limit"
                      type="number"
                      min={1}
                      max={10000}
                      value={settingsDraft.dailyAiLimit}
                      onChange={(e) =>
                        setSettingsDraft((s) => ({
                          ...s,
                          dailyAiLimit: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Account Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label htmlFor="st-dname" className="block text-xs font-medium text-slate-700 mb-1">
                      Owner display name
                    </label>
                    <input
                      id="st-dname"
                      type="text"
                      value={settingsDraft.displayName}
                      onChange={(e) =>
                        setSettingsDraft((s) => ({ ...s, displayName: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  {user.email && (
                    <button
                      type="button"
                      onClick={() => {
                        void sendPasswordResetEmail(auth, user.email!)
                          .then(() => setSavingMsg('Password reset email sent to your inbox.'))
                          .catch((e) => setErrorMsg(e.message));
                      }}
                      className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      Send Password Reset Email
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"
              >
                Save All Settings
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
