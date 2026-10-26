# DLOVS: Digital Land Ownership Verification System

**Initial Software Product / Solution Demonstration** · FullStack track
BSc. Software Engineering Capstone · Monica Akoi Dau Ahol · African Leadership University · Supervisor: Hubert Apana

DLOVS lets anyone in Juba check who legitimately owns a plot of land **before money changes hands**. Every registered
parcel gets a signed QR code for its plot marker. Anyone can look a parcel up (no account needed) and see the
registered owner, ownership history, open disputes, and which documents a land officer has verified. Owners upload
their documents, flag disputes, and request transfers; land officers review and act on them; and every officer action
is written to an audit log that the database itself refuses to alter.

| Component | Tech | Users |
|---|---|---|
| **Backend API** | Node.js / Express 5, TypeScript, PostgreSQL | Shared by both apps |
| **Web app** | React 19 + Vite + TypeScript, English and Arabic | The public, citizens, land officers, administrators |
| **Mobile app** | React Native, Expo SDK 57, TypeScript, English and Arabic | The public and citizens, scanning QR codes on the ground |

## Links

- **GitHub repository:** https://github.com/Monica486-bot/dlovs
- **Figma prototype (18 screens):** https://www.figma.com/design/2mrZb7K98KKKn21Zky1C9y/DLOVS-App-Screens?node-id=0-1&p=f&t=NDGbDICq0c3tA6cJ-0
- **Video demo:** https://screenrec.com/share/fbS06nAG3K

## Functional requirements

| | Requirement (proposal Table 4) | Web app | Mobile app |
|---|---|---|---|
| FR01 | Registration by phone + SMS one-time code; officers created by admins only | Create Account → Confirm phone; Admin Panel | Create Account → Confirm Phone |
| FR02 | Anyone can verify without an account | *Verify a Parcel* | Home screen, no login needed |
| FR03 | Officers create, edit, deactivate parcel records | Register Parcel, Edit Details, Admin Panel | Not in the app (officer tools are web only, as in the use case diagram) |
| FR04 | GPS capture with a 10 m accuracy warning | *Use my current location* on every GPS form | Location check and ✓ badge on every record; *Near me* search; plot reports |
| FR05 | Signed, printable QR code per parcel, encoding the verification URL | Parcel record → Show QR Code → Print | Scanned by the app; any phone camera opens the web record |
| FR06 | Four verification pathways: QR, parcel ID, name / area / GPS, national ID | Search (national ID: officers and administrators only) | Scan, and Search (ID, owner, area, near me) |
| FR07 | Full record: owner, GPS, dates, history, documents, disputes | Parcel record pages | Ownership Record |
| FR08 | Append-only ownership history | History table; database triggers refuse edits and deletes | Ownership history on every record |
| FR09 | Owner portfolio, for any user | *All parcels owned by…* (public and staff); *My Parcels* | *All parcels owned by…*; My Parcels |
| FR10 | Document upload, officer verification | Citizen parcel page, staff parcel page, *Documents* queue | My Parcel → Upload a document |
| FR11 | Land transfer with history and a **new QR code** | Transfer Ownership (shows the new code to print); citizen transfer requests | My Parcel → Transfer to a buyer; old markers read as *replaced* |
| FR12 | Ownership / boundary dispute flags | Public record page (citizens); *Disputes* (officers) | Flag a Dispute |
| FR13 | Report an unregistered parcel | *Report a Plot*; officers' *Unregistered Plots* queue | *Report This Plot* on every empty search; Report a Plot |
| FR14 | Officer audit trail + separation of duties | *Audit Log*; officers can't review documents on parcels they registered or uploaded | - |
| FR15 | Notifications | 🔔 in-app; SMS for events affecting a citizen's own land | **Expo push** + Notifications screen; SMS |
| FR16 | Offline cache (last 50 records) | - | Recently Viewed, with a "saved copy" warning |
| FR17 | Search filters | Status, registration date range, document status | Same filters on search results |
| FR18 | Low-bandwidth | Text-only pages, no map tiles (~138 KB gzipped app) | Text-only records; 15 s timeout before falling back to the cache |
| FR19 | English and Arabic | العربية / English switch; full right-to-left layout | Same switch in every screen's header; right-to-left layout |
| FR20 | Account recovery | Forgot password (SMS code) for citizens; admin resets officer passwords | Forgot Password? (SMS code) |
| FR21 | Administrator dashboard | Admin Panel + *Usage Reports* with CSV export | - |

