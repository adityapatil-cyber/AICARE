import type { KnowledgeItem, PublicBotProfile } from '../types/aicare';

export const DEMO_BUSINESS_ID = 'demo-greenleaf';

export const DEMO_BOT_PROFILE: PublicBotProfile = {
  businessId: DEMO_BUSINESS_ID,
  ownerId: 'demo-owner',
  businessName: 'GreenLeaf Store (DEMO)',
  category: 'Home & Garden',
  logoUrl: '/src/assets/images/greenleaf_logo_1795529181815.jpg',
  assistantName: 'Willow (Demo Assistant)',
  welcomeMessage:
    'Welcome to GreenLeaf Store! I can answer questions about our indoor plants, planters, prices, home delivery, store hours, and return policy in your preferred language.',
  brandColor: '#1E40AF',
  primaryLanguage: 'English',
  autoDetectLanguage: true,
  voiceEnabled: true,
  widgetPosition: 'bottom-right',
  launcherText: 'Ask GreenLeaf (Demo)',
  operatingHours: 'Monday–Saturday: 9:00 AM – 7:00 PM | Sunday: 10:00 AM – 5:00 PM',
  supportEmail: 'support@greenleaf-demo.example',
  supportPhone: '+1 (555) 234-8910',
  saveTranscripts: false,
  dailyAiLimit: 200,
  isPublished: true,
  isDemo: true,
};

export const DEMO_KNOWLEDGE_ITEMS: Omit<KnowledgeItem, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'demo-kb-products',
    businessId: DEMO_BUSINESS_ID,
    ownerId: 'demo-owner',
    title: 'Products & Pricing Catalog (DEMO DATA)',
    sourceType: 'product',
    content: `GreenLeaf Store Product Catalog (DEMO DATA):
1. Geometric Glass Terrarium (Medium) — $48.00. Includes moss, pebbles, and 3 low-maintenance succulents.
2. Matte Ceramic Planter (8-inch, Sand/Sage) — $24.00. Drainage hole with matching bamboo saucer.
3. Fiddle Leaf Fig (3ft Indoor Tree) — $65.00. Comes in a nursery pot; decorative ceramic pot sold separately.
4. Chinese Money Plant (Pilea Peperomioides) — $22.00. Pet-safe, bright indirect light.
5. Organic Indoor Potting Mix (8 Quart Bag) — $16.00. Peat-free coco coir blend with perlite.
6. Brass Plant Mister (300ml) — $19.50. Fine mist nozzle for tropical plants.
7. Gift Wrapping & Handwritten Card — $5.00 optional add-on.`,
    chunksCount: 1,
    status: 'processed',
  },
  {
    id: 'demo-kb-hours-location',
    businessId: DEMO_BUSINESS_ID,
    ownerId: 'demo-owner',
    title: 'Store Hours & Location (DEMO DATA)',
    sourceType: 'manual',
    content: `Store Location: 418 Botanical Lane, Maplewood District (next to Central Bakery). Free 30-minute customer parking behind the shop.
Operating Hours:
- Monday to Saturday: 9:00 AM – 7:00 PM
- Sunday: 10:00 AM – 5:00 PM
- Closed on major public holidays.
In-store repotting bar is open daily until 1 hour before closing ($8 service fee if bringing your own pot, free when buying a pot in-store).`,
    chunksCount: 1,
    status: 'processed',
  },
  {
    id: 'demo-kb-delivery',
    businessId: DEMO_BUSINESS_ID,
    ownerId: 'demo-owner',
    title: 'Home Delivery Policy (DEMO DATA)',
    sourceType: 'manual',
    content: `Home Delivery Policy:
- Yes, GreenLeaf Store offers local same-day and next-day home delivery within a 15-mile radius.
- Orders over $50.00 qualify for FREE local delivery.
- Orders under $50.00 have a flat $7.50 local delivery fee.
- Same-day delivery is available for orders placed before 2:00 PM.
- Live plants are hand-delivered in insulated carriers; we do not ship live trees by postal mail outside our 15-mile local zone.`,
    chunksCount: 1,
    status: 'processed',
  },
  {
    id: 'demo-kb-returns',
    businessId: DEMO_BUSINESS_ID,
    ownerId: 'demo-owner',
    title: 'Return & Plant Guarantee Policy (DEMO DATA)',
    sourceType: 'faq',
    content: `Return Policy & FAQs:
- Unused planters, tools, and accessories can be returned or exchanged within 30 days with a receipt in original condition.
- Live plants have a 14-day Healthy Plant Guarantee: if a plant arrives damaged or declines within 14 days despite normal care, bring a photo or the plant for an exchange or store credit.
- Soil bags that have been opened cannot be returned.
- Care workshops can be booked in-store or by emailing support@greenleaf-demo.example at least 24 hours ahead.`,
    chunksCount: 1,
    status: 'processed',
  },
];

export const DEMO_FEATURED_IMAGE = '/src/assets/images/greenleaf_terrarium_1795529182889.jpg';
export const HERO_PREVIEW_IMAGE = '/src/assets/images/aicare_hero_preview_1795529182043.jpg';
