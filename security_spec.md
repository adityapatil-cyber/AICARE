# AICare Security Specification & Threat Model

## 1. Data Invariants
1. **Strict Tenant Isolation**: Every `Business`, `KnowledgeItem`, `WidgetSettings`, `Conversation`, `ChatMessage`, `SupportTicket`, `UsageEvent`, and `CustomerFeedback` document carries an immutable `ownerId` matching `businesses/{businessId}.ownerId`.
2. **No Cross-Business Reads**: A signed-in business owner can only read, list, update, or delete records where `resource.data.ownerId == request.auth.uid`.
3. **Public Chatbot Safety**: Unauthenticated visitors can only `get` a single `publishedBots/{businessId}` document where `isPublished == true` (no `list` allowed). Knowledge base content inside `publishedBots` is AES-256-GCM encrypted on the server and never exposed in plain text.
4. **Write-Only Public Ingestion**: Public visitors can `create` new `conversations`, `messages`, `supportTickets`, `usageEvents`, and `feedbacks` ONLY when referencing a valid, published `publishedBots/{businessId}` and matching its `ownerId`. Public visitors can never `get`, `list`, `update`, or `delete` those records.
5. **PII Isolation**: User profile PII (`users/{userId}`) is strictly readable and writable only by the owner (`request.auth.uid == userId`).
6. **Temporal & Structural Integrity**: All `createdAt` and `updatedAt` timestamps must equal `request.time`. All IDs match `^[a-zA-Z0-9_\-]+$` with strict string length bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Business Create**: `{ ...validBusiness, isAdmin: true }` -> rejected by `keys().hasOnly(...)`.
2. **Owner Spoofing on Business Create**: `{ ...validBusiness, ownerId: "victim_uid" }` -> rejected by `data.ownerId == request.auth.uid`.
3. **Cross-Tenant Business Read/List**: Authenticated attacker queries `businesses` where `ownerId == "victim_uid"` -> rejected by `resource.data.ownerId == request.auth.uid`.
4. **Unverified Email Write**: User with `email_verified: false` attempts to create a `businesses` document -> rejected by `isVerifiedUser()`.
5. **Oversized Document ID Poisoning**: Creating `/businesses/${"a".repeat(200)}` -> rejected by `isValidId(businessId)` (`<= 128`).
6. **Public Scraping of Published Bots**: Unauthenticated `list` query on `/publishedBots` -> rejected by `allow list: if false`.
7. **Public Read of Unpublished Bot**: Unauthenticated `get` on `/publishedBots/draft_biz` where `isPublished == false` -> rejected.
8. **Public Read of Knowledge Base**: Unauthenticated or cross-tenant `get`/`list` on `/businesses/biz1/knowledge` -> rejected by parent `ownerId` check.
9. **Support Ticket Status Bypass on Create**: Public user creates ticket with `status: "resolved"` or non-empty `internalNotes` -> rejected by `incoming().status == 'open' && incoming().internalNotes == ''`.
10. **Support Ticket Customer Field Tampering by Owner**: Owner updates `description` or `customerEmail` on a ticket instead of only `status`, `internalNotes`, `updatedAt` -> rejected by `affectedKeys().hasOnly(['status', 'internalNotes', 'updatedAt'])`.
11. **Timestamp Forgery**: Client sends `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` -> rejected by `incoming().createdAt == request.time`.
12. **Conversation Cross-Tenant Owner Forgery**: Public visitor creates a conversation for `biz1` while setting `ownerId: "attacker_uid"` -> rejected by `incoming().ownerId == get(.../publishedBots/biz1).data.ownerId`.