**Security and data integrity**
- Public sign-up only creates citizen accounts; one citizen account per national ID (the ID is what links an account to land).
- **A national ID only links an account to land after a land officer has seen the ID card in person** (*ID Checks* queue).
  Until then the account can't see, upload to, or request a transfer of anyone's parcels, so typing someone else's ID
  number gets an impostor nothing, and an officer can reject the claim to free the ID for its real owner.
- **ID checks are only requested for national IDs that own land.** Anyone can sign up to flag disputes or report
  plots, but an account without land never reaches the officers' *ID Checks* queue. When land is later registered or
  transferred to that ID, the account is told by SMS and in-app notification to bring the ID card in once.
- Deactivating an account or changing a role takes effect on the next request.
- **Owners are registered with four names** (first name, middle name, second middle name, surname), as on South Sudanese
  IDs and passports: for new parcels, transfers and transfer requests. Two people called "Akoi Deng" are common;
  four names rarely collide.
- National IDs, phone numbers, document files and QR signatures are never sent to the public, and **only staff can search
  by national ID**: knowing someone's ID number doesn't reveal their land.
- **A national ID belongs to one person.** Registering or transferring land to an ID that is already registered under
  a different name is refused (the officer is told whose ID it is; a citizen is not), instead of quietly giving the
  land to the existing holder of that ID.
- **Every transfer issues a new QR code.** The signature covers a version number, so the previous owner's marker still
  reads as a genuine DLOVS code but is flagged *replaced*, the warning sign of someone reselling land they've sold.
- Documents are **encrypted at rest** (AES-256-GCM) before they're stored, and checked by content: a renamed file isn't accepted as a PDF.
- **No transfer without the owner's consent.** A transfer goes through only with one of:
  - the owner's own transfer request, and only to the buyer named in it;
  - an SMS code sent to the owner's registered phone, which the owner reads to the officer ("if you did NOT agree, do
    not share it");
  - for owners without an account, the written consent recorded by the officer **and approved by a second officer**.

  No single officer can move land on their own word.
- **Transfers without an officer.** When the buyer named in an owner's request has an account whose national ID was
  confirmed in person (under the same name), the buyer accepts in *My Requests* with an SMS code and the parcel is
  transferred straight away: the owner's request and the buyer's code are both parties' consent. The audit log records
  it with no officer, and officers are only asked to print the new QR marker. Buyers without a confirmed account still
  go through the land office.
- **Owners see every officer action on their land.** Registration, edits, document decisions, uploads on their behalf,
  cancelled transfers and deactivation each send the owner an SMS and in-app alert naming the officer.
- Transfers lock the parcel and are refused while it's disputed, deactivated, or if someone else transferred it first.
- **Dispute flags are limited:** one open dispute per person per parcel, and at most 3 open disputes per account, so
  one account can't freeze sales across the register (a flag blocks transfers until an officer resolves it).
- Login and SMS-code endpoints are rate-limited; codes are hashed, expire after 10 minutes, and lock after 5 wrong tries.
- Security headers (helmet), CORS allow-list, bcrypt passwords, JWT sessions.
- **No secrets in the code.** `JWT_SECRET`, `QR_SIGNING_SECRET`, `DOCUMENT_ENCRYPTION_KEY`, API keys and the demo
  password come only from environment variables; the server refuses to start without them, and in production
  rejects placeholder or short values.

## Screenshots

### Public (no account needed)

| Verify a parcel | GPS search ("near me") | Disputed parcel |
|---|---|---|
| ![Verify](docs/screenshots/pub_verify_search.png) | ![Near search](docs/screenshots/pub_near_search.png) | ![Disputed](docs/screenshots/pub_parcel_disputed.png) |

### Citizen

| Confirm phone by SMS code | Waiting for the ID check | My Parcels (ID confirmed) |
|---|---|---|
| ![Confirm phone](docs/screenshots/pub_verify_phone.png) | ![ID pending](docs/screenshots/citizen_id_pending.png) | ![My parcels](docs/screenshots/citizen_my_parcels.png) |

