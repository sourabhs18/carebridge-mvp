# CareBridge — Product Requirements Document (PRD)

## Original Problem Statement
Build the doctor-facing interface for **CareBridge**, a healthcare web app that lets doctors capture consultations and generate patient-friendly visit summaries. Modern healthcare SaaS aesthetic: clean white background, blue/teal medical accent color, tablet-friendly, minimal clicks. Consent-first workflow with masked patient details in lists and clear privacy messaging before recording.

User extended scope to a **fully working app** (not just clickable UI): JWT auth, Claude Sonnet 4.5 for AI summaries, OpenAI Whisper for transcription, Emergent object storage for uploaded media; Indian context for sample data.

## User Personas
- **Primary**: A clinic doctor (GP / specialist) who needs to record consultations on a tablet, get an AI-drafted clinical note + a patient-friendly summary, review/edit, then approve before sharing.
- **Secondary**: Front-desk staff (out of scope for MVP — only "Doctor" role exists today).

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + MongoDB (Motor). Single file with /api routes: auth, patients, consultations (CRUD + transcript + summary), dashboard stats, settings, audio upload + Whisper transcription, AI generation via Claude Sonnet 4.5 (anthropic claude-sonnet-4-5-20250929 via emergentintegrations).
- **Frontend**: React (CRA) + React Router v7 + shadcn/UI + Tailwind + Sonner toasts.
- **Auth**: JWT in httpOnly cookies (`access_token` 12h + `refresh_token` 7d). Bcrypt hashing.
- **Storage**: Emergent object storage (init_storage / put_object) for audio + logos.
- **Fonts**: Outfit (headings) + Plus Jakarta Sans (body). Teal `#0D5C55` primary, navy `#0F172A` accent, white background.

## What's Implemented (2026-02)
- Auth: register / login / logout / me / forgot-password (link logged to console).
- Auto-seeded admin: `doctor@carebridge.health` / `CareBridge@2026` (Dr. Aisha Sharma, Internal Medicine).
- 5 seeded Indian sample patients (Rahul Kumar, Priya Sharma, Vikram Singh, Ananya Iyer, Mohammed Khan) with realistic phones, conditions, medications.
- 8 pages: Login (split hero), Dashboard (4 stat cards + 2 tables), Patients (search + filters + masked phones), Add Patient modal (with consent), Patient Profile (5 tabs incl. Consent Log), Start Consultation (vitals + 3-checkbox consent + MediaRecorder + Whisper upload + Edit/Save transcript + AI generate), Summary Review (two-column editable, Save Draft / Approve), Settings (Doctor / Clinic / Security / Consent template / Notifications).
- Privacy primitives: phone masked in list views (`+91 •••• •• 4321`); sensitive fields (email/address/emergency contact) only on detail view; consent log per patient; 3-checkbox consent gate before recording; AI-approval warning banner; role-based access placeholder.
- Backend regression suite: 19/19 pytest tests passing at `/app/backend/tests/test_carebridge_api.py`.

## Prioritized Backlog
### P0 (functional gaps)
- Logo upload UI is a placeholder — backend endpoint exists, frontend uses dashed empty state.
- Download PDF and Send to Patient buttons currently show toast info only.

### P1 (polish)
- Tighten CORS (`CORS_ORIGINS` to explicit frontend URL instead of `*` since `allow_credentials=True`).
- Remove pre-filled demo credentials from Login before production.
- Patient search debounce + server-side pagination beyond first 500.
- Whisper failure currently writes `[Transcription failed: …]` into the transcript field; better to return 500 + flag.

### P2 (feature growth)
- Public patient share page for approved summaries (out of MVP).
- Appointment scheduling (currently static sample data).
- WhatsApp/Email send for approved summaries (notification toggles exist but no sending wired).
- MFA enrollment + audit log viewer.
- Role-based access for additional clinic staff.

## Next Tasks
1. Wire logo upload to existing `/api/uploads/logo` endpoint from Settings.
2. Implement PDF generation for approved summaries (reportlab) + Send-to-Patient (Resend/SendGrid).
3. Build the audit log viewer page (DB collection already implicitly tracked via consent_log).
