# CareBridge — Roadmap (Post-V2)

_Last updated: Feb 2026_
_Current state: V2 complete (21-item workflow upgrade) — 26/26 V2 + 19/19 V1 tests green._

This file captures everything that is **not yet built**, grouped by priority and
release theme. Anything marked **NOT IN SCOPE** is intentionally excluded per
the V2 product philosophy ("clinical communication assistant, not an EMR").

---

## V3 — Delivery & Polish (next phase)

Goal: turn approved AI summaries into something the patient actually receives,
and tighten the production rails.

### P0 — Patient-facing delivery
- [ ] **PDF generation** for approved summaries
  - WeasyPrint or ReportLab on backend
  - Branded clinic header (uses clinic logo when uploaded)
  - Bilingual support (English + Hindi, then 2–3 more Indian languages)
  - Replace "Download PDF" placeholder on Summary Review with real download
- [ ] **WhatsApp delivery** for "Send to Patient"
  - Gupshup or Twilio WhatsApp Business API
  - Short text body + PDF attachment
  - Per-doctor template configured under Settings → Notifications
- [ ] **Email delivery** (fallback when WhatsApp opt-out)
  - Resend or SendGrid
  - HTML template that matches the PDF
- [ ] **Delivery audit**: every send logs `summary_shared` activity with channel + status

### P0 — Clinic Branding
- [ ] **Logo upload** UI wired to existing `/api/uploads/logo`
- [ ] Logo displays on PDFs and (later) on the Patient App
- [ ] Settings → Clinic Profile picture preview + replace flow

### P1 — Production hardening
- [ ] **CORS** tighten — replace `*` with explicit frontend URL (currently breaks if split-deployed because `allow_credentials=True`)
- [ ] **Remove demo credential prefill** from Login.jsx before any real deploy
- [ ] **Split `server.py`** (1230+ lines) into:
  - `routers/{auth,patients,consultations,family,dashboard,search,uploads}.py`
  - `services/{ai,storage,activity,pdf,delivery}.py`
- [ ] **Background-task** version of `/auto-generate` + polling endpoint (currently a 10–20s foreground request)
- [ ] **Stricter Pydantic schemas**:
  - `vitals` → sub-model with explicit fields (bp/hr/temp/spo2/weight)
  - `followup_date` → `date` type with ISO validation
- [ ] **Audit symmetry**: log `followup_cleared` when follow-up is removed
- [ ] **Failure events**: log `summary_generation_failed` so the audit log isn't blind to AI errors

---

## V4 — Multi-staff & Multi-clinic

Goal: support clinics with multiple doctors and a receptionist who manages the front desk.

### P0
- [ ] **Roles**: `clinic_admin`, `doctor`, `receptionist`
  - `clinic_admin` can create/disable doctor accounts (already a hidden endpoint, expose under Settings → Team)
  - `receptionist` can search patients, register family members, and create draft consultations — but cannot approve summaries
- [ ] **Team management UI** under Settings → Team
- [ ] **Inviting** new staff via email (Resend) with a one-time signup link
- [ ] **MFA enrollment** with TOTP authenticator (turn the current placeholder toggle into a real flow)
- [ ] **Active Sessions** + **Login History** wired to real session records (replace placeholders)
- [ ] **Audit Log Viewer** — full searchable timeline at clinic level (currently per-patient only)

### P1
- [ ] **Multi-clinic** support: one doctor can belong to multiple clinics, switch context in header
- [ ] **Role-based dashboard variants** (receptionist sees a different home screen)

---

## V5 — Patient App

Goal: turn the "Patient App — SOON" placeholder into a real lightweight web app
the patient opens via a magic link in WhatsApp/Email.

### P0
- [ ] **Patient login**: passwordless magic link or OTP to mobile
- [ ] **Approved summaries**: list of past visits + the AI-friendly summary
- [ ] **Medication reminders**: opt-in nudges based on `patient_summary.dosage`
- [ ] **Follow-up confirmation**: one-tap confirm/reschedule for next visit
- [ ] **Family switcher**: members of the same Family Account can view their own records under one login (auth per `patient_id`, not per phone)