| My parcel: documents and transfer request |
|---|
| ![My parcel](docs/screenshots/citizen_parcel.png) |

| Flag a dispute | My Requests |
|---|---|
| ![Flag dispute](docs/screenshots/citizen_flag_dispute.png) | ![Requests](docs/screenshots/citizen_requests.png) |

### Land officer

| Dashboard with work queues | Parcel record with printable QR | Register a parcel (GPS from device) |
|---|---|---|
| ![Dashboard](docs/screenshots/staff_dashboard.png) | ![Parcel record](docs/screenshots/staff_parcel_record.png) | ![Register](docs/screenshots/staff_register_parcel.png) |

| Documents: separation of duties | Documents: another officer verifies | Transfer from a citizen's request |
|---|---|---|
| ![Blocked](docs/screenshots/staff_documents_blocked.png) | ![Review](docs/screenshots/staff_documents_review.png) | ![Transfer](docs/screenshots/staff_transfer_from_request.png) |

| Transfer requests | Unregistered plot reports | Disputes |
|---|---|---|
| ![Requests](docs/screenshots/staff_transfer_requests.png) | ![Plot report](docs/screenshots/staff_plot_report.png) | ![Disputes](docs/screenshots/staff_disputes.png) |

| ID checks (in person) | Owner portfolio | Search with filters |
|---|---|---|
| ![ID checks](docs/screenshots/staff_id_checks.png) | ![Portfolio](docs/screenshots/staff_owner_portfolio.png) | ![Search](docs/screenshots/staff_search.png) |

| Audit log | Notifications |
|---|---|
| ![Audit](docs/screenshots/staff_audit_log.png) | ![Notifications](docs/screenshots/staff_notifications.png) |

### Administrator

| Usage reports | Admin panel (accounts, password resets) |
|---|---|
| ![Reports](docs/screenshots/admin_reports.png) | ![Admin](docs/screenshots/admin_panel.png) |

### Arabic (right-to-left) and phones

| Public record in Arabic | Officer dashboard in Arabic | Phone: public record | Phone: citizen |
|---|---|---|---|
| ![AR public](docs/screenshots/ar_public_parcel.png) | ![AR dashboard](docs/screenshots/ar_staff_dashboard.png) | <img src="docs/screenshots/phone_public_parcel.png" width="200"> | <img src="docs/screenshots/phone_citizen_parcels.png" width="200"> |

<details>
<summary>Mobile app screenshots (taken before the documents, notifications and Arabic screens were added)</summary>

| Home | Verified record | Forged QR code | Offline copy |
|---|---|---|---|
| <img src="docs/screenshots/mobile_home.png" width="190"> | <img src="docs/screenshots/mobile_record.png" width="190"> | <img src="docs/screenshots/mobile_fake_qr.png" width="190"> | <img src="docs/screenshots/mobile_offline_record.png" width="190"> |

</details>

## How to set up the environment and the project

### Prerequisites
- Node.js 20 or newer
- PostgreSQL 14 or newer

### 1. Backend API

```bash
cd backend
npm install
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, QR_SIGNING_SECRET (see the file for the others)

createdb dlovs_db
psql -d dlovs_db -f db/schema.sql
# upgrading a database from an earlier version instead? keep your data with:
#   psql -d dlovs_db -f db/migrations/001_user_national_id_and_active.sql
#   psql -d dlovs_db -f db/migrations/002_web_portal_documents_notifications.sql
#   psql -d dlovs_db -f db/migrations/003_national_id_verification.sql
#   psql -d dlovs_db -f db/migrations/004_qr_versions_and_push_tokens.sql
#   psql -d dlovs_db -f db/migrations/005_parcel_city.sql
#   psql -d dlovs_db -f db/migrations/006_pending_transfers.sql
#   psql -d dlovs_db -f db/migrations/007_transfer_reasons.sql
#   psql -d dlovs_db -f db/migrations/008_request_reasons.sql

npm run seed                # demo accounts and parcels (empty database only)
npm start                   # http://localhost:4000
```

Optional settings in `backend/.env`. Everything works without them for a local demo:

