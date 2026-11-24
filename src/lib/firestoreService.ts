import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  Business,
  ChatMessage,
  Conversation,
  CustomerFeedback,
  KnowledgeItem,
  PublicBotProfile,
  SupportTicket,
  TicketStatus,
  UsageEvent,
  UserProfile,
  WidgetSettings,
} from '../types/aicare';
import { clampString, formatUtcDateKey } from '../utils/knowledge';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

export function makeSafeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 60);
}

export async function upsertUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const payload: UserProfile = {
        uid: user.uid,
        email: clampString(user.email || '', 254),
        displayName: clampString(user.displayName || 'Business Owner', 100),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, {
        email: clampString(user.email || '', 254),
        displayName: clampString(user.displayName || 'Business Owner', 100),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function createBusinessWorkspace(
  ownerId: string,
  input: Omit<Business, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<Business> {
  const id = makeSafeId('biz');
  const path = `businesses/${id}`;
  try {
    const payload: Record<string, unknown> = {
      id,
      ownerId,
      name: clampString(input.name, 120),
      category: clampString(input.category, 80),
      description: clampString(input.description, 1000),
      contactEmail: clampString(input.contactEmail, 254),
      operatingHours: clampString(input.operatingHours, 300),
      assistantName: clampString(input.assistantName, 60),
      welcomeMessage: clampString(input.welcomeMessage, 500),
      tone: input.tone,
      responseLength: input.responseLength,
      primaryLanguage: clampString(input.primaryLanguage, 40),
      autoDetectLanguage: Boolean(input.autoDetectLanguage),
      voiceEnabled: Boolean(input.voiceEnabled),
      brandColor: /^#[0-9a-fA-F]{6}$/.test(input.brandColor) ? input.brandColor : '#2563EB',
      saveTranscripts: Boolean(input.saveTranscripts),
      transcriptRetentionDays: Math.min(365, Math.max(1, Number(input.transcriptRetentionDays) || 90)),
      dailyAiLimit: Math.min(10000, Math.max(1, Number(input.dailyAiLimit) || 250)),
      isPublished: Boolean(input.isPublished),
      onboardingStep: Math.min(4, Math.max(1, Number(input.onboardingStep) || 1)),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.websiteUrl?.trim()) payload.websiteUrl = clampString(input.websiteUrl, 300);
    if (input.contactPhone?.trim()) payload.contactPhone = clampString(input.contactPhone, 40);
    if (input.location?.trim()) payload.location = clampString(input.location, 200);
    if (input.logoUrl?.trim()) payload.logoUrl = clampString(input.logoUrl, 500);
    if (input.customToneInstructions?.trim()) {
      payload.customToneInstructions = clampString(input.customToneInstructions, 400);
    }

    await setDoc(doc(db, 'businesses', id), payload);

    // Owner membership record
    await setDoc(doc(db, 'businesses', id, 'members', ownerId), {
      uid: ownerId,
      businessId: id,
      ownerId,
      role: 'owner',
      createdAt: serverTimestamp(),
    });

    // Default widget settings
    const defaultWidget: WidgetSettings = {
      businessId: id,
      ownerId,
      position: 'bottom-right',
      launcherText: clampString(`Ask ${input.assistantName || 'Support'}`, 60),
      brandColor: payload.brandColor as string,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'businesses', id, 'widgetSettings', 'default'), defaultWidget);

    const createdSnap = await getDoc(doc(db, 'businesses', id));
    return createdSnap.data() as Business;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBusinessWorkspace(
  businessId: string,
  updates: Partial<Business>
): Promise<void> {
  const path = `businesses/${businessId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.name !== undefined) clean.name = clampString(updates.name, 120);
    if (updates.category !== undefined) clean.category = clampString(updates.category, 80);
    if (updates.description !== undefined) clean.description = clampString(updates.description, 1000);
    if (updates.websiteUrl !== undefined) clean.websiteUrl = clampString(updates.websiteUrl, 300);
    if (updates.contactEmail !== undefined) clean.contactEmail = clampString(updates.contactEmail, 254);
    if (updates.contactPhone !== undefined) clean.contactPhone = clampString(updates.contactPhone, 40);
    if (updates.operatingHours !== undefined) clean.operatingHours = clampString(updates.operatingHours, 300);
    if (updates.location !== undefined) clean.location = clampString(updates.location, 200);
    if (updates.logoUrl !== undefined) clean.logoUrl = clampString(updates.logoUrl, 500);
    if (updates.assistantName !== undefined) clean.assistantName = clampString(updates.assistantName, 60);
    if (updates.welcomeMessage !== undefined) clean.welcomeMessage = clampString(updates.welcomeMessage, 500);
    if (updates.tone !== undefined) clean.tone = updates.tone;
    if (updates.customToneInstructions !== undefined) {
      clean.customToneInstructions = clampString(updates.customToneInstructions, 400);
    }
    if (updates.responseLength !== undefined) clean.responseLength = updates.responseLength;
    if (updates.primaryLanguage !== undefined) clean.primaryLanguage = clampString(updates.primaryLanguage, 40);
    if (updates.autoDetectLanguage !== undefined) clean.autoDetectLanguage = Boolean(updates.autoDetectLanguage);
    if (updates.voiceEnabled !== undefined) clean.voiceEnabled = Boolean(updates.voiceEnabled);
    if (updates.brandColor !== undefined) {
      clean.brandColor = /^#[0-9a-fA-F]{6}$/.test(updates.brandColor) ? updates.brandColor : '#2563EB';
    }
    if (updates.saveTranscripts !== undefined) clean.saveTranscripts = Boolean(updates.saveTranscripts);
    if (updates.transcriptRetentionDays !== undefined) {
      clean.transcriptRetentionDays = Math.min(365, Math.max(1, Number(updates.transcriptRetentionDays) || 90));
    }
    if (updates.dailyAiLimit !== undefined) {
      clean.dailyAiLimit = Math.min(10000, Math.max(1, Number(updates.dailyAiLimit) || 250));
    }
    if (updates.isPublished !== undefined) clean.isPublished = Boolean(updates.isPublished);
    if (updates.onboardingStep !== undefined) {
      clean.onboardingStep = Math.min(4, Math.max(1, Number(updates.onboardingStep) || 1));
    }

    await updateDoc(doc(db, 'businesses', businessId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeOwnerBusinesses(
  ownerId: string,
  onData: (businesses: Business[]) => void
): Unsubscribe {
  const path = 'businesses';
  const q = query(collection(db, 'businesses'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Business);
      onData(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function addKnowledgeItem(
  businessId: string,
  ownerId: string,
  input: {
    title: string;
    sourceType: KnowledgeItem['sourceType'];
    fileName?: string;
    content: string;
    chunksCount: number;
  }
): Promise<KnowledgeItem> {
  const id = makeSafeId('kb');
  const path = `businesses/${businessId}/knowledge/${id}`;
  try {
    const payload: Record<string, unknown> = {
      id,
      businessId,
      ownerId,
      title: clampString(input.title, 160),
      sourceType: input.sourceType,
      content: clampString(input.content, 50000),
      chunksCount: Math.min(500, Math.max(1, Number(input.chunksCount) || 1)),
      status: 'processed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.fileName?.trim()) {
      payload.fileName = clampString(input.fileName, 200);
    }
    await setDoc(doc(db, 'businesses', businessId, 'knowledge', id), payload);
    const created = await getDoc(doc(db, 'businesses', businessId, 'knowledge', id));
    return created.data() as KnowledgeItem;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateKnowledgeItem(
  businessId: string,
  itemId: string,
  updates: {
    title: string;
    content: string;
    chunksCount: number;
    status?: 'processed' | 'error';
  }
): Promise<void> {
  const path = `businesses/${businessId}/knowledge/${itemId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'knowledge', itemId), {
      title: clampString(updates.title, 160),
      content: clampString(updates.content, 50000),
      chunksCount: Math.min(500, Math.max(1, Number(updates.chunksCount) || 1)),
      status: updates.status ?? 'processed',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteKnowledgeItem(businessId: string, itemId: string): Promise<void> {
  const path = `businesses/${businessId}/knowledge/${itemId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'knowledge', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeKnowledgeItems(
  businessId: string,
  ownerId: string,
  onData: (items: KnowledgeItem[]) => void
): Unsubscribe {
  const path = `businesses/${businessId}/knowledge`;
  const q = query(
    collection(db, 'businesses', businessId, 'knowledge'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as KnowledgeItem));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveWidgetSettings(
  businessId: string,
  ownerId: string,
  settings: {
    position: 'bottom-right' | 'bottom-left';
    launcherText: string;
    brandColor: string;
  }
): Promise<void> {
  const path = `businesses/${businessId}/widgetSettings/default`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'widgetSettings', 'default'), {
      businessId,
      ownerId,
      position: settings.position,
      launcherText: clampString(settings.launcherText, 60) || 'Chat with us',
      brandColor: /^#[0-9a-fA-F]{6}$/.test(settings.brandColor) ? settings.brandColor : '#2563EB',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getWidgetSettings(businessId: string): Promise<WidgetSettings | null> {
  const path = `businesses/${businessId}/widgetSettings/default`;
  try {
    const snap = await getDoc(doc(db, 'businesses', businessId, 'widgetSettings', 'default'));
    return snap.exists() ? (snap.data() as WidgetSettings) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncPublishedBotRuntime(
  business: Business,
  knowledgeItems: KnowledgeItem[],
  widget?: WidgetSettings | null
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required to sync assistant runtime.');
  const token = await user.getIdToken();

  const runtimeContext = {
    businessName: business.name,
    category: business.category,
    description: business.description,
    websiteUrl: business.websiteUrl || '',
    contactEmail: business.contactEmail,
    contactPhone: business.contactPhone || '',
    operatingHours: business.operatingHours,
    location: business.location || '',
    assistantName: business.assistantName,
    tone: business.tone,
    customToneInstructions: business.customToneInstructions || '',
    responseLength: business.responseLength,
    primaryLanguage: business.primaryLanguage,
    autoDetectLanguage: business.autoDetectLanguage,
    knowledgeItems: knowledgeItems.map((k) => ({
      title: k.title,
      sourceType: k.sourceType,
      content: k.content,
    })),
  };

  const resp = await fetch(`/api/bots/${encodeURIComponent(business.id)}/encrypt-context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ runtimeContext }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to prepare assistant knowledge package.');
  }

  const { encryptedContext } = (await resp.json()) as { encryptedContext: string };
  const path = `publishedBots/${business.id}`;
  try {
    const payload: Record<string, unknown> = {
      businessId: business.id,
      ownerId: business.ownerId,
      businessName: clampString(business.name, 120),
      category: clampString(business.category, 80),
      assistantName: clampString(business.assistantName, 60),
      welcomeMessage: clampString(business.welcomeMessage, 500),
      brandColor: /^#[0-9a-fA-F]{6}$/.test(business.brandColor) ? business.brandColor : '#2563EB',
      primaryLanguage: clampString(business.primaryLanguage, 40),
      autoDetectLanguage: Boolean(business.autoDetectLanguage),
      voiceEnabled: Boolean(business.voiceEnabled),
      widgetPosition: widget?.position ?? 'bottom-right',
      launcherText: clampString(widget?.launcherText || `Ask ${business.assistantName}`, 60),
      operatingHours: clampString(business.operatingHours, 300),
      supportEmail: clampString(business.contactEmail, 254),
      saveTranscripts: Boolean(business.saveTranscripts),
      dailyAiLimit: Math.min(10000, Math.max(1, Number(business.dailyAiLimit) || 250)),
      isPublished: Boolean(business.isPublished),
      encryptedContext: encryptedContext.slice(0, 200000),
      updatedAt: serverTimestamp(),
    };
    if (business.logoUrl?.trim()) payload.logoUrl = clampString(business.logoUrl, 500);
    if (business.contactPhone?.trim()) payload.supportPhone = clampString(business.contactPhone, 40);

    await setDoc(doc(db, 'publishedBots', business.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function getPublicBotProfile(businessId: string): Promise<PublicBotProfile | null> {
  const path = `publishedBots/${businessId}`;
  try {
    const snap = await getDoc(doc(db, 'publishedBots', businessId));
    if (!snap.exists()) return null;
    const data = snap.data() as PublicBotProfile & { encryptedContext?: string };
    return {
      businessId: data.businessId,
      ownerId: data.ownerId,
      businessName: data.businessName,
      category: data.category,
      logoUrl: data.logoUrl,
      assistantName: data.assistantName,
      welcomeMessage: data.welcomeMessage,
      brandColor: data.brandColor,
      primaryLanguage: data.primaryLanguage,
      autoDetectLanguage: data.autoDetectLanguage,
      voiceEnabled: data.voiceEnabled,
      widgetPosition: data.widgetPosition,
      launcherText: data.launcherText,
      operatingHours: data.operatingHours,
      supportEmail: data.supportEmail,
      supportPhone: data.supportPhone,
      saveTranscripts: data.saveTranscripts,
      dailyAiLimit: data.dailyAiLimit,
      isPublished: data.isPublished,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createConversationRecord(input: {
  conversationId: string;
  businessId: string;
  ownerId: string;
  channel: 'text' | 'voice' | 'widget';
  language: string;
  status: Conversation['status'];
  lastMessagePreview: string;
  hadUnanswered: boolean;
}): Promise<void> {
  const path = `conversations/${input.conversationId}`;
  try {
    await setDoc(doc(db, 'conversations', input.conversationId), {
      id: input.conversationId,
      businessId: input.businessId,
      ownerId: input.ownerId,
      channel: input.channel,
      language: clampString(input.language, 40) || 'English',
      status: input.status,
      lastMessagePreview: clampString(input.lastMessagePreview, 240),
      hadUnanswered: Boolean(input.hadUnanswered),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function appendConversationMessage(input: {
  conversationId: string;
  businessId: string;
  ownerId: string;
  role: 'customer' | 'assistant';
  content: string;
  language: string;
  mode: 'text' | 'voice';
  unanswered: boolean;
}): Promise<void> {
  const msgId = makeSafeId('msg');
  const path = `conversations/${input.conversationId}/messages/${msgId}`;
  try {
    await setDoc(doc(db, 'conversations', input.conversationId, 'messages', msgId), {
      id: msgId,
      conversationId: input.conversationId,
      businessId: input.businessId,
      ownerId: input.ownerId,
      role: input.role,
      content: clampString(input.content, 8000) || '(empty)',
      language: clampString(input.language, 40) || 'English',
      mode: input.mode,
      unanswered: Boolean(input.unanswered),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordUsageEvent(input: {
  businessId: string;
  ownerId: string;
  eventType: UsageEvent['eventType'];
  language: string;
}): Promise<void> {
  const id = makeSafeId('use');
  const path = `usageEvents/${id}`;
  try {
    await setDoc(doc(db, 'usageEvents', id), {
      id,
      businessId: input.businessId,
      ownerId: input.ownerId,
      date: formatUtcDateKey(),
      eventType: input.eventType,
      language: clampString(input.language, 40) || 'English',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createSupportTicket(input: {
  businessId: string;
  ownerId: string;
  conversationId?: string;
  customerName?: string;
  customerEmail: string;
  customerPhone?: string;
  category: string;
  description: string;
}): Promise<string> {
  const id = makeSafeId('tkt');
  const path = `supportTickets/${id}`;
  try {
    const payload: Record<string, unknown> = {
      id,
      businessId: input.businessId,
      ownerId: input.ownerId,
      customerEmail: clampString(input.customerEmail, 254),
      category: clampString(input.category, 80),
      description: clampString(input.description, 3000),
      status: 'open',
      internalNotes: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.conversationId?.trim()) payload.conversationId = clampString(input.conversationId, 64);
    if (input.customerName?.trim()) payload.customerName = clampString(input.customerName, 100);
    if (input.customerPhone?.trim()) payload.customerPhone = clampString(input.customerPhone, 40);

    await setDoc(doc(db, 'supportTickets', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSupportTicket(
  ticketId: string,
  updates: { status: TicketStatus; internalNotes: string }
): Promise<void> {
  const path = `supportTickets/${ticketId}`;
  try {
    await updateDoc(doc(db, 'supportTickets', ticketId), {
      status: updates.status,
      internalNotes: clampString(updates.internalNotes, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitCustomerFeedback(input: {
  businessId: string;
  ownerId: string;
  conversationId?: string;
  rating: number;
}): Promise<void> {
  const id = makeSafeId('fb');
  const path = `feedbacks/${id}`;
  try {
    const payload: Record<string, unknown> = {
      id,
      businessId: input.businessId,
      ownerId: input.ownerId,
      rating: Math.min(5, Math.max(1, Math.round(input.rating))),
      createdAt: serverTimestamp(),
    };
    if (input.conversationId?.trim()) payload.conversationId = clampString(input.conversationId, 64);
    await setDoc(doc(db, 'feedbacks', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function getConversationMessages(
  conversationId: string,
  ownerId: string
): Promise<ChatMessage[]> {
  const path = `conversations/${conversationId}/messages`;
  try {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ChatMessage);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteConversationAndMessages(
  conversationId: string,
  ownerId: string
): Promise<void> {
  const path = `conversations/${conversationId}`;
  try {
    const msgs = await getDocs(
      query(
        collection(db, 'conversations', conversationId, 'messages'),
        where('ownerId', '==', ownerId)
      )
    );
    const batch = writeBatch(db);
    for (const m of msgs.docs) {
      batch.delete(m.ref);
    }
    batch.delete(doc(db, 'conversations', conversationId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateConversationStatus(
  conversationId: string,
  status: Conversation['status']
): Promise<void> {
  const path = `conversations/${conversationId}`;
  try {
    await updateDoc(doc(db, 'conversations', conversationId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeBusinessConversations(
  businessId: string,
  ownerId: string,
  onData: (conversations: Conversation[]) => void
): Unsubscribe {
  const path = 'conversations';
  const q = query(
    collection(db, 'conversations'),
    where('ownerId', '==', ownerId),
    where('businessId', '==', businessId)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => d.data() as Conversation)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeBusinessTickets(
  businessId: string,
  ownerId: string,
  onData: (tickets: SupportTicket[]) => void
): Unsubscribe {
  const path = 'supportTickets';
  const q = query(
    collection(db, 'supportTickets'),
    where('ownerId', '==', ownerId),
    where('businessId', '==', businessId)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => d.data() as SupportTicket)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeBusinessUsageEvents(
  businessId: string,
  ownerId: string,
  onData: (events: UsageEvent[]) => void
): Unsubscribe {
  const path = 'usageEvents';
  const q = query(
    collection(db, 'usageEvents'),
    where('ownerId', '==', ownerId),
    where('businessId', '==', businessId)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => d.data() as UsageEvent)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeBusinessFeedbacks(
  businessId: string,
  ownerId: string,
  onData: (feedbacks: CustomerFeedback[]) => void
): Unsubscribe {
  const path = 'feedbacks';
  const q = query(
    collection(db, 'feedbacks'),
    where('ownerId', '==', ownerId),
    where('businessId', '==', businessId)
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => d.data() as CustomerFeedback)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}
