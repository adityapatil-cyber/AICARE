import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Headphones,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import type { PublicBotProfile } from '../types/aicare';
import { auth } from '../lib/firebase';
import {
  appendConversationMessage,
  createConversationRecord,
  createSupportTicket,
  makeSafeId,
  recordUsageEvent,
  submitCustomerFeedback,
} from '../lib/firestoreService';
import { findLanguageByNameOrCode, SUPPORTED_LANGUAGES } from '../utils/languages';

interface LocalMessage {
  id: string;
  role: 'customer' | 'assistant';
  content: string;
  language: string;
  mode: 'text' | 'voice';
  unanswered?: boolean;
  suggestHuman?: boolean;
  followUps?: string[];
}

interface CustomerChatbotProps {
  bot: PublicBotProfile;
  channel?: 'text' | 'widget';
  onClose?: () => void;
  compact?: boolean;
  ownerTestMode?: boolean;
  externalPrompt?: { id: number; text: string } | null;
}

function pcm16ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export function CustomerChatbot({
  bot,
  channel = 'text',
  onClose,
  compact = false,
  ownerTestMode = false,
  externalPrompt = null,
}: CustomerChatbotProps) {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [selectedLang, setSelectedLang] = useState<string>(
    bot.autoDetectLanguage ? 'auto' : bot.primaryLanguage
  );
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: bot.welcomeMessage,
      language: bot.primaryLanguage,
      mode: 'text',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [ticketSubmittedId, setTicketSubmittedId] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<number>(0);
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  // Handover form state
  const [ticketName, setTicketName] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketPhone, setTicketPhone] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Product or Pricing Question');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState('');

  // Voice state
  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'connecting' | 'listening' | 'processing' | 'speaking'
  >('idle');
  const [voiceEngine, setVoiceEngine] = useState<'live' | 'browser' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [liveInputTranscript, setLiveInputTranscript] = useState('');
  const [liveOutputTranscript, setLiveOutputTranscript] = useState('');

  const conversationIdRef = useRef<string>(makeSafeId('conv'));
  const conversationCreatedRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice refs to avoid stale closures in audio callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const messagesRef = useRef<LocalMessage[]>(messages);
  messagesRef.current = messages;
  const lastExternalPromptIdRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveInputTranscript, liveOutputTranscript, showHandoverForm]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const persistTurnToFirestore = async (
    customerMsg: LocalMessage,
    assistantMsg: LocalMessage,
    detectedLang: string,
    eventType: 'text' | 'voice'
  ) => {
    if (bot.isDemo || !bot.saveTranscripts) return;
    try {
      if (!conversationCreatedRef.current) {
        await createConversationRecord({
          conversationId: conversationIdRef.current,
          businessId: bot.businessId,
          ownerId: bot.ownerId,
          channel: channel === 'widget' ? 'widget' : eventType,
          language: detectedLang,
          status: assistantMsg.unanswered ? 'unanswered' : assistantMsg.suggestHuman ? 'needs_human' : 'active',
          lastMessagePreview: customerMsg.content.slice(0, 200),
          hadUnanswered: Boolean(assistantMsg.unanswered),
        });
        conversationCreatedRef.current = true;
      }

      await appendConversationMessage({
        conversationId: conversationIdRef.current,
        businessId: bot.businessId,
        ownerId: bot.ownerId,
        role: 'customer',
        content: customerMsg.content,
        language: detectedLang,
        mode: eventType,
        unanswered: false,
      });

      await appendConversationMessage({
        conversationId: conversationIdRef.current,
        businessId: bot.businessId,
        ownerId: bot.ownerId,
        role: 'assistant',
        content: assistantMsg.content,
        language: detectedLang,
        mode: eventType,
        unanswered: Boolean(assistantMsg.unanswered),
      });

      await recordUsageEvent({
        businessId: bot.businessId,
        ownerId: bot.ownerId,
        eventType,
        language: detectedLang,
      });
    } catch (err) {
      // Do not break customer chat if Firestore quota/network rejects telemetry
      console.error('Transcript persistence skipped:', err);
    }
  };

  const sendMessageText = async (
    textToSend: string,
    originMode: 'text' | 'voice' = 'text'
  ): Promise<{ reply: string; detectedLanguage: string } | null> => {
    const clean = textToSend.trim();
    if (!clean || quotaPaused) return null;

    setErrorMsg('');
    const customerMsg: LocalMessage = {
      id: makeSafeId('u'),
      role: 'customer',
      content: clean,
      language: selectedLang === 'auto' ? bot.primaryLanguage : selectedLang,
      mode: originMode,
    };

    const nextHistory = [...messagesRef.current, customerMsg];
    setMessages(nextHistory);
    if (originMode === 'text') setInput('');
    setSending(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerTestMode && auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: bot.businessId,
          message: clean,
          preferredLanguage: selectedLang,
          history: messagesRef.current
            .filter((m) => m.id !== 'welcome')
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await resp.json();
      if (!resp.ok || data.quotaExceeded) {
        if (data.quotaExceeded) {
          setQuotaPaused(true);
          setShowHandoverForm(true);
          if (!bot.isDemo && bot.saveTranscripts) {
            void recordUsageEvent({
              businessId: bot.businessId,
              ownerId: bot.ownerId,
              eventType: 'quota_hit',
              language: selectedLang,
            }).catch(() => undefined);
          }
        }
        setErrorMsg(
          data.error ||
            'The assistant could not answer right now. Please try again or submit a support request.'
        );
        return null;
      }

      const assistantMsg: LocalMessage = {
        id: makeSafeId('a'),
        role: 'assistant',
        content: data.reply,
        language: data.detectedLanguage || bot.primaryLanguage,
        mode: originMode,
        unanswered: Boolean(data.unanswered),
        suggestHuman: Boolean(data.suggestHuman),
        followUps: Array.isArray(data.suggestedFollowUps) ? data.suggestedFollowUps : [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
      void persistTurnToFirestore(customerMsg, assistantMsg, assistantMsg.language, originMode);

      return { reply: assistantMsg.content, detectedLanguage: assistantMsg.language };
    } catch {
      setErrorMsg('Network error reaching the support assistant. Please check your connection.');
      return null;
    } finally {
      setSending(false);
    }
  };

  const sendMessageTextRef = useRef(sendMessageText);
  sendMessageTextRef.current = sendMessageText;

  useEffect(() => {
    if (!externalPrompt || !externalPrompt.text.trim()) return;
    if (lastExternalPromptIdRef.current === externalPrompt.id) return;
    lastExternalPromptIdRef.current = externalPrompt.id;
    stopVoiceSession();
    setMode('text');
    void sendMessageTextRef.current(externalPrompt.text, 'text');
  }, [externalPrompt]);

  const speakText = async (text: string, languageHint: string) => {
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, businessId: bot.businessId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          await audio.play();
          return;
        }
      }
    } catch {
      // Fall through to browser speechSynthesis
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const langObj = findLanguageByNameOrCode(languageHint);
      utter.lang = langObj.bcp47;
      window.speechSynthesis.speak(utter);
    }
  };

  const stopVoiceSession = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => undefined);
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => undefined);
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setVoiceStatus('idle');
    setVoiceEngine(null);
    setLiveInputTranscript('');
    setLiveOutputTranscript('');
  };

  const startBrowserVoiceFallback = async () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setVoiceNotice(
        'Live voice and browser speech recognition are not supported in this browser. Please use Text mode to chat.'
      );
      setVoiceStatus('idle');
      return;
    }

    const langObj =
      selectedLang === 'auto'
        ? findLanguageByNameOrCode(bot.primaryLanguage)
        : findLanguageByNameOrCode(selectedLang);

    if (!langObj.browserSttCommon) {
      setVoiceNotice(
        `Browser speech recognition for ${langObj.name} may have limited support depending on your device. You can switch to Text mode at any time.`
      );
    } else {
      setVoiceNotice('Using browser speech recognition + AI voice reply mode.');
    }

    setVoiceEngine('browser');
    setVoiceStatus('listening');

    const recognition = new SpeechRec();
    recognition.lang = langObj.bcp47;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    recognition.onresult = async (event: any) => {
      if (isMutedRef.current) return;
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }
      if (interim) setLiveInputTranscript(interim);
      if (finalText.trim()) {
        setLiveInputTranscript('');
        setVoiceStatus('processing');
        const result = await sendMessageText(finalText.trim(), 'voice');
        if (result) {
          setVoiceStatus('speaking');
          await speakText(result.reply, result.detectedLanguage);
        }
        if (recognitionRef.current) {
          setVoiceStatus('listening');
        }
      }
    };

    recognition.onerror = (ev: any) => {
      if (ev.error === 'not-allowed') {
        setVoiceNotice('Microphone permission was denied. Please allow microphone access in browser settings.');
        stopVoiceSession();
      }
    };

    recognition.start();
  };

  const startVoiceSession = async () => {
    if (!bot.voiceEnabled) {
      setVoiceNotice('Voice mode is disabled by this business owner.');
      return;
    }
    if (quotaPaused) {
      setVoiceNotice('AI responses are paused due to quota limits. Please submit a support request.');
      return;
    }

    setVoiceNotice('');
    setErrorMsg('');
    setVoiceStatus('connecting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
    } catch {
      setVoiceNotice(
        'Microphone access is required for voice conversations. Please allow microphone permission or continue in Text mode.'
      );
      setVoiceStatus('idle');
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live?businessId=${encodeURIComponent(
        bot.businessId
      )}&language=${encodeURIComponent(selectedLang)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let pendingInput = '';
      let pendingOutput = '';

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          ready?: boolean;
          audio?: string;
          inputTranscript?: string;
          outputTranscript?: string;
          interrupted?: boolean;
          turnComplete?: boolean;
          error?: string;
          quotaExceeded?: boolean;
          fallbackToBrowserVoice?: boolean;
        };

        if (msg.ready) {
          setVoiceEngine('live');
          setVoiceStatus('listening');
          source.connect(processor);
          processor.connect(inputCtx.destination);
          processor.onaudioprocess = (e) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const b64 = pcm16ToBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: b64 }));
          };
          return;
        }

        if (msg.error) {
          if (msg.quotaExceeded) {
            setQuotaPaused(true);
            setShowHandoverForm(true);
            setErrorMsg(msg.error);
            stopVoiceSession();
            return;
          }
          if (msg.fallbackToBrowserVoice) {
            // Switch smoothly to browser STT + /api/chat + TTS
            try {
              processor.disconnect();
            } catch {}
            void inputCtx.close().catch(() => undefined);
            void outputCtx.close().catch(() => undefined);
            ws.close();
            void startBrowserVoiceFallback();
            return;
          }
          setVoiceNotice(msg.error);
          return;
        }

        if (msg.inputTranscript) {
          pendingInput += msg.inputTranscript;
          setLiveInputTranscript(pendingInput);
          setVoiceStatus('processing');
        }

        if (msg.outputTranscript) {
          pendingOutput += msg.outputTranscript;
          setLiveOutputTranscript(pendingOutput);
        }

        if (msg.audio && outputCtxRef.current) {
          setVoiceStatus('speaking');
          const float32 = base64Pcm16ToFloat32(msg.audio);
          const buf = outputCtxRef.current.createBuffer(1, float32.length, 24000);
          buf.copyToChannel(new Float32Array(float32), 0);
          const node = outputCtxRef.current.createBufferSource();
          node.buffer = buf;
          node.connect(outputCtxRef.current.destination);
          const startAt = Math.max(nextStartTimeRef.current, outputCtxRef.current.currentTime);
          node.start(startAt);
          nextStartTimeRef.current = startAt + buf.duration;
        }

        if (msg.interrupted && outputCtxRef.current) {
          nextStartTimeRef.current = outputCtxRef.current.currentTime;
        }

        if (msg.turnComplete) {
          const finalIn = pendingInput.trim();
          const finalOut = pendingOutput.trim();
          pendingInput = '';
          pendingOutput = '';
          setLiveInputTranscript('');
          setLiveOutputTranscript('');
          setVoiceStatus('listening');

          if (finalIn && finalOut) {
            const cMsg: LocalMessage = {
              id: makeSafeId('vu'),
              role: 'customer',
              content: finalIn,
              language: selectedLang === 'auto' ? bot.primaryLanguage : selectedLang,
              mode: 'voice',
            };
            const aMsg: LocalMessage = {
              id: makeSafeId('va'),
              role: 'assistant',
              content: finalOut,
              language: selectedLang === 'auto' ? bot.primaryLanguage : selectedLang,
              mode: 'voice',
            };
            setMessages((prev) => [...prev, cMsg, aMsg]);
            void persistTurnToFirestore(cMsg, aMsg, aMsg.language, 'voice');
          }
        }
      };

      ws.onerror = () => {
        if (voiceEngine !== 'browser') {
          void startBrowserVoiceFallback();
        }
      };
    } catch {
      await startBrowserVoiceFallback();
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError('');
    if (!ticketEmail.trim() || !ticketEmail.includes('@')) {
      setTicketError('Please enter a valid email address so the business team can reply.');
      return;
    }
    if (ticketDescription.trim().length < 5) {
      setTicketError('Please describe your issue in at least 5 characters.');
      return;
    }

    setTicketSubmitting(true);
    try {
      if (bot.isDemo) {
        setTicketSubmittedId(`DEMO-${Date.now().toString().slice(-5)}`);
      } else {
        const id = await createSupportTicket({
          businessId: bot.businessId,
          ownerId: bot.ownerId,
          conversationId: conversationCreatedRef.current ? conversationIdRef.current : undefined,
          customerName: ticketName.trim() || undefined,
          customerEmail: ticketEmail.trim(),
          customerPhone: ticketPhone.trim() || undefined,
          category: ticketCategory,
          description: ticketDescription.trim(),
        });
        setTicketSubmittedId(id);
      }
      setShowHandoverForm(false);
    } catch {
      setTicketError('Unable to submit your support request right now. Please email support directly.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleFeedback = async (rating: number) => {
    setFeedbackRating(rating);
    if (bot.isDemo) {
      setFeedbackSaved(true);
      return;
    }
    try {
      await submitCustomerFeedback({
        businessId: bot.businessId,
        ownerId: bot.ownerId,
        conversationId: conversationCreatedRef.current ? conversationIdRef.current : undefined,
        rating,
      });
      setFeedbackSaved(true);
    } catch {
      setFeedbackSaved(true);
    }
  };

  const brandColor = /^#[0-9a-fA-F]{6}$/.test(bot.brandColor) ? bot.brandColor : '#2563EB';

  return (
    <div
      className={`flex flex-col bg-white border border-slate-200 overflow-hidden ${
        compact ? 'h-full rounded-none border-0' : 'rounded-2xl shadow-sm h-[640px]'
      }`}
      data-testid="customer-chatbot"
    >
      {/* Header */}
      <div
        className="px-4 py-3 text-white flex items-center justify-between gap-3 shrink-0"
        style={{ backgroundColor: brandColor }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {bot.logoUrl ? (
            <img
              src={bot.logoUrl}
              alt={`${bot.businessName} logo`}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-cover bg-white shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm shrink-0">
              {bot.businessName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{bot.assistantName}</div>
            <div className="text-xs text-white/85 truncate">{bot.businessName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {bot.voiceEnabled && (
            <div className="flex items-center bg-black/15 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => {
                  stopVoiceSession();
                  setMode('text');
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-colors whitespace-nowrap ${
                  mode === 'text' ? 'bg-white text-slate-900' : 'text-white/90 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Text
              </button>
              <button
                type="button"
                onClick={() => setMode('voice')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-colors whitespace-nowrap ${
                  mode === 'voice' ? 'bg-white text-slate-900' : 'text-white/90 hover:text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                Voice
              </button>
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close support chat"
              className="p-1.5 rounded-lg hover:bg-white/15 text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-header: Language Selector + AI/Privacy Notice */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
        <div className="flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <label htmlFor={`lang-select-${bot.businessId}`} className="sr-only">
            Conversation language
          </label>
          <select
            id={`lang-select-${bot.businessId}`}
            value={selectedLang}
            onChange={(e) => setSelectedLang(e.target.value)}
            className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code === 'auto' ? 'auto' : lang.name}>
                {lang.name} {lang.code !== 'auto' ? `(${lang.nativeName})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {bot.isDemo && (
            <span className="font-semibold text-amber-700">DEMO DATA</span>
          )}
          <button
            type="button"
            onClick={() => setShowHandoverForm((v) => !v)}
            className="text-blue-700 hover:underline font-medium flex items-center gap-1 whitespace-nowrap"
          >
            <Headphones className="w-3.5 h-3.5" />
            Human Support
          </button>
        </div>
      </div>

      {/* AI & Privacy disclosure */}
      <div className="px-4 py-1.5 bg-slate-50/70 border-b border-slate-100 text-[11px] text-slate-500 shrink-0">
        AI assistant · Responses may occasionally be inaccurate · Never share passwords or payment card details.
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mode === 'voice' ? (
          <div className="flex flex-col items-center justify-between min-h-full py-4 space-y-5">
            <div className="text-center space-y-1">
              <div className="text-sm font-semibold text-slate-900">
                {voiceStatus === 'idle' && 'Tap the microphone to start speaking'}
                {voiceStatus === 'connecting' && 'Connecting voice assistant...'}
                {voiceStatus === 'listening' && (isMuted ? 'Microphone muted' : 'Listening... speak naturally')}
                {voiceStatus === 'processing' && 'Understanding your question...'}
                {voiceStatus === 'speaking' && 'Assistant speaking...'}
              </div>
              <p className="text-xs text-slate-500">
                {voiceEngine === 'live'
                  ? 'Real-time voice session active'
                  : voiceEngine === 'browser'
                  ? 'Browser voice mode active'
                  : 'Shares full conversation context with text chat'}
              </p>
            </div>

            {/* Waveform visualization (CSS transform only) */}
            <div className="flex items-center justify-center gap-1.5 h-16" aria-hidden="true">
              {[0.4, 0.75, 1, 0.65, 0.9, 0.5, 0.8].map((scale, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full transition-transform duration-200"
                  style={{
                    height: '44px',
                    backgroundColor: voiceStatus === 'idle' ? '#CBD5E1' : brandColor,
                    transform:
                      voiceStatus === 'listening' || voiceStatus === 'speaking'
                        ? `scaleY(${scale})`
                        : 'scaleY(0.25)',
                  }}
                />
              ))}
            </div>

            {/* Primary Mic / Controls */}
            <div className="flex items-center gap-4">
              {voiceStatus === 'idle' ? (
                <button
                  type="button"
                  onClick={startVoiceSession}
                  aria-label="Start voice conversation"
                  className="w-20 h-20 rounded-full text-white flex items-center justify-center shadow-lg hover:opacity-95 transition-transform active:scale-95"
                  style={{ backgroundColor: brandColor }}
                >
                  <Mic className="w-8 h-8" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center transition-colors ${
                      isMuted
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceSession}
                    aria-label="End voice conversation"
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-colors"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {voiceNotice && (
              <div className="w-full p-3 rounded-lg bg-slate-100 text-xs text-slate-700 text-center">
                {voiceNotice}
              </div>
            )}

            {/* Live Transcript Feed */}
            <div className="w-full border-t border-slate-100 pt-3 space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-medium text-slate-500">Live Transcript</div>
              {messages.slice(-4).map((m) => (
                <div key={m.id} className="text-xs text-slate-700">
                  <span className="font-semibold">
                    {m.role === 'customer' ? 'You' : bot.assistantName}:{' '}
                  </span>
                  <span>{m.content}</span>
                </div>
              ))}
              {liveInputTranscript && (
                <div className="text-xs text-blue-700 italic">You: {liveInputTranscript}</div>
              )}
              {liveOutputTranscript && (
                <div className="text-xs text-slate-600 italic">
                  {bot.assistantName}: {liveOutputTranscript}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === 'customer' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'customer'
                      ? 'text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                  }`}
                  style={m.role === 'customer' ? { backgroundColor: brandColor } : undefined}
                >
                  {m.content}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{m.language}</span>
                  {m.role === 'assistant' && m.id !== 'welcome' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => void speakText(m.content, m.language)}
                        className="hover:text-slate-700 flex items-center gap-1"
                        aria-label="Listen to response"
                      >
                        <Volume2 className="w-3 h-3" />
                        Listen
                      </button>
                    </>
                  )}
                </div>

                {m.role === 'assistant' && m.suggestHuman && !ticketSubmittedId && (
                  <button
                    type="button"
                    onClick={() => setShowHandoverForm(true)}
                    className="mt-2 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                  >
                    Connect with Human Support
                  </button>
                )}

                {m.role === 'assistant' && m.followUps && m.followUps.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.followUps.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={sending || quotaPaused}
                        onClick={() => void sendMessageText(q, 'text')}
                        className="text-left text-xs px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-start">
                <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
                  Thinking...
                </div>
              </div>
            )}
          </>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p>{errorMsg}</p>
              {(bot.supportEmail || bot.supportPhone) && (
                <p className="mt-1 font-medium">
                  Direct support: {bot.supportEmail} {bot.supportPhone ? `· ${bot.supportPhone}` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {ticketSubmittedId && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Support request saved (Reference: {ticketSubmittedId})</p>
              <p className="mt-0.5">
                Your message has been delivered to the {bot.businessName} team. A team member will review it and follow up via email.
              </p>
            </div>
          </div>
        )}

        {showHandoverForm && !ticketSubmittedId && (
          <form
            onSubmit={handleSubmitTicket}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Request Human Assistance</h3>
              <button
                type="button"
                onClick={() => setShowHandoverForm(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>

            {ticketError && (
              <p className="text-xs text-red-700 bg-red-50 p-2 rounded-md border border-red-200">
                {ticketError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="tkt-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Your name (optional)
                </label>
                <input
                  id="tkt-name"
                  type="text"
                  value={ticketName}
                  onChange={(e) => setTicketName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="tkt-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Email address *
                </label>
                <input
                  id="tkt-email"
                  type="email"
                  required
                  value={ticketEmail}
                  onChange={(e) => setTicketEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="tkt-phone" className="block text-xs font-medium text-slate-700 mb-1">
                  Contact number (optional)
                </label>
                <input
                  id="tkt-phone"
                  type="tel"
                  value={ticketPhone}
                  onChange={(e) => setTicketPhone(e.target.value)}
                  placeholder="+1 555 0100"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="tkt-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Issue category
                </label>
                <select
                  id="tkt-cat"
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option>Product or Pricing Question</option>
                  <option>Order or Delivery Help</option>
                  <option>Refund or Return Request</option>
                  <option>Appointment / Booking</option>
                  <option>Technical Troubleshooting</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tkt-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Problem description *
              </label>
              <textarea
                id="tkt-desc"
                required
                rows={3}
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder="Tell the team how they can help..."
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={ticketSubmitting}
              className="w-full py-2 px-4 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: brandColor }}
            >
              {ticketSubmitting ? 'Submitting...' : 'Submit Support Request'}
            </button>
          </form>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Optional Rating bar after >= 2 messages */}
      {messages.length >= 3 && !feedbackSaved && mode === 'text' && (
        <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <span>Was this helpful?</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                aria-label={`Rate ${star} out of 5`}
                onClick={() => void handleFeedback(star)}
                className="p-1 text-slate-400 hover:text-amber-500 transition-colors"
              >
                <Star
                  className="w-3.5 h-3.5"
                  fill={feedbackRating >= star ? '#F59E0B' : 'none'}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {feedbackSaved && (
        <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] text-emerald-700 text-center shrink-0">
          Thank you for rating this conversation ({feedbackRating}/5).
        </div>
      )}

      {/* Text Input Bar */}
      {mode === 'text' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessageText(input, 'text');
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
        >
          <label htmlFor={`chat-input-${bot.businessId}`} className="sr-only">
            Ask a question
          </label>
          <input
            id={`chat-input-${bot.businessId}`}
            type="text"
            value={input}
            disabled={sending || quotaPaused}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              quotaPaused
                ? 'AI paused — submit a support request above'
                : 'Ask in any language (English, हिन्दी, తెలుగు, 中文...)'
            }
            className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={sending || quotaPaused || !input.trim()}
            aria-label="Send message"
            className="p-2.5 rounded-xl text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: brandColor }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
