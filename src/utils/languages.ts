export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  bcp47: string;
  group: 'Indian' | 'International';
  browserSttCommon: boolean;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'auto', name: 'Auto-Detect Language', nativeName: 'Automatic', bcp47: 'en-US', group: 'International', browserSttCommon: true },
  { code: 'en', name: 'English', nativeName: 'English', bcp47: 'en-US', group: 'Indian', browserSttCommon: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN', group: 'Indian', browserSttCommon: true },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', bcp47: 'gu-IN', group: 'Indian', browserSttCommon: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-IN', group: 'Indian', browserSttCommon: true },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', bcp47: 'mr-IN', group: 'Indian', browserSttCommon: true },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN', group: 'Indian', browserSttCommon: true },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN', group: 'Indian', browserSttCommon: true },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', bcp47: 'ml-IN', group: 'Indian', browserSttCommon: true },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN', group: 'Indian', browserSttCommon: true },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN', group: 'Indian', browserSttCommon: false },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', bcp47: 'ur-PK', group: 'Indian', browserSttCommon: false },
  { code: 'zh-CN', name: 'Mandarin Chinese', nativeName: '简体中文', bcp47: 'zh-CN', group: 'International', browserSttCommon: true },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', bcp47: 'zh-TW', group: 'International', browserSttCommon: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', bcp47: 'ja-JP', group: 'International', browserSttCommon: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', bcp47: 'ko-KR', group: 'International', browserSttCommon: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', bcp47: 'es-ES', group: 'International', browserSttCommon: true },
  { code: 'fr', name: 'French', nativeName: 'Français', bcp47: 'fr-FR', group: 'International', browserSttCommon: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', bcp47: 'de-DE', group: 'International', browserSttCommon: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', bcp47: 'ar-SA', group: 'International', browserSttCommon: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', bcp47: 'pt-BR', group: 'International', browserSttCommon: true },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', bcp47: 'ru-RU', group: 'International', browserSttCommon: true },
];

export const SELECTABLE_PRIMARY_LANGUAGES = SUPPORTED_LANGUAGES.filter((l) => l.code !== 'auto');

export function findLanguageByNameOrCode(val: string): SupportedLanguage {
  const normalized = val.trim().toLowerCase();
  const match = SUPPORTED_LANGUAGES.find(
    (l) =>
      l.code.toLowerCase() === normalized ||
      l.name.toLowerCase() === normalized ||
      l.nativeName.toLowerCase() === normalized
  );
  return match || SUPPORTED_LANGUAGES[1]; // Default English
}
