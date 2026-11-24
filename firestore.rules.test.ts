import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rules = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules enforces global deny-all and rules_version 2', () => {
  assert.match(rules, /rules_version = '2';/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test('firestore.rules enforces verified user and strict tenant isolation', () => {
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /existing\(\)\.ownerId == request\.auth\.uid/);
  assert.match(rules, /data\.ownerId == request\.auth\.uid/);
});

test('firestore.rules blocks public listing of publishedBots and private collections', () => {
  assert.match(rules, /match \/publishedBots\/\{businessId\}[\s\S]*allow list: if false;/);
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*allow list: if false;/);
});

test('firestore.rules enforces validation helpers, strict keys, and server timestamps', () => {
  assert.match(rules, /isValidBusiness\(incoming\(\)\)/);
  assert.match(rules, /isValidKnowledgeItem\(incoming\(\)\)/);
  assert.match(rules, /isValidSupportTicket\(incoming\(\)\)/);
  assert.match(rules, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rules, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rules, /incoming\(\)\.status == 'open'/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['status', 'internalNotes', 'updatedAt'\]\)/);
});