| Setting | Without it | With it |
|---|---|---|
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` | SMS codes are printed in the server log, and shown on screen in a "Demo mode" box | Codes and notifications are sent through Twilio |
| `CLOUDINARY_URL` | Encrypted documents are stored in `backend/uploads/` | Encrypted documents are stored in Cloudinary (needed on Render, which has no lasting disk) |
| `DOCUMENT_ENCRYPTION_KEY` | A development key is derived from `JWT_SECRET` | **Required in production.** 64 hex characters; losing it makes stored documents unreadable |
| `CORS_ORIGINS` | Any website may call the API | Only the listed web app addresses may |
| `PUBLIC_WEB_URL` | QR codes link to `http://localhost:5173/verify/…` | QR codes link to the deployed web app. **Set it before printing markers** |

Not using the demo data? Create the first administrator with
`npm run create-admin -- "Full Name" "+211900000009" "password"`, then create officers from the Admin Panel.

### 2. Web app

```bash
cd web
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:4000/api
npm run dev                 # http://localhost:5173
```

### 3. Mobile app

```bash
cd mobile
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://<your computer's Wi-Fi IP>:4000/api
npx expo start              # scan the terminal QR code with Expo Go
```

Everything except push notifications works in Expo Go. Push needs an Android build, see
[mobile/README.md](mobile/README.md) for `eas init` and building the APK.

### 4. Automated tests

```bash
cd backend
npm test                    # Jest + Supertest against a separate dlovs_test database
```

The tests create `dlovs_test` on the same PostgreSQL server as `DATABASE_URL` (or use `TEST_DATABASE_URL`) and reload
the schema on every run. They refuse to run against a database whose name doesn't end in `_test`.

### Demo accounts (from `npm run seed`)

Every account's password is the `SEED_PASSWORD` you set in `backend/.env` before running `npm run seed`. The seed
script refuses to run with `NODE_ENV=production`, so demo accounts never reach the live database.

| Role | Phone | Name | Use it to |
|---|---|---|---|
| Administrator | +211900000009 | Ayen Garang | Admin Panel, Usage Reports |
| Land officer | +211900000001 | Officer Deng Majok | Registered parcels #1, #2, #5, #6 |
| Land officer | +211900000003 | Officer Lado Wani | Registered #3, #4, so he can review documents on Deng's parcels |
| Citizen | +211900000002 | Akoi Deng Majok Garang (ID SS-0001) | Owns parcels #1 and #2 |
| Citizen | +211900000004 | Nyandeng Kuol Ajak Mayen (ID SS-0004) | Owns parcel #3 (after a transfer) |

The seed parcels cover every state: #1–2 active, #3 transferred, #4 under an open ownership dispute, #5 with a resolved
boundary dispute, #6 deactivated as fraudulent. To create a new citizen, use *Create Account*. The SMS code appears on
screen in demo mode. A new citizen's national ID then appears in the officers' *ID Checks* queue; until an officer
confirms it, *My Parcels* shows nothing. (The two demo citizens are already confirmed.)

## Designs

### UI design process
1. **Requirements → user flows.** The 21 functional requirements and the use case diagram in the proposal defined four
   audiences: the public checking a plot, citizens managing their own land, land officers working through queues, and
   administrators supervising officers.
