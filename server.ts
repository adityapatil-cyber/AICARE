import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import express from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import mammoth from 'mammoth';
import multer from 'multer';
import { extractText } from 'unpdf';
import { WebSocketServer } from 'ws';
import { DEMO_BOT_PROFILE, DEMO_BUSINESS_ID, DEMO_KNOWLEDGE_ITEMS } from './src/data/demoGreenLeaf';
import {
  chunkKnowledgeText,
  formatUtcDateKey,
  parseCsvToReadableText,
  retrieveRelevantChunks,
} from './src/utils/knowledge';

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8')
) as {
  projectId: string;
  firestoreDatabaseId: string;
};

const adminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAdminAuth(adminApp);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const TEXT_MODEL_PRIMARY = 'gemini-3.1-flash-lite';
const TEXT_MODEL_FREE_FALLBACK = 'gemini-4-hydrogen';
const LIVE_MODEL = 'gemini-3.8-live';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

// Ephemeral fallback secret in memory if BOT_CONTEXT_SECRET and GEMINI_API_KEY are unset
const EPHEMERAL_FALLBACK_KEY = crypto.randomBytes(32);
function getEncryptionKey(): Buffer {
  const seed = process.env.BOT_CONTEXT_SECRET || process.env.GEMINI_API_KEY;
  if (!seed) return EPHEMERAL_FALLBACK_KEY;
  return crypto.createHmac('sha256', seed).update('aicare-runtime-context-v1').digest();
}

function encryptRuntimeContext(payload: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

interface DecryptedRuntimeContext {
  businessName: string;
  category?: string;
  description?: string;
  websiteUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  operatingHours?: string;
  location?: string;
  assistantName: string;
  tone: string;
  customToneInstructions?: string;
  responseLength: string;
  primaryLanguage: string;
  autoDetectLanguage: boolean;
  knowledgeItems: { title: string; sourceType: string; content: string }[];
}

function decryptRuntimeContext(blob: string): DecryptedRuntimeContext | null {
  try {
    const parts = blob.split('.');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as DecryptedRuntimeContext;
  } catch {
    return null;
  }
}

// Per-IP sliding window rate limiter + per-business daily usage counter
const ipRateMap = new Map<string, number[]>();
const businessDailyUsage = new Map<string, { date: string; count: number }>();
const PLATFORM_DAILY_GLOBAL_CAP = 5000;
let globalDailyUsage = { date: formatUtcDateKey(), count: 0 };

function checkIpRateLimit(ip: string, limitPerMinute = 45): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const recent = (ipRateMap.get(ip) || []).filter((t) => t > cutoff);
  if (recent.length >= limitPerMinute) {
    ipRateMap.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipRateMap.set(ip, recent);
  return true;
}

function getBusinessDailyCount(businessId: string): number {
  const today = formatUtcDateKey();
  const rec = businessDailyUsage.get(businessId);
  if (!rec || rec.date !== today) return 0;
  return rec.count;
}

function incrementUsageCounters(businessId: string): void {
  const today = formatUtcDateKey();
  if (globalDailyUsage.date !== today) {
    globalDailyUsage = { date: today, count: 0 };
  }
  globalDailyUsage.count += 1;

  const current = businessDailyUsage.get(businessId);
  if (!current || current.date !== today) {
    businessDailyUsage.set(businessId, { date: today, count: 1 });
  } else {
    current.count += 1;
  }
}

function isQuotaExhaustedError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = (anyErr?.message || String(err)).toLowerCase();
  return (
    anyErr?.status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit')
  );
}

function isModelNotFoundError(err: unknown): boolean {
  const anyErr = err as { status?: number; message?: string };
  const msg = (anyErr?.message || String(err)).toLowerCase();
  return (
    anyErr?.status === 404 ||
    msg.includes('404') ||
    msg.includes('not_found') ||
    msg.includes('not found') ||
    msg.includes('is not supported')
  );
}

function decodeFirestoreField(field: Record<string, unknown> | undefined): unknown {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  return undefined;
}

