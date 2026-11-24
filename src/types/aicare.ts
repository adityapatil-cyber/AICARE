export type AssistantTone = 'Friendly' | 'Professional' | 'Casual' | 'Formal' | 'Custom';
export type ResponseLength = 'Short' | 'Balanced' | 'Detailed';
export type KnowledgeSourceType = 'manual' | 'faq' | 'product' | 'pdf' | 'txt' | 'csv' | 'docx';
export type WidgetPosition = 'bottom-right' | 'bottom-left';
export type TicketStatus = 'open' | 'in_progress' | 'resolved';
export type ConversationStatus = 'active' | 'resolved' | 'needs_human' | 'unanswered';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Business {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  description: string;
  websiteUrl?: string;
  contactEmail: string;
  contactPhone?: string;
  operatingHours: string;
  location?: string;
  logoUrl?: string;
  assistantName: string;
  welcomeMessage: string;
  tone: AssistantTone;
  customToneInstructions?: string;
  responseLength: ResponseLength;
  primaryLanguage: string;
  autoDetectLanguage: boolean;
  voiceEnabled: boolean;
  brandColor: string;
  saveTranscripts: boolean;
  transcriptRetentionDays: number;
  dailyAiLimit: number;
  isPublished: boolean;
  onboardingStep: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KnowledgeItem {
  id: string;
  businessId: string;
  ownerId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  fileName?: string;
  content: string;
  chunksCount: number;
  status: 'processed' | 'error';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WidgetSettings {
  businessId: string;
  ownerId: string;
  position: WidgetPosition;
  launcherText: string;
  brandColor: string;
  updatedAt?: unknown;
}

export interface PublicBotProfile {
  businessId: string;
  ownerId: string;
  businessName: string;
  category?: string;
  logoUrl?: string;
  assistantName: string;
  welcomeMessage: string;
  brandColor: string;
  primaryLanguage: string;
  autoDetectLanguage: boolean;
  voiceEnabled: boolean;
  widgetPosition: WidgetPosition;
  launcherText: string;
  operatingHours?: string;
  supportEmail?: string;
  supportPhone?: string;
  saveTranscripts: boolean;
  dailyAiLimit: number;
  isPublished: boolean;
  isDemo?: boolean;
}

export interface Conversation {
  id: string;
  businessId: string;
  ownerId: string;
  channel: 'text' | 'voice' | 'widget';
  language: string;
  status: ConversationStatus;
  lastMessagePreview: string;
  hadUnanswered: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  businessId: string;
  ownerId: string;
  role: 'customer' | 'assistant';
  content: string;
  language: string;
  mode: 'text' | 'voice';
  unanswered: boolean;
  createdAt?: unknown;
}

export interface SupportTicket {
  id: string;
  businessId: string;
  ownerId: string;
  conversationId?: string;
  customerName?: string;
  customerEmail: string;
  customerPhone?: string;
  category: string;
  description: string;
  status: TicketStatus;
  internalNotes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UsageEvent {
  id: string;
  businessId: string;
  ownerId: string;
  date: string;
  eventType: 'text' | 'voice' | 'tts' | 'quota_hit';
  language: string;
  createdAt?: unknown;
}

export interface CustomerFeedback {
  id: string;
  businessId: string;
  ownerId: string;
  conversationId?: string;
  rating: number;
  createdAt?: unknown;
}