2. **Figma mockups.** 18 high-fidelity screens: [Figma prototype](https://www.figma.com/design/2mrZb7K98KKKn21Zky1C9y/DLOVS-App-Screens?node-id=0-1&p=f&t=NDGbDICq0c3tA6cJ-0).
3. **Implementation.** The screenshots above are from the running app.

Design decisions that came from the Juba context:
- **Verification first, account second.** The home page is the public search; an account is only needed to act.
- **One header, two layouts.** Every page has the same white header (logo left; name, role and avatar right, as in the
  Figma screens). Officers and administrators also get a navy sidebar organised around their work queues.
- **Short, calm status messages** ("Disputed: not available for sale until resolved") instead of paragraphs of warnings.
- **Arabic with right-to-left layout,** switchable on every page, each language named in its own script.
- **Text only, no map tiles,** so pages stay light on 2G/3G.
- **Dates as "2 Aug 2026"** in the user's own time zone, so a land record's date can't be misread.

### Style guide

| Token | Value | Used for |
|---|---|---|
| Navy | `#1C3A5E` | Sidebar, primary buttons, logo, links (from the Figma screens) |
| Light blue | `#2E75B6` | Keyboard focus outline |
| Pale blue | `#E8EEF6` | Info notices, selected options |
| Background | `#F4F6F9` | Page background; cards are white with a `#E3E7EC` border |
| Success | `#256B29` on `#E7F4EA` | Active, verified, completed |
| Warning | `#8A5A00` on `#FFF4DC` | Disputed, pending, low GPS accuracy |
| Danger | `#C62828` on `#FDECEC` | Rejected, deactivated, fraud, Flag Dispute |

- **Type:** Inter (as in Figma), falling back to system fonts (Segoe UI / Noto Sans Arabic) if it can't be downloaded.
- **Tables:** small uppercase grey column headings, thin row dividers, a "View →" link per row.
- **Accessibility:** every field has a visible label, keyboard focus is clearly outlined, status is always written in
  words as well as colour, and text colours meet WCAG AA contrast.
- **Components:** buttons, cards, notices (four tones), status badges, tabs, filter bars, in `web/src/index.css`.

### Database schema

Implements the ERD (proposal Figure 3) in [`backend/db/schema.sql`](backend/db/schema.sql), plus tables for the
features above:

```mermaid
erDiagram
    USER ||--o{ PARCEL : "registers"
    OWNER ||--o{ PARCEL : "currently owns"
    PARCEL ||--o{ OWNERSHIP_HISTORY : "has"
    OWNER ||--o{ OWNERSHIP_HISTORY : "previous / new owner"
    PARCEL ||--o{ DOCUMENT : "has"
    USER ||--o{ DOCUMENT : "uploads / verifies"
    PARCEL ||--o{ DISPUTE : "has"
    USER ||--o{ DISPUTE : "reports / resolves"
    PARCEL ||--o{ TRANSFER_REQUEST : "has"
    USER ||--o{ TRANSFER_REQUEST : "requests / handles"
    USER ||--o{ UNREGISTERED_REPORT : "reports / handles"
    USER ||--o{ NOTIFICATION : "receives"
    USER ||--o{ AUDIT_LOG : "performs"
    PARCEL ||--o{ AUDIT_LOG : "about"

    USER {
        int user_id PK
        string phone_number UK
        string role "citizen | land_officer | administrator"
        string national_id "unique per citizen; links them to their land"
        bool is_active
        bool phone_verified
        timestamp national_id_verified_at "set by an officer after seeing the ID card"
    }
    OWNER {
        int owner_id PK
        string full_name
        string national_id
    }
    PARCEL {
        int parcel_id PK
        decimal gps_lat
        decimal gps_lng
        string neighbourhood
        int registered_by FK
        int current_owner_id FK
        string status "active | disputed | deactivated"
    }
    OWNERSHIP_HISTORY {
        int history_id PK
        int parcel_id FK
        int previous_owner_id FK
        int new_owner_id FK
        int processed_by FK
    }
    DOCUMENT {
        int document_id PK
        int parcel_id FK
        int uploaded_by FK
        int verified_by FK
        string document_type
        string file_url "encrypted blob reference"
        string verification_status "pending | verified | rejected"
    }
    DISPUTE {
        int dispute_id PK
        int parcel_id FK
        string dispute_type "ownership | boundary"
        string status "open | resolved"
    }
    TRANSFER_REQUEST {
        int request_id PK
        int parcel_id FK
        string buyer_national_id
        string status "pending | completed | rejected"
    }
    UNREGISTERED_REPORT {
        int report_id PK
        string neighbourhood
        string status "open | registered | dismissed"
    }
    NOTIFICATION {
        int notification_id PK
        int user_id FK
        string message
        bool is_read
    }
    AUDIT_LOG {
        int log_id PK
        int officer_id FK
        string action_type
        int parcel_id FK
        timestamp timestamp
    }
```

`ownership_history` and `audit_log` are **append-only**: database triggers reject every `UPDATE`, `DELETE` and
`TRUNCATE`, so not even someone with direct database access can quietly rewrite who owned a plot or what an officer did.
`phone_code` (hashed SMS codes) completes the schema.

### API endpoints

| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` → `/verify-phone` | Anyone | Citizen sign-up, then confirm the SMS code |
| POST | `/api/auth/login` | Anyone | Get a JWT (refused until the phone is confirmed) |
| POST | `/api/auth/forgot-password` → `/reset-password-with-code` | Anyone | Citizen password reset by SMS |
| POST | `/api/auth/reset-password` | Logged in | Change your own password (needs the current one) |
| GET | `/api/parcels/search?by=&query=` | Anyone | `by`: `any`, `parcel_id`, `owner_name`, `neighbourhood`, `national_id` (exact), or `near` with `lat`, `lng`, `radius` |
| GET | `/api/parcels/neighbourhoods` | Anyone | Juba neighbourhoods for the parcel forms' dropdown |
| GET | `/api/parcels/:id/verify?signature=` | Anyone | Ownership record (identity fields only for staff). With a scanned QR signature, `qr_check` is `valid` or `superseded` (replaced by a transfer); a forged one returns 400 `QR_INVALID` |
| GET | `/api/parcels/mine` | Citizen | Parcels registered to my national ID |
| POST · PUT | `/api/parcels` · `/api/parcels/:id` | Land officer | Register (with QR) · edit location details |
| GET | `/api/parcels/:id/transfer-consent` | Land officer | Which consent a transfer needs (owner's SMS code or a second officer), and any transfer already waiting |
| GET | `/api/parcels/transfer-reasons` | Anyone | Reasons for a transfer (sale, inheritance, gift, court order, government allocation, correction, other) |
| POST | `/api/parcels/:id/transfer` | Land officer | Needs a `reason` (and `reason_details` for *Other*), shown in the ownership history. With `transfer_request_id`: completes the owner's request (200). Otherwise starts a transfer that waits for consent (202): SMS code to the owner, or `consent_document` for a second officer |
| GET | `/api/pending-transfers` | Staff | Transfers waiting for consent |
| POST | `/api/pending-transfers/:id/confirm` · `/resend` | Officer who started it | Enter the owner's code (new QR issued) · send a new code |
| PUT | `/api/pending-transfers/:id/approve` · `/reject` · `/cancel` | Another officer · starter or admin | Approve or reject the written consent · cancel |
| POST · GET | `/api/parcels/:id/documents` | Owner, land officer | Upload (multipart, 5 MB) · list |
| GET · PUT | `/api/documents` · `/api/documents/:id/review` | Officers | Review queue · verify or reject (separation of duties enforced) |
| GET | `/api/documents/:id/file` | Staff, uploader, owner | Decrypted file |
| POST | `/api/parcels/:id/transfer-requests` | Owner | Ask for a transfer to a buyer, with a `reason` (and `reason_details` for *Other*) |
| GET · PUT | `/api/transfer-requests` · `/:id/reject` | Officers | Queue · reject with a reason |
| POST · POST · PUT | `/api/transfer-requests/:id/accept-code` · `/:id/accept` · `/:id/decline` | Buyer (confirmed account) | Get an SMS code · accept with it (transfers the parcel, no officer) · decline |
| POST · GET · PUT | `/api/unregistered-reports` | Citizen · officers | Report a plot · queue · close |
| POST · GET · PUT | `/api/disputes` · `/:id/resolve` | Citizen · officers | Flag · list · resolve |
| GET | `/api/owners/:id` | Anyone | Owner portfolio (national ID and phone only for staff) |
| POST · DELETE | `/api/push-tokens` | Logged in | Register / remove the mobile app's Expo push token |
| GET · PUT | `/api/id-checks` · `/api/id-checks/:userId` | Staff | Citizens waiting for an in-person ID check · confirm or reject |
| GET · PUT | `/api/notifications` · `/read-all` | Logged in | Notifications |
| GET | `/api/parcels/stats` | Staff | Dashboard counts and queues |
| GET | `/api/audit-logs` | Staff | Officers: own actions; admins: all |
| GET · POST · PUT | `/api/admin/users…` (`role`, `national-id`, `password`, `deactivate`, `reactivate`) | Administrator | Manage accounts |
| GET | `/api/admin/reports?from=&to=` | Administrator | Usage report |

## Code highlights

**Separation of duties**: [`backend/controllers/documentController.ts`](backend/controllers/documentController.ts).
The server decides who may review a document, and the web app shows the reason instead of the buttons:

```js
function reviewBlock(user, doc) {
  if (user.role !== 'land_officer') return 'Only land officers review documents';
  if (doc.verification_status !== 'pending') return 'Already reviewed';
  if (doc.registered_by === user.user_id) return 'You registered this parcel, so another officer reviews its documents';
  if (doc.uploaded_by === user.user_id) return 'You uploaded this document, so another officer reviews it';
  return null;
}
```

**Documents encrypted at rest**: [`backend/utils/documentStorage.ts`](backend/utils/documentStorage.ts). Files are
encrypted before they leave the server, so it doesn't matter whether they land on disk or in Cloudinary:

```js
function encrypt(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);   // GCM tag detects any tampering
}
```

**History nobody can rewrite**: [`backend/db/schema.sql`](backend/db/schema.sql):

```sql
CREATE TRIGGER ownership_history_append_only BEFORE UPDATE OR DELETE ON ownership_history
  FOR EACH ROW EXECUTE FUNCTION dlovs_append_only();   -- raises "ownership_history is append-only"