async function fetchPublishedBotFromFirestore(
  businessId: string,
  bearerToken?: string
): Promise<{
  isPublished: boolean;
  ownerId: string;
  dailyAiLimit: number;
  supportEmail: string;
  supportPhone: string;
  operatingHours: string;
  runtimeContext: DecryptedRuntimeContext;
} | null> {
  if (businessId === DEMO_BUSINESS_ID) {
    return {
      isPublished: true,
      ownerId: DEMO_BOT_PROFILE.ownerId,
      dailyAiLimit: DEMO_BOT_PROFILE.dailyAiLimit,
      supportEmail: DEMO_BOT_PROFILE.supportEmail || '',
      supportPhone: DEMO_BOT_PROFILE.supportPhone || '',
      operatingHours: DEMO_BOT_PROFILE.operatingHours || '',
      runtimeContext: {
        businessName: 'GreenLeaf Store',
        category: 'Home & Garden',
        description: 'A local store selling indoor plants, handcrafted terrariums, planters, and gardening supplies.',
        contactEmail: DEMO_BOT_PROFILE.supportEmail,
        contactPhone: DEMO_BOT_PROFILE.supportPhone,
        operatingHours: DEMO_BOT_PROFILE.operatingHours,
        location: '418 Botanical Lane, Maplewood District',
        assistantName: 'Willow',
        tone: 'Friendly',
        responseLength: 'Balanced',
        primaryLanguage: 'English',
        autoDetectLanguage: true,
        knowledgeItems: DEMO_KNOWLEDGE_ITEMS.map((k) => ({
          title: k.title,
          sourceType: k.sourceType,
          content: k.content,
        })),
      },
    };
  }

  if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(businessId)) return null;

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(
    firebaseConfig.firestoreDatabaseId
  )}/documents/publishedBots/${encodeURIComponent(businessId)}`;

  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) return null;

  const docJson = (await res.json()) as {
    fields?: Record<string, Record<string, unknown>>;
  };
  const f = docJson.fields;
  if (!f) return null;

  const encryptedContext = String(decodeFirestoreField(f.encryptedContext) || '');
  const runtimeContext = decryptRuntimeContext(encryptedContext);
  if (!runtimeContext) return null;

  return {
    isPublished: Boolean(decodeFirestoreField(f.isPublished)),
    ownerId: String(decodeFirestoreField(f.ownerId) || ''),
    dailyAiLimit: Number(decodeFirestoreField(f.dailyAiLimit) || 250),
    supportEmail: String(decodeFirestoreField(f.supportEmail) || runtimeContext.contactEmail || ''),
    supportPhone: String(decodeFirestoreField(f.supportPhone) || runtimeContext.contactPhone || ''),
    operatingHours: String(decodeFirestoreField(f.operatingHours) || runtimeContext.operatingHours || ''),
    runtimeContext,
  };
}

function buildCustomerSupportSystemPrompt(
  ctx: DecryptedRuntimeContext,
  relevantChunks: string[],
  preferredLanguage?: string
): string {
  const lengthRule =
    ctx.responseLength === 'Short'
      ? 'Keep replies concise (1-3 short sentences).'
      : ctx.responseLength === 'Detailed'
      ? 'Provide thorough, well-structured answers with bullet points when helpful.'
      : 'Keep replies clear, well-paced, and easy to read (2-5 sentences or concise bullets).';

  const toneRule =
    ctx.tone === 'Custom' && ctx.customToneInstructions
      ? `Tone style: ${ctx.customToneInstructions}`
      : `Tone style: ${ctx.tone}`;

  const languageRule =
    preferredLanguage && preferredLanguage !== 'auto'
      ? `The customer has selected "${preferredLanguage}". Respond strictly in "${preferredLanguage}" using its proper native script.`
      : ctx.autoDetectLanguage
      ? `Automatically detect the customer's language from their message (including Indian languages like Hindi, Gujarati, Bengali, Marathi, Tamil, Telugu, Malayalam, Kannada, Punjabi, Urdu, and international languages like Chinese, Japanese, Korean, Spanish, French, German, Arabic, Portuguese, Russian, and mixed code-switching). Respond in the SAME language and proper native script as the customer's latest message. Do NOT translate into English unless they wrote in English.`
      : `Respond in ${ctx.primaryLanguage} unless the customer explicitly asks to switch languages.`;

  return `You are "${ctx.assistantName}", the official AI customer support assistant for "${ctx.businessName}" (${ctx.category || 'Business'}).

CORE TRUTHFULNESS & GROUNDING RULES:
1. Use ONLY the Verified Business Details and Business Knowledge Base excerpts below as your source of truth.
2. NEVER invent product prices, stock availability, shipping rates, return policies, store addresses, or discounts not explicitly stated below.
3. NEVER claim or pretend you processed a refund, cancellation, payment, booking, or order modification. State clearly that a human team member must handle account/order actions and offer human handover.
4. If the answer is NOT in the Business Knowledge Base below, respond honestly in the customer's language that you do not have that specific information, share the business support contact details (${ctx.contactEmail || 'none provided'}${ctx.contactPhone ? `, ${ctx.contactPhone}` : ''}), and set "unanswered": true and "suggestHuman": true.
5. Do not ask for or echo passwords, payment card numbers, or sensitive personal data.
6. Maintain conversation continuity across follow-up questions.

