# CareBridge — Product Requirements Document (PRD)

## Original Problem Statement
Build the doctor-facing interface for **CareBridge**, a healthcare web app that lets doctors capture consultations and generate patient-friendly visit summaries. Modern healthcare SaaS aesthetic: clean white background, blue/teal medical accent color, tablet-friendly, minimal clicks. Consent-first workflow with masked patient details in lists and clear privacy messaging before recording. Indian healthcare context.

CareBridge is NOT an EMR — it is an AI-powered clinical communication assistant.

## V2 Spec (Feb 2026)
Workflow improvements while preserving V1 visual style and core functionality. 21-item spec covering: search-first patient creation, quick-add patient, DOB-based age, auto-save drafts, big consultation timer, 6-level status badges, auto AI summary on transcript save, follow-up management, audit timeline, expanded security, removal of self-registration, recent activity widget, draft recovery, additional dashboard metrics, family-account workflow for Indian households.

## User Personas
- **Primary**: A clinic doctor (GP / specialist) capturing consultations on a tablet, getting AI-drafted clinical notes + patient-friendly summaries.
- **Secondary**: Clinic Administrator who creates doctor accounts (replaces self-registration in V2).

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`, 1230+ lines) + MongoDB (Motor).
- **Frontend**: React (CRA) + React Router v7 + shadcn/UI + Tailwind + Sonner toasts.
- **Auth**: JWT in httpOnly cookies. Bcrypt hashing. Self-registration disabled (returns 403).
- **AI**: Claude Sonnet 4.5 via Emergent Universal Key. Auto-generates BOTH patient summary AND doctor notes from saved transcript.
- **Transcription**: OpenAI Whisper via Emergent Universal Key.
- **Storage**: Emergent object storage for audio + logos.
- **Fonts**: Outfit (headings) + Plus Jakarta Sans (body). Teal `#0D5C55`, navy `#0F172A`.

## V2 Implemented (Feb 2026)
- **Login V2**: self-registration removed; "Contact Clinic Administrator" message; forgot-password retained.
- **Search-first Start Consultation**: single dialog with search → existing patient OR quick-add (4 fields + consent); prevents duplicate records.
- **Dashboard V2**: 6 metric cards (Today's Consults, Pending Review, Approved Today, Avg Duration, Follow-ups Today, Family Accounts); Recent Activity widget; Resume Draft banner (only shows if real progress); Patient App "SOON" placeholder in sidebar.
- **Consultation timer**: large HH:MM:SS display with pause/resume; duration persisted server-side.
- **Auto-save**: every 30s syncs visit_reason / symptoms / vitals / transcript; "Draft saved" indicator.
- **Auto AI summary**: saving the transcript triggers `/auto-generate` (both patient summary + doctor notes in one call), then auto-navigates to review.
- **Status workflow**: Draft → Pending Summary → Generating → Pending Review → Approved → Shared with Patient. Color-coded badges everywhere (Dashboard, Patient Profile, Consultations, Appointments).
- **Follow-up management**: date picker on Summary Review; persists via `/followup` endpoint; Follow-ups Today dashboard card; Appointments page renders a real Follow-up Queue from `/followups/upcoming`.
- **Patient Profile V2**: new Family + Timeline tabs; upcoming follow-up badge in header.
- **Family Accounts**: one primary contact + multiple linked patients (Self / Spouse / Son / Daughter / Father / Mother / Grandparent / Guardian / Other). Each member keeps own patient_id, consultations, consents, medications. Phone shared from primary contact. `Add Family Member` modal with relationship dropdown + consent.
- **Audit Timeline**: read-only `/patients/{pid}/timeline` returns patient_created, consent_recorded, consultation_started, summary_generated, summary_approved, summary_shared, followup_scheduled. Dashboard activity feed shows latest 12 across all patients.
- **Expanded Security**: MFA toggle, session timeout, Active Sessions list, Login History, Audit Log Viewer (placeholders).
- **Patient-friendly AI prompt**: rewritten for second-person, class-6 reading level, no jargon ("high blood pressure" not "hypertension"). Empty string instead of "N/A".
- **Privacy**: list views and `/search/patients` mask phones; detail view returns full unmasked phone. Family members inherit primary contact's phone (one phone per household).

## Test Coverage
- `/app/backend/tests/test_carebridge_api.py` — V1 suite (19/19 green)
- `/app/backend/tests/test_carebridge_v2.py` — V2 suite (26/26 green)
- Frontend Playwright E2E green on all V2 surfaces.

## Items Intentionally Deferred
Per V2 spec — do NOT build: Billing, Insurance, Payments, Inventory, Lab integrations, Pharmacy integrations, Public patient portal.

## Backlog
### P1 (polish)
- PDF download for approved summaries.
- Send-to-Patient delivery (Resend / WhatsApp via Gupshup).
- Logo upload wired to existing `/api/uploads/logo` backend.
- Tighten CORS_ORIGINS to explicit URL (currently `*` with credentials).

### P2 (architecture)
- Split `server.py` into `routers/` and `services/` modules.
- Background-task version of `/auto-generate` (currently foreground, ~10–20s).
- DELETE endpoint for family member unlink + audit asymmetry for `followup_cleared`.
- Strict pydantic schema for vitals (currently `Optional[dict]`).

### P3 (future)
- Patient App (separate web/native build).
- MFA enrollment with TOTP authenticator.
- Full audit log viewer screen.

## Next Tasks
1. PDF generation for approved summaries (reportlab/WeasyPrint).
2. WhatsApp delivery via Gupshup / Twilio for the "Send to Patient" action.
3. Split `server.py` into per-domain routers.