```

**No double sales**: [`backend/controllers/parcelController.ts`](backend/controllers/parcelController.ts). Tested
with two officers transferring the same plot at the same instant: one succeeds, the other is refused:

```js
const parcelResult = await client.query('SELECT current_owner_id, status FROM parcel WHERE parcel_id = $1 FOR UPDATE', [id]);
// …
if (expected_owner_id != null && Number(expected_owner_id) !== current.current_owner_id) {
  return res.status(409).json({ error: `Ownership changed since you opened this page. The parcel is now registered to ${current.owner_name}…` });
}
```

**SMS codes**: [`backend/utils/phoneCodes.ts`](backend/utils/phoneCodes.ts). Hashed, single-use, 10-minute expiry,
5 attempts, one request a minute; compared in constant time:

```js
const given = Buffer.from(hash(String(code || '').trim()));
if (!crypto.timingSafeEqual(given, Buffer.from(row.code_hash))) {
  await pool.query('UPDATE phone_code SET attempts = attempts + 1 WHERE code_id = $1', [row.code_id]);
  throw new CodeError('That code is not correct.');
}
```

**Arabic and right-to-left**: [`web/src/i18n/index.tsx`](web/src/i18n/index.tsx). English text in the code is the
lookup key; missing translations are logged in development (all 503 are translated):

```js
const t = (text, vars) => {
  let result = lang === 'ar' && ar[text] !== undefined ? ar[text] : text;
  return vars ? result.replace(/\{(\w+)\}/g, (m, key) => vars[key] ?? m) : result;
};
// and: document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
```

## Testing

**Automated (`npm test` in `backend/`)**: 55 Jest + Supertest tests, including the proposal's evaluation metric (d):
20 officer transactions (5 parcel registrations, 5 document approvals, 5 transfers, 5 dispute resolutions), each
checked for exactly one audit-log entry with the officer and a timestamp. The others cover SMS-code sign-up, roles,
guest access, signed / forged / replaced QR codes, transfers (new QR, disputed parcels, double sales, owner consent by
SMS code or second officer, swapped buyers), append-only
triggers, all verification pathways, the public portfolio, separation of duties, file type and 5 MB limits, encryption
at rest, disputes, plot reports, transfer requests, ID checks and push tokens.

Also run during development against a fresh copy of the database:
- **129 API checks**: sign-up and SMS codes (wrong codes, lock-out, reuse), password resets, every role restriction,
  document upload (wrong file type, over 5 MB, non-owner), separation of duties, encryption on disk, append-only
  triggers, in-person ID checks (including an impostor using a real owner's ID), transfers (disputed, deactivated, simultaneous double sale), requests, reports, notifications, rate limiting.
- **28 browser steps**: every page above as guest, new citizen, citizen, two officers and administrator; in Arabic;
  and on a phone-sized screen with no sideways scrolling. No browser errors and no untranslated strings.
- Database migrations tested on a copy of the previous schema, and re-run to confirm they're safe to repeat.

## Deployment plan

Everything runs on free tiers, as budgeted in the proposal (Table 1):

| Service | Hosts | Notes |
|---|---|---|
| **Render.com** | Express API + PostgreSQL | Free web services sleep when idle (slow first request); free databases expire after a set period. Upgrade or migrate before field testing. |
| **Netlify** | Web app (static Vite build) | `web/public/_redirects` makes page refreshes work |
| **Cloudinary** | Encrypted documents | Required on Render, whose disk is wiped on every deploy |
| **Twilio** | SMS codes and alerts | Demo mode (no account needed) prints codes to the server log and on screen |
| **Expo EAS** | Mobile app APK and push notifications | `mobile/eas.json` has a `preview` profile that builds an APK |

**Steps**
1. **API + database (Render):** New → Blueprint → this repository. [`render.yaml`](render.yaml) creates the API and
   PostgreSQL and generates `JWT_SECRET` and `QR_SIGNING_SECRET`; fill in `DOCUMENT_ENCRYPTION_KEY`, `CLOUDINARY_URL`,
   `CORS_ORIGINS` and `PUBLIC_WEB_URL` (both the Netlify address) and `AT_API_KEY`. Then load the schema once with
   `psql "<External Database URL>" -f backend/db/schema.sql` and run `npm run create-admin` from the Render shell.
2. **Web app (Netlify):** New site from this repository. [`netlify.toml`](netlify.toml) sets the base, build and
   publish folders. Set `VITE_API_URL=https://<render-service>.onrender.com/api`.
