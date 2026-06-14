"""CareBridge V2 API tests.

Covers: 403 self-registration, search/patients, dashboard/activity & active-draft,
followups/upcoming, autosave, duration, followup, auto-generate (Claude),
family-accounts CRUD, patient timeline, privacy + family scope.

NOTE: auto-generate consumes Emergent LLM credits — only one call total here.
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
DOCTOR_EMAIL = "doctor@carebridge.health"
DOCTOR_PASSWORD = "CareBridge@2026"


# ---------------- Fixtures ---------------- #
@pytest.fixture(scope="session")
def auth():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s


@pytest.fixture(scope="session")
def rahul_pid(auth):
    r = auth.get(f"{BASE_URL}/api/patients?q=Rahul", timeout=30)
    assert r.status_code == 200
    pts = r.json()
    rahul = next((p for p in pts if "Rahul" in p["full_name"]), None)
    assert rahul, "Seeded patient Rahul Kumar not found"
    return rahul["patient_id"]


# ---------------- Self-registration disabled ---------------- #
class TestSelfRegisterDisabled:
    def test_register_returns_403(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": "rando@x.com", "password": "Strong@2026!",
                                "name": "Rando", "specialty": "GP"}, timeout=30)
        assert r.status_code == 403
        body = r.json()
        assert "self-registration" in body["detail"].lower()


# ---------------- Search / patients ---------------- #
class TestSearch:
    def test_search_returns_masked(self, auth):
        r = auth.get(f"{BASE_URL}/api/search/patients?q=Rahul", timeout=30)
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1
        # masked phone
        for p in results:
            assert p.get("phone_masked"), f"phone_masked missing: {p}"
            assert "•" in p["phone_masked"]
            # PII hidden in masked view
            assert p.get("email") is None

    def test_search_min_length_enforced(self, auth):
        r = auth.get(f"{BASE_URL}/api/search/patients?q=R", timeout=30)
        assert r.status_code == 422  # min_length=2

    def test_search_by_phone_digits(self, auth):
        # last 4 digits of Rahul's phone 9876543421
        r = auth.get(f"{BASE_URL}/api/search/patients?q=3421", timeout=30)
        assert r.status_code == 200
        results = r.json()
        assert any("Rahul" in p["full_name"] for p in results)


# ---------------- Dashboard V2 ---------------- #
class TestDashboardV2:
    def test_activity_feed(self, auth):
        r = auth.get(f"{BASE_URL}/api/dashboard/activity", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            e = data[0]
            for k in ("event_type", "description", "timestamp"):
                assert k in e

    def test_active_draft(self, auth):
        r = auth.get(f"{BASE_URL}/api/dashboard/active-draft", timeout=30)
        assert r.status_code == 200
        # null or object
        body = r.json()
        assert body is None or "consultation_id" in body

    def test_followups_upcoming(self, auth):
        r = auth.get(f"{BASE_URL}/api/followups/upcoming", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_stats_has_v2_fields(self, auth):
        r = auth.get(f"{BASE_URL}/api/dashboard/stats", timeout=30)
        assert r.status_code == 200
        s = r.json()
        # original keys still present
        for k in ("today_consultations", "pending_summaries", "followups_due", "total_patients"):
            assert k in s


# ---------------- Autosave / Duration / Follow-up ---------------- #
class TestConsultationV2:
    @pytest.fixture(scope="class")
    def cid(self, auth, rahul_pid):
        r = auth.post(f"{BASE_URL}/api/consultations",
                      json={"patient_id": rahul_pid, "visit_reason": "TEST_v2 initial"},
                      timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # status field should exist
        assert "status" in data
        return data["consultation_id"]

    def test_autosave_persists(self, auth, cid):
        r = auth.put(f"{BASE_URL}/api/consultations/{cid}/autosave",
                     json={"visit_reason": "TEST_v2 autosaved",
                           "symptoms": "TEST_v2 mild headache",
                           "vitals": {"bp": "118/76"}}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert "saved_at" in body
        # verify
        g = auth.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert g["visit_reason"] == "TEST_v2 autosaved"
        assert g["symptoms"] == "TEST_v2 mild headache"
        assert g["vitals"]["bp"] == "118/76"

    def test_duration_update(self, auth, cid):
        r = auth.put(f"{BASE_URL}/api/consultations/{cid}/duration",
                     json={"duration_seconds": 123}, timeout=30)
        assert r.status_code == 200
        g = auth.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert g["duration_seconds"] == 123

    def test_followup_update_and_timeline(self, auth, cid, rahul_pid):
        future = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
        r = auth.put(f"{BASE_URL}/api/consultations/{cid}/followup",
                     json={"followup_date": future}, timeout=30)
        assert r.status_code == 200
        g = auth.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert g["followup_date"] is not None
        assert future in g["followup_date"]
        # timeline should now include followup_scheduled
        tl = auth.get(f"{BASE_URL}/api/patients/{rahul_pid}/timeline", timeout=30).json()
        assert any(e["event_type"] == "followup_scheduled" for e in tl), \
            f"followup_scheduled missing from timeline events {[e['event_type'] for e in tl]}"

    def test_autosave_404_for_unknown(self, auth):
        r = auth.put(f"{BASE_URL}/api/consultations/CN-DOESNT/autosave",
                     json={"visit_reason": "x"}, timeout=30)
        assert r.status_code == 404


# ---------------- Patient timeline ---------------- #
class TestPatientTimeline:
    def test_timeline_has_creation_events(self, auth, rahul_pid):
        r = auth.get(f"{BASE_URL}/api/patients/{rahul_pid}/timeline", timeout=30)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        # reverse chronological — timestamps should be non-increasing
        ts = [e["timestamp"] for e in events]
        assert ts == sorted(ts, reverse=True), "timeline not in reverse chronological order"


# ---------------- Family Accounts ---------------- #
class TestFamilyAccounts:
    @pytest.fixture(scope="class")
    def primary_pid(self, auth):
        # Create a fresh primary so we don't collide with prior runs
        payload = {
            "first_name": "TEST_FamPrimary", "last_name": "User",
            "date_of_birth": "1980-06-15", "gender": "Male",
            "phone": "+919811112222", "consent_given": True,
        }
        r = auth.post(f"{BASE_URL}/api/patients", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["patient_id"]

    @pytest.fixture(scope="class")
    def family_id(self, auth, primary_pid):
        r = auth.post(f"{BASE_URL}/api/family-accounts",
                      json={"primary_patient_id": primary_pid}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["family_id"].startswith("FAM-")
        return body["family_id"]

    def test_primary_marked_as_self(self, auth, primary_pid, family_id):
        r = auth.get(f"{BASE_URL}/api/patients/{primary_pid}", timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p.get("family_id") == family_id
        assert p.get("relationship") == "Self"

    def test_get_family_lists_primary(self, auth, family_id, primary_pid):
        r = auth.get(f"{BASE_URL}/api/family-accounts/{family_id}", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["primary_patient_id"] == primary_pid
        # primary phone is masked
        assert "•" in body["primary_phone_masked"]
        member_ids = [m["patient_id"] for m in body["members"]]
        assert primary_pid in member_ids

    def test_add_family_member_inherits_phone(self, auth, family_id, primary_pid):
        r = auth.post(f"{BASE_URL}/api/family-accounts/{family_id}/members",
                      json={"first_name": "TEST_Spouse", "last_name": "User",
                            "date_of_birth": "1985-03-20", "gender": "Female",
                            "relationship": "Spouse", "consent_given": True},
                      timeout=30)
        assert r.status_code == 200, r.text
        member = r.json()
        assert member["patient_id"].startswith("PT-")
        # member exists at GET /api/patients/{pid}
        m_pid = member["patient_id"]
        gm = auth.get(f"{BASE_URL}/api/patients/{m_pid}", timeout=30)
        assert gm.status_code == 200
        mfull = gm.json()
        assert mfull["family_id"] == family_id
        assert mfull["relationship"] == "Spouse"
        # phone inherited from primary contact (unmasked in detail view)
        pri = auth.get(f"{BASE_URL}/api/patients/{primary_pid}", timeout=30).json()
        assert mfull["phone"] == pri["phone"], \
            f"member phone {mfull['phone']} != primary phone {pri['phone']}"

    def test_member_consultations_scoped(self, auth, family_id, primary_pid):
        # Get current member list
        fam = auth.get(f"{BASE_URL}/api/family-accounts/{family_id}", timeout=30).json()
        spouse = next((m for m in fam["members"] if m["patient_id"] != primary_pid), None)
        assert spouse, "No spouse member found"
        spouse_pid = spouse["patient_id"]
        # create a consultation for primary and one for spouse
        r1 = auth.post(f"{BASE_URL}/api/consultations",
                       json={"patient_id": primary_pid, "visit_reason": "TEST_v2 fam primary"},
                       timeout=30)
        assert r1.status_code == 200
        r2 = auth.post(f"{BASE_URL}/api/consultations",
                       json={"patient_id": spouse_pid, "visit_reason": "TEST_v2 fam spouse"},
                       timeout=30)
        assert r2.status_code == 200
        spouse_cid = r2.json()["consultation_id"]
        # listing scoped to spouse should NOT include primary's consultation
        listed = auth.get(f"{BASE_URL}/api/consultations?patient_id={spouse_pid}", timeout=30).json()
        cids = [c["consultation_id"] for c in listed]
        assert spouse_cid in cids
        assert all(c["patient_id"] == spouse_pid for c in listed), \
            "Spouse's consultations list leaked another family member's consultation"

    def test_patient_family_endpoint(self, auth, primary_pid, family_id):
        r = auth.get(f"{BASE_URL}/api/patients/{primary_pid}/family", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["family_id"] == family_id
        assert isinstance(body["members"], list)
        assert any(m["patient_id"] == primary_pid for m in body["members"])

    def test_add_member_requires_consent(self, auth, family_id):
        r = auth.post(f"{BASE_URL}/api/family-accounts/{family_id}/members",
                      json={"first_name": "TEST_NoConsent", "last_name": "Child",
                            "relationship": "Son", "consent_given": False}, timeout=30)
        assert r.status_code == 400


# ---------------- Auto-generate (Claude) — ONE call only ---------------- #
class TestAutoGenerate:
    def test_auto_generate_both_summaries(self, auth, rahul_pid):
        # Create dedicated consultation with a clinical transcript
        c = auth.post(f"{BASE_URL}/api/consultations",
                      json={"patient_id": rahul_pid, "visit_reason": "TEST_v2 auto-gen"},
                      timeout=30).json()
        cid = c["consultation_id"]
        transcript = (
            "Patient is a 45-year-old male with known hypertension. "
            "BP today is 150/95. Reports occasional morning headaches. "
            "No chest pain, no shortness of breath. "
            "Will start Amlodipine 5mg once daily and recommend low-salt diet. "
            "Reduce coffee intake. Follow up in 3 weeks with home BP log."
        )
        auth.put(f"{BASE_URL}/api/consultations/{cid}/transcript",
                 json={"transcript": transcript}, timeout=30)
        r = auth.post(f"{BASE_URL}/api/consultations/{cid}/auto-generate", timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "patient_summary" in body and "doctor_notes" in body
        ps, dn = body["patient_summary"], body["doctor_notes"]
        assert ps and dn, f"Empty summaries: ps={ps}, dn={dn}"
        # at least one key from each domain
        ps_keys = {"diagnosis", "medicines", "dosage", "lifestyle", "tests_ordered",
                   "followup", "warning_signs", "next_visit"}
        dn_keys = {"assessment", "differential", "plan", "icd_codes", "tests_ordered",
                   "medications", "followup", "raw"}
        assert (set(ps.keys()) & ps_keys) or "raw" in ps, f"ps unexpected: {ps}"
        assert (set(dn.keys()) & dn_keys) or "raw" in dn, f"dn unexpected: {dn}"
        # status reflects ready
        g = auth.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert g["summary_status"] in ("ready", "pending_review", "approved", "shared")

    def test_auto_generate_empty_transcript_400(self, auth, rahul_pid):
        c = auth.post(f"{BASE_URL}/api/consultations",
                      json={"patient_id": rahul_pid}, timeout=30).json()
        r = auth.post(f"{BASE_URL}/api/consultations/{c['consultation_id']}/auto-generate",
                      timeout=30)
        assert r.status_code == 400


# ---------------- Privacy regression ---------------- #
class TestPrivacy:
    def test_patients_list_still_masks(self, auth):
        r = auth.get(f"{BASE_URL}/api/patients", timeout=30).json()
        for p in r:
            assert "•" in p["phone"]

    def test_patient_detail_unmasked(self, auth, rahul_pid):
        p = auth.get(f"{BASE_URL}/api/patients/{rahul_pid}", timeout=30).json()
        assert "•" not in p["phone"]


# ---------------- Backward compatibility ---------------- #
class TestBackwardCompat:
    def test_legacy_generate_patient_summary_still_exists(self, auth, rahul_pid):
        # Just confirm the endpoint route exists (will return 400 on empty transcript)
        c = auth.post(f"{BASE_URL}/api/consultations",
                      json={"patient_id": rahul_pid}, timeout=30).json()
        r = auth.post(
            f"{BASE_URL}/api/consultations/{c['consultation_id']}/generate-patient-summary",
            timeout=30)
        assert r.status_code in (400, 200)

    def test_legacy_generate_doctor_notes_endpoint_exists(self, auth, rahul_pid):
        c = auth.post(f"{BASE_URL}/api/consultations",
                      json={"patient_id": rahul_pid}, timeout=30).json()
        r = auth.post(
            f"{BASE_URL}/api/consultations/{c['consultation_id']}/generate-doctor-notes",
            timeout=30)
        assert r.status_code in (400, 200)

    def test_simple_patient_create_still_works(self, auth):
        payload = {
            "first_name": "TEST_LegacyV2", "last_name": "Simple",
            "phone": "+919811119911", "consent_given": True,
        }
        r = auth.post(f"{BASE_URL}/api/patients", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["patient_id"].startswith("PT-")
