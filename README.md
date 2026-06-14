# CareBridge

AI-powered clinical communication assistant for Indian clinics. Records consultations, transcribes audio with Whisper, generates patient-friendly summaries + clinical notes with Claude Sonnet 4.5, and delivers them with doctor approval.

**Status:** V2 complete. 26/26 V2 backend tests + 19/19 V1 regression tests green.

---

## Stack

- **Backend**: FastAPI + MongoDB (Motor) + emergentintegrations (Claude Sonnet 4.5, Whisper, Object Storage)
- **Frontend**: React (CRA) + Tailwind + shadcn/ui + React Router v7 + Sonner
- **Auth**: JWT in httpOnly cookies, bcrypt hashing
- **Design**: Teal / navy healthcare aesthetic, Outfit + Plus Jakarta Sans, tablet-friendly

## Repo layout

```
/app
├── backend/
│   ├── server.py              # all FastAPI routes (V3 will split this)
│   ├── requirements.txt
│   ├── tests/
│   │   ├── test_carebridge_api.py     # V1 suite (19 tests)
│   │   └── test_carebridge_v2.py      # V2 suite (26 tests)
│   └── .env.example           # see ENVIRONMENT below
├── frontend/
│   ├── src/
│   │   ├── pages/             # Login, Dashboard, Patients, PatientProfile,
│   │   │                      # StartConsultation, SummaryReview, Settings,
│   │   │                      # Consultations, Appointments
│   │   ├── components/        # AppShell, StartConsultationDialog,
│   │   │                      # AddFamilyMemberModal, ProtectedRoute, ui/*
│   │   ├── contexts/AuthContext.jsx
│   │   ├── lib/api.js, helpers.jsx
│   │   └── App.js, index.js, index.css, App.css
│   └── package.json
└── memory/
    ├── PRD.md                 # full product requirements (V1+V2)
    ├── ROADMAP.md             # what's next (V3 → V7)
    └── test_credentials.md    # seeded admin login
```

## Running locally

The app is built for Emergent's Kubernetes preview environment. Backend on
`0.0.0.0:8001`, frontend on `:3000`, both supervised. Hot reload is on.

```bash
# Restart after .env changes or new pip/yarn installs:
sudo supervisorctl restart backend
sudo supervisorctl restart frontend

# Tests:
cd /app/backend && pytest tests/ -v
```

## Seeded login

```
email:    doctor@carebridge.health
password: CareBridge@2026
```

5 Indian sample patients are auto-seeded for this admin (Rahul Kumar, Priya
Sharma, Vikram Singh, Ananya Iyer, Mohammed Khan).

## Environment

Backend reads from `/app/backend/.env`:

```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="carebridge_db"
JWT_SECRET="<long random hex>"
EMERGENT_LLM_KEY="<universal LLM key>"
ADMIN_EMAIL="doctor@carebridge.health"
ADMIN_PASSWORD="CareBridge@2026"
APP_NAME="carebridge"
CORS_ORIGINS="*"
```

Frontend reads `REACT_APP_BACKEND_URL` from `/app/frontend/.env` — used by
`/app/frontend/src/lib/api.js` for every API call. Backend routes are all
prefixed with `/api`.

## V2 highlights

- Search-first patient creation (no more duplicate Rahul Kumars)
- Quick-Add Patient (4 fields + consent) — receptionist-friendly
- Auto AI summary on transcript save (Claude generates both patient + doctor notes in one call)
- Large HH:MM:SS consultation timer with pause/resume + persisted duration
- 6-state status workflow with colour-coded badges
- Follow-up date picker → Follow-ups Today dashboard card + queue on Appointments
- Family Accounts (one mobile, multiple patients, separate medical records)
- Read-only audit timeline on every patient profile + clinic-wide activity feed
- Self-registration disabled — doctor accounts are clinic-admin-created
- 6-card dashboard (added Approved Today, Avg Duration, Family Accounts)
- Auto-save consultation drafts every 30s + Resume Draft banner

## Next phase

See [`memory/ROADMAP.md`](memory/ROADMAP.md) — V3 (PDF + WhatsApp delivery), V4
(multi-staff), V5 (Patient App), V6 (intelligence layer), V7 (integrations).
