import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWidgetEmbedSnippet,
  chunkKnowledgeText,
  parseCsvToReadableText,
  retrieveRelevantChunks,
  validateBusinessForPublish,
} from './knowledge';

test('chunkKnowledgeText splits long documents into bounded chunks', () => {
  const longText = Array.from({ length: 12 }, (_, i) => `Section ${i}: ${'word '.repeat(45)}`).join('\n\n');
  const chunks = chunkKnowledgeText(longText, 400, 50);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 420);
  }
});

test('parseCsvToReadableText converts CSV rows into key-value sentences', () => {
  const csv = 'Product,Price,Stock\n"Glass Terrarium, Large","$48.00",In Stock\nCeramic Planter,"$24.00",In Stock';
  const text = parseCsvToReadableText(csv);
  assert.match(text, /Product: Glass Terrarium, Large; Price: \$48\.00; Stock: In Stock/);
  assert.match(text, /Product: Ceramic Planter; Price: \$24\.00; Stock: In Stock/);
});

test('retrieveRelevantChunks prioritizes matching knowledge items', () => {
  const items = [
    { title: 'Store Hours', content: 'Open Monday to Saturday from 9:00 AM to 7:00 PM.' },
    { title: 'Return Policy', content: '30-day returns on unused ceramic pots with receipt.' },
    { title: 'Delivery Policy', content: 'Free local home delivery on orders over $50 within 10 miles.' },
    { title: 'Products', content: 'Terrariums, bonsai trees, organic potting soil, brass mister.' },
  ];
  const results = retrieveRelevantChunks('What is your return policy for pots?', items, 2);
  assert.equal(results.length, 2);
  assert.match(results[0], /Return Policy/);
});

test('validateBusinessForPublish rejects incomplete setup and approves complete setup', () => {
  const invalid = validateBusinessForPublish({ name: 'Shop' }, 0);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missing.includes('At least 1 knowledge base item'));

  const valid = validateBusinessForPublish(
    {
      name: 'GreenLeaf',
      category: 'Home & Garden',
      contactEmail: 'hello@greenleaf.example',
      operatingHours: 'Mon-Sat 9am-7pm',
      assistantName: 'Leafy',
      welcomeMessage: 'Hi! How can I help?',
    },
    1
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.missing.length, 0);
});

test('buildWidgetEmbedSnippet generates safe iframe snippet with exact business ID and origin', () => {
  const snippet = buildWidgetEmbedSnippet(
    'https://aicare.example.com/',
    'biz_123',
    'bottom-left',
    'Ask Support',
    '#2563EB'
  );
  assert.match(snippet, /https:\/\/aicare\.example\.com\/widget\/biz_123/);
  assert.match(snippet, /left:20px;/);
  assert.match(snippet, /Ask Support/);
  assert.match(snippet, /allow = "microphone"/);
});