3. **Mobile app:** set `EXPO_PUBLIC_API_URL` to the Render API, then `eas build -p android --profile preview` (see
   [mobile/README.md](mobile/README.md)) and install the APK on the test phones.

## Known limitations

- **Arabic** was drafted for the prototype and should be reviewed by a native speaker (ideally with Juba Arabic for the
  citizen pages) before field testing. Messages written by the server (error messages, audit details, notifications)
  are still in English.
- **Cloudinary and Twilio** are implemented but untested without accounts; the local-storage and on-screen-code
  paths are the ones exercised by the tests above.
- Officers aren't assigned to areas yet, so every officer is notified of every new dispute (proposal FR15 mentions
  "jurisdiction").
- **National ID search is staff-only**, although the proposal's FR06 lists it as a public pathway: a national ID is
  private, and a public search would let anyone who knows an ID number find that person's land.
- National IDs are checked by an officer looking at the ID card; DLOVS can't yet verify an ID against a national register.
- **QR signatures are checked by the API, not on the phone** (the proposal's NFR03 says the app checks them). Checking
  on the phone would mean putting the signing secret inside the APK, where anyone could extract it and sign forged
  codes. The scanned signature is sent with the verification request instead, and a forged code is refused there.
- **QR codes in the public owner portfolio** (FR09) are staff-only; the public sees the portfolio's parcels and links to
  each record, and printing markers stays an officer task.
- Markers printed before the QR code held a verification URL contain a small JSON code instead; the mobile app still
  reads them, but a plain phone camera won't open them. Reprint them from the parcel page.
- **Push notifications** need an EAS project ID and a real Android build (Expo Go no longer supports push); without
  them the app falls back to the Notifications screen and SMS.

## Code files

```
dlovs/
├── backend/                    Node.js / Express API
│   ├── db/schema.sql           database schema, append-only triggers
│   ├── db/migrations/          upgrades for existing databases (safe to re-run)
│   ├── controllers/            auth, parcels, documents, disputes, requests, admin, audit
│   ├── routes/                 endpoint → controller mapping with role checks
│   ├── middleware/             auth (JWT + roles), upload (5 MB limit)
│   ├── utils/                  qr, documentStorage (encryption), phoneCodes, sms, push, notify
│   ├── tests/                  Jest + Supertest API tests (npm test)
│   └── scripts/                seed.js, createAdmin.js (plain JS utility scripts)
├── web/                        React web app
│   └── src/
│       ├── pages/              staff pages; public/ (verify, sign-up, password reset); citizen/
│       ├── components/         layouts, search, parcel record sections, documents, notifications
│       ├── i18n/               language switch and Arabic translations
│       └── utils/              dates, audit labels
├── mobile/                     React Native / Expo app
│   └── src/
│       ├── app/                screens (Expo Router): scan, search, parcel/[id], owner/[id], mine,
│       │                       my-parcel/[id], dispute, report-plot, notifications, account, sign-in screens
│       ├── components/         buttons, cards, banners, chips, status pills
│       ├── i18n/               language switch and Arabic translations
│       └── utils/              offline cache, GPS + Haversine, QR parsing, push notifications
├── render.yaml                 Render blueprint (API + PostgreSQL)
├── netlify.toml                Netlify build for the web app
└── docs/screenshots/
```