### P1
- [ ] **Voice-language summaries**: TTS the patient summary in Hindi/Tamil/Bengali/etc. (uses ElevenLabs or OpenAI TTS)
- [ ] **Symptom check-in** between visits (free-text → triage suggestion + flag for doctor)

---

## V6 — Intelligence layer (advanced AI)

Goal: get more out of every consultation that's already recorded.

### P0
- [ ] **Family Wellness Snapshot** (the V2 finish-summary suggestion)
  - Weekly digest to the primary family contact summarising all approved consultations
  - One WhatsApp message per family per week — huge retention hook for Indian households
- [ ] **Clinic-level analytics**
  - Most common diagnoses this month
  - Average time-to-summary
  - Follow-up adherence (was the scheduled follow-up actually booked?)
- [ ] **Smart vitals validation**: AI flags inconsistencies (e.g. "BP 220/130 — confirm")
- [ ] **Drug-interaction warnings** when a generated summary lists a medicine that conflicts with the patient's existing medications

### P1
- [ ] **Voice-driven vitals entry** during recording ("BP is one twenty over eighty")
- [ ] **Per-doctor template learning**: the AI gradually matches each doctor's preferred summary style
- [ ] **Translation**: auto-translate patient summary into the patient's preferred language

---

## V7 — Integrations

### P1
- [ ] **Calendar sync** (Google Calendar) for follow-ups
- [ ] **ABDM / Ayushman Bharat** linkage (India's national health ID)
- [ ] **PACS / lab report attachments** on patient profile (read-only attachments only — still not a full EMR)

### Notes on integrations
We will not chase ambitious lab/pharmacy/insurance integrations until V7. Per the
V2 product philosophy, CareBridge is a consultation + communication tool, not
an EMR. Anything that pulls us back into "managing the whole patient record"
should be politely pushed to a future major version.

---

## Continuous improvement (no specific version)

- [ ] Performance: index `consultations` by `(doctor_id, followup_date)` for the queue view
- [ ] Performance: paginate `/patients` beyond 500
- [ ] Move file uploads to streaming (currently buffers full file in memory)
- [ ] Switch JWT cookies to `Secure` + `SameSite=Strict` once on a stable HTTPS domain
- [ ] Move from `motor` to `motor` w/ async transactions for atomicity in family-creation flow
- [ ] Add `DELETE /api/family-accounts/{family_id}/members/{patient_id}` so an unlink is possible (currently irreversible by API)
- [ ] More languages in the patient summary prompt
- [ ] Add `eslint-plugin-tailwindcss` for class-order consistency in the frontend
- [ ] Reduce server.py file size (split as listed in V3 hardening)

---

## NOT IN SCOPE (intentionally excluded — per V2 product philosophy)

- ❌ Billing / invoicing
- ❌ Insurance claims processing
- ❌ Payments (collecting consult fees, etc.)
- ❌ Pharmacy inventory / stock management
- ❌ Lab integrations beyond simple attachment view
- ❌ Public patient portal (different product)
- ❌ EMR-grade record editing (we are an AI communication assistant)

If a customer asks for the above, the answer is: "Not in CareBridge."
The product wins by staying focused on the consultation → summary → patient
loop. Everything else is a distraction.

---

## Current technical debt (snapshot Feb 2026)

| Area | Issue | Severity |
|------|-------|----------|
| `server.py` | 1230+ lines, single file | Medium |
| `/auto-generate` | foreground (10–20s) | Medium |
| `vitals` schema | `Optional[dict]` — no validation | Low |
| `followup_date` | `Optional[str]` — no ISO validation | Low |
| CORS | `*` + `allow_credentials=True` | Medium |
| Login page | demo creds pre-filled in dev (now empty in V2) | Cleared |
| Audit log | no `failed`/`cleared` events | Low |
| Family unlink | no DELETE endpoint | Low |

---

## How to use this file

1. Pick a `[ ]` item — they're already prioritised within each phase
2. Open a branch named after the phase + slug (e.g. `v3-pdf-generation`)
3. Bring `/app/memory/PRD.md` and `/app/memory/test_credentials.md` along
4. Run `pytest /app/backend/tests/` before AND after — both suites must stay green
5. Update this file: tick the box, move any new items into the right phase
