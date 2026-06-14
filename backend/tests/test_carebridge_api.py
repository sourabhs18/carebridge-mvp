"""CareBridge API end-to-end tests.

Covers: auth, patients (mask/full), consultations, transcript update,
Claude AI summary generation, dashboard stats, settings, privacy of list view.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://medic-dashboard-20.preview.emergentagent.com").rstrip("/")
DOCTOR_EMAIL = "doctor@carebridge.health"
DOCTOR_PASSWORD = "CareBridge@2026"


# ----------------------------- Fixtures ----------------------------- #
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_session(session):
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    # httpOnly cookie set
    assert "access_token" in session.cookies, "access_token cookie not set"
    return session


# ----------------------------- Auth tests ----------------------------- #
class TestAuth:
    def test_login_wrong_password(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DOCTOR_EMAIL, "password": "wrong-password"},
            timeout=30,
        )
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_login_and_me(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == DOCTOR_EMAIL
        assert data["role"] == "doctor"
        assert "id" in data
        assert "_id" not in data  # ObjectId not leaked

    def test_logout(self, session):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DOCTOR_EMAIL, "password": DOCTOR_PASSWORD},
            timeout=30,
        )
        assert "access_token" in s.cookies
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=30)
        assert r.status_code == 200
        # Cookie should be cleared by server (empty value)
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r2.status_code == 401


# ----------------------------- Patients tests ----------------------------- #
class TestPatients:
    def test_list_patients_seeded(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/patients", timeout=30)
        assert r.status_code == 200
        patients = r.json()
        assert isinstance(patients, list)
        assert len(patients) >= 5, f"expected 5 seeded patients, got {len(patients)}"
        names = {p["full_name"] for p in patients}
        for required in ["Rahul Kumar", "Priya Sharma", "Vikram Singh", "Ananya Iyer", "Mohammed Khan"]:
            assert required in names, f"missing seeded patient: {required}"

    def test_list_view_masks_phone_and_hides_pii(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/patients", timeout=30)
        patients = r.json()
        for p in patients:
            # Masked phone like '+91 •••• •• 4321'
            assert p["phone"].startswith("+91"), f"phone not masked: {p['phone']}"
            assert "•" in p["phone"], f"phone missing mask dots: {p['phone']}"
            # PII must NOT be exposed in list view
            assert p["email"] is None, f"email leaked in list: {p['email']}"
            assert p["address"] is None
            assert p["emergency_contact_name"] is None
            assert p["emergency_contact_phone"] is None
            assert p["consent_log"] == []

    def test_patient_detail_returns_unmasked(self, auth_session):
        patients = auth_session.get(f"{BASE_URL}/api/patients", timeout=30).json()
        pid = patients[0]["patient_id"]
        r = auth_session.get(f"{BASE_URL}/api/patients/{pid}", timeout=30)
        assert r.status_code == 200
        p = r.json()
        # In detail view, phone is unmasked (raw digits)
        assert "•" not in p["phone"], "phone should be raw in detail view"
        # PII present
        assert p["email"] is not None
        assert p["emergency_contact_phone"] is not None
        assert isinstance(p["consent_log"], list) and len(p["consent_log"]) >= 1
        assert p["consent_log"][0]["type"] == "digital_record_creation"

    def test_create_patient_requires_consent(self, auth_session):
        r = auth_session.post(
            f"{BASE_URL}/api/patients",
            json={
                "first_name": "TEST_NoConsent", "last_name": "Patient",
                "phone": "+919999999999", "consent_given": False,
            },
            timeout=30,
        )
        assert r.status_code == 400
        assert "consent" in r.json()["detail"].lower()

    def test_create_patient_success(self, auth_session):
        payload = {
            "first_name": "TEST_New", "last_name": "Patient",
            "date_of_birth": "1990-01-01", "gender": "Male",
            "phone": "+919112233445", "email": "test@example.com",
            "consent_given": True,
        }
        r = auth_session.post(f"{BASE_URL}/api/patients", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["full_name"] == "TEST_New Patient"
        assert created["patient_id"].startswith("PT-")
        # Verify in list (it should appear with masked phone)
        listed = auth_session.get(f"{BASE_URL}/api/patients?q=TEST_New", timeout=30).json()
        assert any(p["patient_id"] == created["patient_id"] for p in listed)
        # Cleanup: delete via mongo not exposed; leave but tracked

    def test_search_filters_by_name(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/patients?q=rahul", timeout=30)
        assert r.status_code == 200
        results = r.json()
        assert any("Rahul" in p["full_name"] for p in results)


# ----------------------------- Consultations tests ----------------------------- #
class TestConsultations:
    @pytest.fixture(scope="class")
    def consultation(self, auth_session):
        patients = auth_session.get(f"{BASE_URL}/api/patients", timeout=30).json()
        pid = patients[0]["patient_id"]
        r = auth_session.post(
            f"{BASE_URL}/api/consultations",
            json={"patient_id": pid, "visit_reason": "TEST follow up",
                  "symptoms": "cough", "vitals": {"bp": "120/80", "hr": 72}},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_consultation_created(self, consultation):
        assert consultation["consultation_id"].startswith("CN-")
        assert consultation["summary_status"] == "not_generated"

    def test_get_consultation(self, auth_session, consultation):
        cid = consultation["consultation_id"]
        r = auth_session.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["consultation_id"] == cid
        assert data["visit_reason"] == "TEST follow up"

    def test_update_transcript(self, auth_session, consultation):
        cid = consultation["consultation_id"]
        transcript = (
            "Doctor: Hello, how are you feeling today? "
            "Patient: I have had a cough and mild fever for three days. "
            "Doctor: Let's check your temperature and listen to your chest. "
            "Doctor: It looks like a viral upper respiratory infection. "
            "Doctor: Take paracetamol 500mg three times a day and rest. "
            "Follow up in five days if symptoms persist."
        )
        r = auth_session.put(
            f"{BASE_URL}/api/consultations/{cid}/transcript",
            json={"transcript": transcript},
            timeout=30,
        )
        assert r.status_code == 200
        # Verify persisted
        c = auth_session.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert "cough" in c["transcript"]

    def test_update_summary_and_approve(self, auth_session, consultation):
        cid = consultation["consultation_id"]
        r = auth_session.put(
            f"{BASE_URL}/api/consultations/{cid}/summary",
            json={
                "patient_summary": {"diagnosis": "viral URI"},
                "doctor_notes": {"assessment": "URI"},
                "status": "approved",
            },
            timeout=30,
        )
        assert r.status_code == 200
        c = auth_session.get(f"{BASE_URL}/api/consultations/{cid}", timeout=30).json()
        assert c["approved"] is True
        assert c["summary_status"] == "approved"
        assert c["patient_summary"]["diagnosis"] == "viral URI"

    def test_generate_patient_summary_with_claude(self, auth_session, consultation):
        """Hits Claude via emergentintegrations - costs credits."""
        cid = consultation["consultation_id"]
        # Make sure transcript present
        r = auth_session.post(
            f"{BASE_URL}/api/consultations/{cid}/generate-patient-summary",
            timeout=120,
        )
        assert r.status_code == 200, f"Claude call failed: {r.status_code} {r.text}"
        body = r.json()
        assert "patient_summary" in body
        ps = body["patient_summary"]
        # Should have at least one of the expected JSON keys (or raw fallback)
        expected_any = {"diagnosis", "medicines", "dosage", "lifestyle", "tests_ordered",
                        "followup", "warning_signs", "next_visit"}
        assert ps and (set(ps.keys()) & expected_any or "raw" in ps), f"unexpected ps: {ps}"

    def test_generate_summary_empty_transcript_fails(self, auth_session):
        # Create a new consultation with empty transcript
        patients = auth_session.get(f"{BASE_URL}/api/patients", timeout=30).json()
        pid = patients[0]["patient_id"]
        c = auth_session.post(f"{BASE_URL}/api/consultations",
                              json={"patient_id": pid}, timeout=30).json()
        r = auth_session.post(
            f"{BASE_URL}/api/consultations/{c['consultation_id']}/generate-patient-summary",
            timeout=30,
        )
        assert r.status_code == 400


# ----------------------------- Dashboard ----------------------------- #
class TestDashboard:
    def test_stats(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/dashboard/stats", timeout=30)
        assert r.status_code == 200
        s = r.json()
        for k in ["today_consultations", "pending_summaries", "followups_due", "total_patients"]:
            assert k in s
            assert isinstance(s[k], int)
        assert s["total_patients"] >= 5


# ----------------------------- Settings ----------------------------- #
class TestSettings:
    def test_get_settings(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/settings", timeout=30)
        assert r.status_code == 200
        s = r.json()
        assert s["email"] == DOCTOR_EMAIL
        assert "clinic" in s
        assert "consent_template" in s

    def test_update_and_revert_name(self, auth_session):
        # Read current name
        cur = auth_session.get(f"{BASE_URL}/api/settings", timeout=30).json()
        original = cur["name"]
        new_name = original + " (TEST)"
        r = auth_session.put(f"{BASE_URL}/api/settings", json={"name": new_name}, timeout=30)
        assert r.status_code == 200
        # Verify persisted via fresh GET
        check = auth_session.get(f"{BASE_URL}/api/settings", timeout=30).json()
        assert check["name"] == new_name
        # Revert
        auth_session.put(f"{BASE_URL}/api/settings", json={"name": original}, timeout=30)