PERSONALITY & LANGUAGE:
- ${toneRule}
- ${lengthRule}
- ${languageRule}

VERIFIED BUSINESS DETAILS:
- Business Name: ${ctx.businessName}
- Description: ${ctx.description || 'N/A'}
- Operating Hours: ${ctx.operatingHours || 'Not specified'}
- Location: ${ctx.location || 'Not specified'}
- Website: ${ctx.websiteUrl || 'Not specified'}
- Support Email: ${ctx.contactEmail || 'Not specified'}
- Support Phone: ${ctx.contactPhone || 'Not specified'}

BUSINESS KNOWLEDGE BASE EXCERPTS:
${relevantChunks.length > 0 ? relevantChunks.join('\n\n---\n\n') : 'No additional knowledge entries provided.'}`;
}

async function main() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      textModel: TEXT_MODEL_PRIMARY,
      liveModel: LIVE_MODEL,
      ttsModel: TTS_MODEL,
    });
  });

  // Encrypt business runtime context for storage in publishedBots (owner authenticated)
  app.post('/api/bots/:businessId/encrypt-context', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        return res.status(401).json({ error: 'Missing authentication token.' });
      }
      await adminAuth.verifyIdToken(token);

      const { runtimeContext } = req.body as { runtimeContext?: DecryptedRuntimeContext };
      if (!runtimeContext || !runtimeContext.businessName || !runtimeContext.assistantName) {
        return res.status(400).json({ error: 'Invalid business runtime context.' });
      }
      const encryptedContext = encryptRuntimeContext(runtimeContext);
      return res.json({ encryptedContext });
    } catch (err) {
      console.error('Encrypt context error:', err);
      return res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }
  });

  // Extract readable text from TXT, CSV, PDF, or DOCX uploads
  app.post('/api/knowledge/extract', upload.single('file'), async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        return res.status(401).json({ error: 'Please sign in to upload knowledge files.' });
      }
      await adminAuth.verifyIdToken(token);

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const ext = path.extname(file.originalname).toLowerCase();
      let extracted = '';
      let sourceType: 'txt' | 'csv' | 'pdf' | 'docx' = 'txt';

      if (ext === '.txt' || ext === '.md') {
        sourceType = 'txt';
        extracted = file.buffer.toString('utf8');
      } else if (ext === '.csv') {
        sourceType = 'csv';
        extracted = parseCsvToReadableText(file.buffer.toString('utf8'));
      } else if (ext === '.docx') {
        sourceType = 'docx';
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        extracted = result.value || '';
      } else if (ext === '.pdf') {
        sourceType = 'pdf';
        const result = await extractText(new Uint8Array(file.buffer), { mergePages: true });
        extracted = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text || '');
      } else {
        return res.status(400).json({
          error: 'Unsupported file format. Please upload .txt, .csv, .pdf, or .docx files.',
        });
      }

      const cleanText = extracted.replace(/\0/g, '').trim();
      if (cleanText.length < 10) {
        return res.status(400).json({
          error:
            'No readable text could be extracted from this file (for example, it may be empty or a scanned image-only PDF). Please paste the text manually.',
        });
      }

      const bounded = cleanText.slice(0, 48000);
      const chunks = chunkKnowledgeText(bounded, 900, 120);
      return res.json({
        fileName: file.originalname.slice(0, 200),
        sourceType,
        text: bounded,
        chunksCount: Math.max(1, chunks.length),
        truncated: cleanText.length > 48000,
      });
    } catch (err) {
      console.error('Knowledge extract error:', err);
      return res.status(400).json({
        error:
          err instanceof Error
            ? `Could not extract document: ${err.message}`
            : 'Document processing failed.',
      });
    }
  });

  // Usage status endpoint (authenticated owner)
  app.get('/api/usage/:businessId', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return res.status(401).json({ error: 'Authentication required.' });
      await adminAuth.verifyIdToken(token);

      const { businessId } = req.params;
      return res.json({
        businessId,
        todayCount: getBusinessDailyCount(businessId),
        date: formatUtcDateKey(),
      });
    } catch {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
  });

  // Core Multilingual AI Customer Chat Endpoint
  app.post('/api/chat', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkIpRateLimit(clientIp)) {
      return res.status(429).json({
        quotaExceeded: true,
        error: 'Too many requests in a short time. Please wait a moment or submit a support request.',
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'AI service key is not configured on the server.',
      });
    }

    try {
      const {
        businessId,
        message,
        history = [],
        preferredLanguage = 'auto',
      } = req.body as {
        businessId?: string;
        message?: string;
        history?: { role: 'customer' | 'assistant'; content: string }[];
        preferredLanguage?: string;
      };

      if (!businessId || typeof businessId !== 'string') {
        return res.status(400).json({ error: 'Missing businessId.' });
      }
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      if (token) {
        await adminAuth.verifyIdToken(token).catch(() => undefined);
      }

      const bot = await fetchPublishedBotFromFirestore(businessId, token);
      if (!bot) {
        return res.status(404).json({ error: 'Assistant not found or not published yet.' });
      }

      if (!bot.isPublished && !token) {
        return res.status(403).json({ error: 'This assistant is not published yet.' });
      }

      // Check configured daily free-tier limit & global safety limit
      const usedToday = getBusinessDailyCount(businessId);
      if (
        usedToday >= bot.dailyAiLimit ||
        (globalDailyUsage.date === formatUtcDateKey() && globalDailyUsage.count >= PLATFORM_DAILY_GLOBAL_CAP)
      ) {
        return res.status(429).json({
          quotaExceeded: true,
          supportEmail: bot.supportEmail,
          supportPhone: bot.supportPhone,
          error:
            'Daily free-tier AI assistant limit reached. Please try again later or submit a support request below so a human team member can help you.',
        });
      }

      const recentHistoryText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h) => `${h.role === 'customer' ? 'Customer' : 'Assistant'}: ${String(h.content).slice(0, 600)}`)
            .join('\n')
        : '';

      const queryForRetrieval = `${message} ${recentHistoryText}`.slice(0, 1500);
      const relevantChunks = retrieveRelevantChunks(
        queryForRetrieval,
        bot.runtimeContext.knowledgeItems,
        8
      );

      const systemInstruction = buildCustomerSupportSystemPrompt(
        bot.runtimeContext,
        relevantChunks,
        preferredLanguage
      );

      const conversationContents = [
        ...(Array.isArray(history)
          ? history.slice(-8).map((h) => ({
              role: h.role === 'customer' ? ('user' as const) : ('model' as const),
              parts: [{ text: String(h.content).slice(0, 2000) }],
            }))
          : []),
        {
          role: 'user' as const,
          parts: [{ text: message.trim().slice(0, 2000) }],
        },
      ];

      const callModel = async (modelName: string) =>
        ai.models.generateContent({
          model: modelName,
          contents: conversationContents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: { type: Type.STRING, description: 'Helpful response in the customer language.' },
                detectedLanguage: {
                  type: Type.STRING,
                  description: 'Detected language name in English, e.g., English, Hindi, Gujarati, Telugu, Malayalam, Mandarin Chinese.',
                },
                unanswered: {
                  type: Type.BOOLEAN,
                  description: 'True if the business knowledge base does not contain the answer.',
                },
                suggestHuman: {
                  type: Type.BOOLEAN,
                  description: 'True if the customer requested a human or needs human support.',
                },
                suggestedFollowUps: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Up to 3 short helpful follow-up questions in the customer language.',
                },
              },
              required: ['reply', 'detectedLanguage', 'unanswered', 'suggestHuman', 'suggestedFollowUps'],
            },
          },
        });

      let response;
      try {
        response = await callModel(TEXT_MODEL_PRIMARY);
      } catch (primaryErr) {
        console.warn(`Primary model ${TEXT_MODEL_PRIMARY} error:`, primaryErr);
        if (isQuotaExhaustedError(primaryErr)) {
          return res.status(429).json({
            quotaExceeded: true,
            supportEmail: bot.supportEmail,
            supportPhone: bot.supportPhone,
            error:
              'Free-tier AI quota is temporarily exhausted. AI responses are paused — please submit a human support request below.',
          });
        }
        if (isModelNotFoundError(primaryErr)) {
          response = await callModel(TEXT_MODEL_FREE_FALLBACK);
        } else {
          throw primaryErr;
        }
      }

      incrementUsageCounters(businessId);

      const rawJson = (response.text || '{}').trim();
      let parsed: {
        reply?: string;
        detectedLanguage?: string;
        unanswered?: boolean;
        suggestHuman?: boolean;
        suggestedFollowUps?: string[];
      } = {};
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = {
          reply: rawJson || 'I am sorry, I could not generate a response right now.',
          detectedLanguage: preferredLanguage !== 'auto' ? preferredLanguage : bot.runtimeContext.primaryLanguage,
          unanswered: false,
          suggestHuman: false,
          suggestedFollowUps: [],
        };
      }

      return res.json({
        reply: parsed.reply || 'How else can I assist you today?',
        detectedLanguage: parsed.detectedLanguage || bot.runtimeContext.primaryLanguage,
        unanswered: Boolean(parsed.unanswered),
        suggestHuman: Boolean(parsed.suggestHuman),
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps.slice(0, 3)
          : [],
        usedToday: getBusinessDailyCount(businessId),
        dailyLimit: bot.dailyAiLimit,
      });
    } catch (err: any) {
      if (isQuotaExhaustedError(err)) {
        return res.status(429).json({
          quotaExceeded: true,
          error:
            'Free-tier AI quota is temporarily exhausted. Please try again shortly or submit a support ticket.',
        });
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Chat API error:', err?.status, errMsg);
      return res.status(500).json({
        error:
          errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED')
            ? 'AI service key error. Please verify GEMINI_API_KEY in Settings > Secrets.'
            : `Unable to process your question right now (${err?.status || 'AI error'}). Please try again or contact support.`,
      });
    }
  });

  // Optional Free-Tier Speech Generation (TTS) via gemini-3.8-flash-lite-tts
  app.post('/api/tts', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkIpRateLimit(clientIp, 25)) {
      return res.status(429).json({ unavailable: true, quotaExceeded: true });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ unavailable: true });
    }

    try {
      const { text, businessId } = req.body as { text?: string; businessId?: string };
      if (!text || !text.trim()) {
        return res.status(400).json({ unavailable: true });
      }

      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: text.trim().slice(0, 900) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.json({ unavailable: true });
      }
      if (businessId) incrementUsageCounters(businessId);
      return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return res.status(429).json({ unavailable: true, quotaExceeded: true });
      }
      return res.json({ unavailable: true });
    }
  });

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // WebSocket server for Gemini Live API (/ws/live)
  const wss = new WebSocketServer({ server, path: '/ws/live' });
  wss.on('connection', async (clientWs, req) => {
    const url = new URL(req.url || '/ws/live', 'http://localhost');
    const businessId = url.searchParams.get('businessId') || DEMO_BUSINESS_ID;
    const preferredLanguage = url.searchParams.get('language') || 'auto';

    if (!process.env.GEMINI_API_KEY) {
      clientWs.send(JSON.stringify({ error: 'AI key not configured.', fallbackToBrowserVoice: true }));
      clientWs.close();
      return;
    }

    const bot = await fetchPublishedBotFromFirestore(businessId);
    if (!bot || !bot.isPublished) {
      clientWs.send(JSON.stringify({ error: 'Assistant not found or not published.', fallbackToBrowserVoice: true }));
      clientWs.close();
      return;
    }

    if (getBusinessDailyCount(businessId) >= bot.dailyAiLimit) {
      clientWs.send(
        JSON.stringify({
          quotaExceeded: true,
          error: 'Daily free-tier AI limit reached. Please submit a support request.',
          fallbackToBrowserVoice: false,
        })
      );
      clientWs.close();
      return;
    }

    const chunks = retrieveRelevantChunks(
      bot.runtimeContext.description || bot.runtimeContext.businessName,
      bot.runtimeContext.knowledgeItems,
      10
    );
    const systemInstruction = buildCustomerSupportSystemPrompt(
      bot.runtimeContext,
      chunks,
      preferredLanguage
    );

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    try {
      session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            incrementUsageCounters(businessId);
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ ready: true }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: 'Live voice session encountered an issue. Switching to browser voice fallback.',
                  quotaExceeded: isQuotaExhaustedError(err),
                  fallbackToBrowserVoice: !isQuotaExhaustedError(err),
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ closed: true }));
            }
          },
        },
      });
    } catch (err) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: isQuotaExhaustedError(err)
              ? 'Free-tier AI quota is temporarily exhausted.'
              : 'Live voice model unavailable right now; using browser speech mode.',
            quotaExceeded: isQuotaExhaustedError(err),
            fallbackToBrowserVoice: !isQuotaExhaustedError(err),
          })
        );
      }
      clientWs.close();
      return;
    }

    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { audio?: string; text?: string };
        if (msg.audio && session) {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.text && session) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // ignore malformed websocket payload
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // ignore
      }
    });
  });

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AICare server listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start AICare server:', err);
  process.exit(1);
});
