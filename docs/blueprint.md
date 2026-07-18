# Product Submission Review Bot — Bot specification

**Archetype:** workflow

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that enables sellers to submit product listings (text + photos) for automated parsing and staff review. Sellers manage multiple storefronts, while internal teams review, edit, assign, and publish products to appropriate storefronts via a Telegram-based workflow.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Sellers (product submitters)
- Internal staff (reviewers)
- Business owners (workflow managers)

## Success criteria

- Sellers can submit product listings with text and photos via Telegram
- Product drafts are auto-created and saved to an unassigned inbox
- Staff can review, edit, assign, and publish products via Telegram notifications/buttons
- Audit trail tracks all review actions and status changes
- Sellers can view their recent submissions via /my_submissions

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Initiate onboarding and display main menu
- **Product submission** (message, actor: user, command: /text_with_photos) — Submit product listing via text and photos
  - inputs: text message, attached photos
  - outputs: confirmation message, product draft in inbox
- **/my_submissions** (command, actor: user, command: /my_submissions) — View recent product submissions and statuses
  - outputs: submission list with status indicators

## Flows

### Seller onboarding
_Trigger:_ /start

1. Authenticate Telegram user
2. Request seller name
3. Offer optional storefront creation

_Data touched:_ Seller account

### Product submission parsing
_Trigger:_ text_with_photos

1. Extract title from first line
2. Parse description and price
3. Save photos in order
4. Create draft in unassigned inbox

_Data touched:_ Product draft, Inbox item

### Staff review workflow
_Trigger:_ new_inbox_item

1. Send staff notification with preview
2. Offer assign/edit/publish/reject buttons
3. Log audit trail for actions

_Data touched:_ Product draft, Review action

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Seller account** _(retention: persistent)_ — Telegram-authenticated seller profile with optional business metadata
  - fields: telegram_id, name, business_type, storefronts
- **Product draft** _(retention: persistent)_ — Parsed product submission with status tracking
  - fields: title, description, price, photos, status, submitter, assigned_storefront, audit_history
- **Review action** _(retention: persistent)_ — Staff decision with timestamp and reason
  - fields: action_type, timestamp, performer, reason

## Integrations

- **Telegram** (required) — Bot API messaging, notifications, and button interactions
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure staff notification targets (group chat + DM)
- Set archival rules for old drafts
- Adjust parsing rules for title/price extraction

## Notifications

- New inbox item alerts to staff group chat and owner DM
- Submission status updates to sellers
- Review action confirmations to staff

## Permissions & privacy

- Telegram user identity is the sole authentication method
- Photos are stored securely with access restricted to authorized staff
- Data retention follows owner-configured archival rules

## Edge cases

- Sellers sending multiple messages for single product (creates separate drafts)
- Missing price in submission (parsed as null)
- Non-Telegram notification channels (not implemented)

## Required tests

- Submission parsing accuracy with mixed text/photos
- End-to-end staff review workflow with audit trail
- Notification delivery reliability in staff group chat

## Assumptions

- Telegram authentication is sufficient for seller identity
- Default parsing rules handle most submission formats
- Staff group chat is the primary review channel
