from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Annotated

import bcrypt
import jwt
from bson import ObjectId
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, Request, Response,
    UploadFile, File, Header, Query, BackgroundTasks
)
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("carebridge")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get("APP_NAME", "carebridge")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

app = FastAPI(title="CareBridge API")
api_router = APIRouter(prefix="/api")


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=False,
                        samesite="lax", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False,
                        samesite="lax", max_age=604800, path="/")


def mask_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return phone
    last4 = digits[-4:]
    return f"+91 •••• •• {last4}"


def serialize_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u.get("email"),
        "name": u.get("name"),
        "specialty": u.get("specialty"),
        "registration_number": u.get("registration_number"),
        "clinic": u.get("clinic", {}),
        "role": u.get("role", "doctor"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# -----------------------------------------------------------------------------
# Object Storage
# -----------------------------------------------------------------------------
_storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    specialty: Optional[str] = "General Practitioner"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    allergies: Optional[str] = None
    conditions: Optional[str] = None
    medications: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    consent_given: bool = False
    family_id: Optional[str] = None
    relationship: Optional[str] = None  # Self / Spouse / Son / Daughter / etc.


class FamilyCreate(BaseModel):
    primary_patient_id: str  # the patient to mark as Self / primary contact


class FamilyMemberCreate(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    relationship: str  # required
    consent_given: bool = False


class AutosaveUpdate(BaseModel):
    visit_reason: Optional[str] = None
    symptoms: Optional[str] = None
    vitals: Optional[dict] = None
    transcript: Optional[str] = None


class FollowUpUpdate(BaseModel):
    followup_date: Optional[str] = None  # ISO date string


class ConsultationCreate(BaseModel):
    patient_id: str
    visit_reason: Optional[str] = ""
    symptoms: Optional[str] = ""
    vitals: Optional[dict] = {}


class TranscriptUpdate(BaseModel):
    transcript: str


class SummarySection(BaseModel):
    pass


class SummaryUpdate(BaseModel):
    patient_summary: Optional[dict] = None
    doctor_notes: Optional[dict] = None
    status: Optional[str] = None
    followup_date: Optional[str] = None
    shared_with_patient: Optional[bool] = None


class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    registration_number: Optional[str] = None
    clinic: Optional[dict] = None
    notifications: Optional[dict] = None
    consent_template: Optional[str] = None
    security: Optional[dict] = None


# -----------------------------------------------------------------------------
# Auth Endpoints
# -----------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    # V2: self-registration is disabled. Doctor accounts are created by clinic admin.
    raise HTTPException(
        status_code=403,
        detail="Self-registration is disabled. Please contact your Clinic Administrator for account access.",
    )


@api_router.post("/auth/admin-create-doctor")
async def admin_create_doctor(req: RegisterRequest, admin=Depends(get_current_user)):
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    email = req.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(req.password),
        "name": req.name,
        "specialty": req.specialty or "General Practitioner",
        "role": "doctor",
        "registration_number": "",
        "clinic": {"name": "", "address": "", "phone": ""},
        "notifications": {"email_summaries": True, "whatsapp_summaries": False, "followup_reminders": True},
        "consent_template": DEFAULT_CONSENT_TEMPLATE,
        "security": {"mfa_enabled": False, "session_timeout": 30},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"ok": True, "email": email}


@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(str(user["_id"]), email)
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return serialize_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return serialize_user(user)


@api_router.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = await db.users.find_one({"email": req.email.lower()})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": str(user["_id"]),
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used": False,
        })
        logger.info(f"Password reset link: /reset-password?token={token}")
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


# -----------------------------------------------------------------------------
# Patients
# -----------------------------------------------------------------------------
@api_router.get("/patients")
async def list_patients(
    q: Optional[str] = None,
    user=Depends(get_current_user),
):
    query: dict = {"doctor_id": str(user["_id"])}
    if q:
        query["$or"] = [
            {"first_name": {"$regex": q, "$options": "i"}},
            {"last_name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q}},
            {"patient_id": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.patients.find(query).sort("created_at", -1).to_list(500)
    return [serialize_patient(d, mask=True) for d in docs]


@api_router.post("/patients")
async def create_patient(p: PatientCreate, user=Depends(get_current_user)):
    if not p.consent_given:
        raise HTTPException(status_code=400, detail="Patient consent is required")
    patient_id = "PT-" + secrets.token_hex(3).upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        **p.model_dump(),
        "patient_id": patient_id,
        "doctor_id": str(user["_id"]),
        "last_visit": None,
        "created_at": now_iso,
        "consent_log": [{
            "type": "digital_record_creation",
            "timestamp": now_iso,
            "by": user["name"],
        }],
    }
    result = await db.patients.insert_one(doc)
    new_doc = await db.patients.find_one({"_id": result.inserted_id})
    await log_activity(str(user["_id"]), patient_id, "patient_created",
                       f"Patient {new_doc['first_name']} {new_doc['last_name']} created",
                       {"patient_name": f"{new_doc['first_name']} {new_doc['last_name']}"})
    await log_activity(str(user["_id"]), patient_id, "consent_recorded",
                       "Consent recorded for digital record creation", {})
    return serialize_patient(new_doc, mask=False)


@api_router.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user=Depends(get_current_user)):
    doc = await db.patients.find_one({"patient_id": patient_id, "doctor_id": str(user["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Patient not found")
    return serialize_patient(doc, mask=False)


def serialize_patient(d: dict, mask: bool = True) -> dict:
    return {
        "id": str(d["_id"]),
        "patient_id": d.get("patient_id"),
        "first_name": d.get("first_name"),
        "last_name": d.get("last_name"),
        "full_name": f"{d.get('first_name','')} {d.get('last_name','')}".strip(),
        "date_of_birth": d.get("date_of_birth"),
        "gender": d.get("gender"),
        "phone": mask_phone(d.get("phone", "")) if mask else d.get("phone"),
        "phone_masked": mask_phone(d.get("phone", "")),
        "email": d.get("email") if not mask else None,
        "address": d.get("address") if not mask else None,
        "allergies": d.get("allergies"),
        "conditions": d.get("conditions"),
        "medications": d.get("medications"),
        "emergency_contact_name": d.get("emergency_contact_name") if not mask else None,
        "emergency_contact_phone": d.get("emergency_contact_phone") if not mask else None,
        "last_visit": d.get("last_visit"),
        "consent_log": d.get("consent_log", []) if not mask else [],
        "family_id": d.get("family_id"),
        "relationship": d.get("relationship"),
        "created_at": d.get("created_at"),
    }


def derive_consultation_status(c: dict) -> str:
    """New V2 status derived from existing fields. Backward compatible."""
    if c.get("shared_with_patient"):
        return "shared"
    if c.get("approved"):
        return "approved"
    if c.get("summary_status") == "ready" or c.get("patient_summary"):
        return "pending_review"
    if c.get("summary_status") == "generating":
        return "generating"
    if (c.get("transcript") or "").strip():
        return "pending_summary"
    return "draft"


async def log_activity(doctor_id: str, patient_id: Optional[str], event_type: str,
                       description: str, metadata: Optional[dict] = None):
    """Append to activity_log collection."""
    await db.activity_log.insert_one({
        "doctor_id": doctor_id,
        "patient_id": patient_id,
        "event_type": event_type,
        "description": description,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


# -----------------------------------------------------------------------------
# Consultations
# -----------------------------------------------------------------------------
@api_router.post("/consultations")
async def create_consultation(c: ConsultationCreate, user=Depends(get_current_user)):
    patient = await db.patients.find_one({"patient_id": c.patient_id, "doctor_id": str(user["_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    cid = "CN-" + secrets.token_hex(3).upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "consultation_id": cid,
        "patient_id": c.patient_id,
        "patient_name": f"{patient['first_name']} {patient['last_name']}",
        "doctor_id": str(user["_id"]),
        "doctor_name": user["name"],
        "visit_reason": c.visit_reason,
        "symptoms": c.symptoms,
        "vitals": c.vitals or {},
        "transcript": "",
        "audio_path": None,
        "patient_summary": {},
        "doctor_notes": {},
        "summary_status": "not_generated",
        "approved": False,
        "shared_with_patient": False,
        "followup_date": None,
        "duration_seconds": None,
        "consent_recorded": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.consultations.insert_one(doc)
    await db.patients.update_one(
        {"patient_id": c.patient_id},
        {"$set": {"last_visit": now_iso}},
    )
    await log_activity(str(user["_id"]), c.patient_id, "consultation_started",
                       f"Consultation started for {doc['patient_name']}",
                       {"consultation_id": cid})
    doc.pop("_id", None)
    doc["status"] = "draft"
    return doc


@api_router.get("/consultations")
async def list_consultations(patient_id: Optional[str] = None, user=Depends(get_current_user)):
    q = {"doctor_id": str(user["_id"])}
    if patient_id:
        q["patient_id"] = patient_id
    docs = await db.consultations.find(q).sort("created_at", -1).to_list(200)
    return [serialize_consultation(d) for d in docs]


@api_router.get("/consultations/{cid}")
async def get_consultation(cid: str, user=Depends(get_current_user)):
    doc = await db.consultations.find_one({"consultation_id": cid, "doctor_id": str(user["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return serialize_consultation(doc)


def serialize_consultation(d: dict) -> dict:
    return {
        "consultation_id": d.get("consultation_id"),
        "patient_id": d.get("patient_id"),
        "patient_name": d.get("patient_name"),
        "doctor_name": d.get("doctor_name"),
        "visit_reason": d.get("visit_reason"),
        "symptoms": d.get("symptoms"),
        "vitals": d.get("vitals", {}),
        "transcript": d.get("transcript", ""),
        "audio_path": d.get("audio_path"),
        "patient_summary": d.get("patient_summary", {}),
        "doctor_notes": d.get("doctor_notes", {}),
        "summary_status": d.get("summary_status", "not_generated"),
        "status": derive_consultation_status(d),
        "approved": d.get("approved", False),
        "shared_with_patient": d.get("shared_with_patient", False),
        "followup_date": d.get("followup_date"),
        "duration_seconds": d.get("duration_seconds"),
        "recording_started_at": d.get("recording_started_at"),
        "recording_ended_at": d.get("recording_ended_at"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


@api_router.put("/consultations/{cid}/transcript")
async def update_transcript(cid: str, body: TranscriptUpdate, user=Depends(get_current_user)):
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": {"transcript": body.transcript, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return {"ok": True}


@api_router.put("/consultations/{cid}/summary")
async def update_summary(cid: str, body: SummaryUpdate, user=Depends(get_current_user)):
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.patient_summary is not None:
        update_data["patient_summary"] = body.patient_summary
    if body.doctor_notes is not None:
        update_data["doctor_notes"] = body.doctor_notes
    if body.followup_date is not None:
        update_data["followup_date"] = body.followup_date
    if body.status is not None:
        update_data["summary_status"] = body.status
        if body.status == "approved":
            update_data["approved"] = True
    if body.shared_with_patient is not None:
        update_data["shared_with_patient"] = body.shared_with_patient
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": update_data},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    # log key events
    c = await db.consultations.find_one({"consultation_id": cid})
    if body.status == "approved":
        await log_activity(str(user["_id"]), c["patient_id"], "summary_approved",
                           f"Summary approved for {c['patient_name']}", {"consultation_id": cid})
    if body.shared_with_patient:
        await log_activity(str(user["_id"]), c["patient_id"], "summary_shared",
                           f"Summary shared with {c['patient_name']}", {"consultation_id": cid})
    return {"ok": True}


# -----------------------------------------------------------------------------
# Audio upload + Whisper transcription
# -----------------------------------------------------------------------------
@api_router.post("/consultations/{cid}/audio")
async def upload_consultation_audio(cid: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    consultation = await db.consultations.find_one({"consultation_id": cid, "doctor_id": str(user["_id"])})
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 25MB)")
    ext = (file.filename or "audio.webm").rsplit(".", 1)[-1].lower()
    if ext not in {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"}:
        ext = "webm"
    storage_path = f"{APP_NAME}/audio/{str(user['_id'])}/{cid}-{uuid.uuid4()}.{ext}"
    try:
        put_object(storage_path, data, file.content_type or "audio/webm")
    except Exception as e:
        logger.error(f"Audio upload failed: {e}")
        raise HTTPException(status_code=500, detail="Audio upload failed")

    # Transcribe with Whisper
    transcript_text = ""
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        import io
        stt = OpenAISpeechToText(api_key=EMERGENT_KEY)
        bio = io.BytesIO(data)
        bio.name = f"audio.{ext}"
        resp = await stt.transcribe(file=bio, model="whisper-1", response_format="json", language="en")
        transcript_text = resp.text if hasattr(resp, "text") else str(resp)
    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        transcript_text = f"[Transcription failed: {e}]"

    await db.consultations.update_one(
        {"consultation_id": cid},
        {"$set": {
            "audio_path": storage_path,
            "transcript": transcript_text,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "transcript": transcript_text, "audio_path": storage_path}


# -----------------------------------------------------------------------------
# AI Summary Generation (Claude Sonnet 4.5)
# -----------------------------------------------------------------------------
PATIENT_SUMMARY_PROMPT = """You are a medical assistant generating a clear, friendly, plain-language summary for a patient based on a consultation transcript.

CRITICAL writing rules:
- Write in second-person ("You", "Your") as if you are speaking directly to the patient.
- Use simple, everyday words. Replace medical jargon with plain language. (e.g. "high blood pressure" not "hypertension"; "swelling" not "edema".)
- Short sentences. Aim for class 6-8 reading level.
- Be warm, reassuring, and respectful. No scary words unless explaining warning signs.
- Never copy clinical abbreviations (BP, HR, SOB, SOAP, etc.).
- If a section does not apply, return an empty string, NOT "N/A".

Output strict JSON with these keys, all strings:
- diagnosis: a one-sentence, plain-language explanation of the condition (e.g. "Your blood pressure is a little higher than normal.")
- medicines: medicine names with what they are for (e.g. "Amlodipine 5mg — helps lower your blood pressure.")
- dosage: clear, daily-life instructions (e.g. "Take one tablet every morning after breakfast.")
- lifestyle: simple lifestyle advice (e.g. "Try to add a 20-minute walk to your daily routine.")
- tests_ordered: tests in plain language or empty string
- followup: when to come back (e.g. "Please visit again in 3 weeks.")
- warning_signs: when the patient should seek immediate care (e.g. "Come to the clinic right away if you feel chest pain, severe headache, or shortness of breath.")
- next_visit: a simple suggested date or duration (e.g. "In about 3 weeks")

Output only the JSON object — no markdown fences, no preamble."""

DOCTOR_NOTES_PROMPT = """You are a medical scribe generating concise clinical notes (SOAP-style) for a doctor from a consultation transcript.

Output strict JSON with these keys, all strings:
- chief_complaint: brief CC
- history: HPI / relevant history and symptoms
- observations: examination findings and vitals interpretation
- assessment: differential / working diagnosis with reasoning
- plan: treatment plan, medications with dose
- followup: follow-up plan

Use precise clinical terminology. Output only the JSON object, no markdown fences."""


async def generate_with_claude(system_prompt: str, transcript: str, session_id: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    import json as json_lib
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    user_msg = UserMessage(text=f"Consultation transcript:\n\n{transcript}\n\nReturn the JSON now.")
    response_text = await chat.send_message(user_msg)
    text = response_text if isinstance(response_text, str) else str(response_text)
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    try:
        return json_lib.loads(text)
    except Exception:
        return {"raw": text}


@api_router.post("/consultations/{cid}/generate-patient-summary")
async def generate_patient_summary(cid: str, user=Depends(get_current_user)):
    c = await db.consultations.find_one({"consultation_id": cid, "doctor_id": str(user["_id"])})
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")
    if not (c.get("transcript") or "").strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")
    await db.consultations.update_one({"consultation_id": cid}, {"$set": {"summary_status": "generating"}})
    summary = await generate_with_claude(PATIENT_SUMMARY_PROMPT, c["transcript"], f"patient-{cid}")
    await db.consultations.update_one(
        {"consultation_id": cid},
        {"$set": {
            "patient_summary": summary,
            "summary_status": "ready",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "patient_summary": summary}


@api_router.post("/consultations/{cid}/generate-doctor-notes")
async def generate_doctor_notes(cid: str, user=Depends(get_current_user)):
    c = await db.consultations.find_one({"consultation_id": cid, "doctor_id": str(user["_id"])})
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")
    if not (c.get("transcript") or "").strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")
    notes = await generate_with_claude(DOCTOR_NOTES_PROMPT, c["transcript"], f"doctor-{cid}")
    await db.consultations.update_one(
        {"consultation_id": cid},
        {"$set": {
            "doctor_notes": notes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "doctor_notes": notes}


# -----------------------------------------------------------------------------
# Dashboard stats
# -----------------------------------------------------------------------------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    doctor_id = str(user["_id"])
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
                 + timedelta(days=1)).isoformat()

    today_consultations = await db.consultations.count_documents({
        "doctor_id": doctor_id, "created_at": {"$gte": today_start}
    })
    pending = await db.consultations.count_documents({
        "doctor_id": doctor_id,
        "approved": False,
        "summary_status": {"$in": ["not_generated", "generating", "ready"]},
    })
    total_patients = await db.patients.count_documents({"doctor_id": doctor_id})

    # V2 metrics
    approved_today = await db.consultations.count_documents({
        "doctor_id": doctor_id, "approved": True,
        "updated_at": {"$gte": today_start},
    })
    followups_due_today = await db.consultations.count_documents({
        "doctor_id": doctor_id,
        "followup_date": {"$gte": today_start, "$lt": today_end},
    })
    family_accounts_count = await db.family_accounts.count_documents({"doctor_id": doctor_id})

    # Average consultation duration over last 30 consults with a duration
    pipeline = [
        {"$match": {"doctor_id": doctor_id, "duration_seconds": {"$gt": 0}}},
        {"$sort": {"created_at": -1}},
        {"$limit": 30},
        {"$group": {"_id": None, "avg": {"$avg": "$duration_seconds"}}},
    ]
    avg_doc = await db.consultations.aggregate(pipeline).to_list(1)
    avg_minutes = int(round((avg_doc[0]["avg"] if avg_doc else 0) / 60))

    return {
        "today_consultations": today_consultations,
        "pending_summaries": pending,
        "followups_due": followups_due_today or max(0, total_patients // 6),
        "total_patients": total_patients,
        "approved_today": approved_today,
        "avg_consultation_minutes": avg_minutes,
        "family_accounts": family_accounts_count,
    }


# -----------------------------------------------------------------------------
# Settings
# -----------------------------------------------------------------------------
DEFAULT_CONSENT_TEMPLATE = (
    "I consent to my consultation being recorded and processed to generate clinical "
    "notes and a patient-friendly summary. I understand the recording will be stored "
    "securely and only authorized clinic staff may access it."
)


@api_router.put("/settings")
async def update_settings(body: SettingsUpdate, user=Depends(get_current_user)):
    update_data = {}
    for f in ["name", "specialty", "registration_number", "clinic",
              "notifications", "consent_template", "security"]:
        v = getattr(body, f)
        if v is not None:
            update_data[f] = v
    if update_data:
        await db.users.update_one({"_id": user["_id"]}, {"$set": update_data})
    updated = await db.users.find_one({"_id": user["_id"]})
    return {
        **serialize_user(updated),
        "notifications": updated.get("notifications", {}),
        "consent_template": updated.get("consent_template", DEFAULT_CONSENT_TEMPLATE),
        "security": updated.get("security", {}),
    }


@api_router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    return {
        **serialize_user(user),
        "notifications": user.get("notifications", {}),
        "consent_template": user.get("consent_template", DEFAULT_CONSENT_TEMPLATE),
        "security": user.get("security", {}),
    }


# -----------------------------------------------------------------------------
# Files (clinic logo etc.)
# -----------------------------------------------------------------------------
@api_router.post("/uploads/logo")
async def upload_logo(file: UploadFile = File(...), user=Depends(get_current_user)):
    data = await file.read()
    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
    storage_path = f"{APP_NAME}/logos/{str(user['_id'])}/{uuid.uuid4()}.{ext}"
    put_object(storage_path, data, file.content_type or "image/png")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"clinic.logo_path": storage_path}},
    )
    return {"ok": True, "path": storage_path}


# -----------------------------------------------------------------------------
# V2 ENDPOINTS: search-first, family accounts, autosave, auto-generate, timeline
# -----------------------------------------------------------------------------

# --- Patient search (used before "Add New Patient" to prevent duplicates) ---
@api_router.get("/search/patients")
async def search_patients(q: str = Query(..., min_length=2), user=Depends(get_current_user)):
    """Lightweight search by name or phone — returns masked results plus family hint."""
    digits = "".join(c for c in q if c.isdigit())
    or_clauses: list = [
        {"first_name": {"$regex": q, "$options": "i"}},
        {"last_name": {"$regex": q, "$options": "i"}},
        {"patient_id": {"$regex": q, "$options": "i"}},
    ]
    if digits:
        or_clauses.append({"phone": {"$regex": digits}})
    docs = await db.patients.find(
        {"doctor_id": str(user["_id"]), "$or": or_clauses}
    ).sort("created_at", -1).to_list(20)
    return [serialize_patient(d, mask=True) for d in docs]


# --- Patient timeline (audit trail per patient) ---
@api_router.get("/patients/{patient_id}/timeline")
async def patient_timeline(patient_id: str, user=Depends(get_current_user)):
    patient = await db.patients.find_one({"patient_id": patient_id, "doctor_id": str(user["_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    events = await db.activity_log.find({
        "doctor_id": str(user["_id"]),
        "patient_id": patient_id,
    }).sort("timestamp", -1).to_list(200)
    return [{
        "event_type": e["event_type"],
        "description": e["description"],
        "timestamp": e["timestamp"],
        "metadata": e.get("metadata", {}),
    } for e in events]


# --- Dashboard activity feed ---
@api_router.get("/dashboard/activity")
async def dashboard_activity(user=Depends(get_current_user), limit: int = 12):
    events = await db.activity_log.find({
        "doctor_id": str(user["_id"]),
    }).sort("timestamp", -1).to_list(limit)
    return [{
        "event_type": e["event_type"],
        "description": e["description"],
        "timestamp": e["timestamp"],
        "patient_id": e.get("patient_id"),
        "metadata": e.get("metadata", {}),
    } for e in events]


# --- Upcoming follow-ups (used by Appointments page) ---
@api_router.get("/followups/upcoming")
async def upcoming_followups(user=Depends(get_current_user)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    docs = await db.consultations.find({
        "doctor_id": str(user["_id"]),
        "followup_date": {"$gte": today_start},
    }).sort("followup_date", 1).to_list(100)
    return [serialize_consultation(d) for d in docs]


# --- Resume previous draft consultation (Item #15) ---
@api_router.get("/dashboard/active-draft")
async def active_draft(user=Depends(get_current_user)):
    """Return the most recent unapproved consultation that has actual progress
    (a transcript, audio recording, or any vital filled). Avoids surfacing
    brand-new empty consultations as 'drafts to resume'."""
    doc = await db.consultations.find_one(
        {
            "doctor_id": str(user["_id"]),
            "approved": False,
            "$or": [
                {"transcript": {"$nin": ["", None]}},
                {"audio_path": {"$nin": [None, ""]}},
                {"vitals.bp": {"$nin": ["", None]}},
                {"vitals.hr": {"$nin": ["", None]}},
                {"vitals.temp": {"$nin": ["", None]}},
                {"vitals.spo2": {"$nin": ["", None]}},
                {"vitals.weight": {"$nin": ["", None]}},
                {"symptoms": {"$nin": ["", None]}},
                {"duration_seconds": {"$gt": 0}},
            ],
        },
        sort=[("updated_at", -1)],
    )
    return serialize_consultation(doc) if doc else None


# --- Autosave consultation (Item #5) ---
@api_router.put("/consultations/{cid}/autosave")
async def autosave_consultation(cid: str, body: AutosaveUpdate, user=Depends(get_current_user)):
    update_data: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.visit_reason is not None:
        update_data["visit_reason"] = body.visit_reason
    if body.symptoms is not None:
        update_data["symptoms"] = body.symptoms
    if body.vitals is not None:
        update_data["vitals"] = body.vitals
    if body.transcript is not None:
        update_data["transcript"] = body.transcript
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": update_data},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return {"ok": True, "saved_at": update_data["updated_at"]}


# --- Set follow-up date (Item #10) ---
@api_router.put("/consultations/{cid}/followup")
async def set_followup(cid: str, body: FollowUpUpdate, user=Depends(get_current_user)):
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": {"followup_date": body.followup_date,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    if body.followup_date:
        c = await db.consultations.find_one({"consultation_id": cid})
        await log_activity(str(user["_id"]), c["patient_id"], "followup_scheduled",
                           f"Follow-up scheduled for {body.followup_date[:10]}",
                           {"consultation_id": cid, "followup_date": body.followup_date})
    return {"ok": True}


# --- Set consultation duration when recording stops ---
class DurationUpdate(BaseModel):
    duration_seconds: int


@api_router.put("/consultations/{cid}/duration")
async def set_duration(cid: str, body: DurationUpdate, user=Depends(get_current_user)):
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": {"duration_seconds": body.duration_seconds,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
    return {"ok": True}


# --- Auto-generate BOTH summaries (Item #8). Runs sequentially in foreground for simplicity ---
@api_router.post("/consultations/{cid}/auto-generate")
async def auto_generate_both(cid: str, user=Depends(get_current_user)):
    c = await db.consultations.find_one({"consultation_id": cid, "doctor_id": str(user["_id"])})
    if not c:
        raise HTTPException(status_code=404, detail="Consultation not found")
    transcript = (c.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript is empty")

    await db.consultations.update_one(
        {"consultation_id": cid},
        {"$set": {"summary_status": "generating",
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await log_activity(str(user["_id"]), c["patient_id"], "summary_generation_started",
                       f"AI summary generation started for {c['patient_name']}",
                       {"consultation_id": cid})

    try:
        # Generate doctor notes first (faster reasoning often), then patient summary
        notes = await generate_with_claude(DOCTOR_NOTES_PROMPT, transcript, f"doctor-{cid}")
        summary = await generate_with_claude(PATIENT_SUMMARY_PROMPT, transcript, f"patient-{cid}")
        await db.consultations.update_one(
            {"consultation_id": cid},
            {"$set": {
                "doctor_notes": notes,
                "patient_summary": summary,
                "summary_status": "ready",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        await log_activity(str(user["_id"]), c["patient_id"], "summary_generated",
                           f"AI summary ready for {c['patient_name']}",
                           {"consultation_id": cid})
        return {"ok": True, "patient_summary": summary, "doctor_notes": notes}
    except Exception as e:
        logger.error(f"Auto-generate failed: {e}")
        await db.consultations.update_one(
            {"consultation_id": cid},
            {"$set": {"summary_status": "not_generated"}},
        )
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


# -----------------------------------------------------------------------------
# Family Accounts (Item #21)
# -----------------------------------------------------------------------------
@api_router.post("/family-accounts")
async def create_family_account(body: FamilyCreate, user=Depends(get_current_user)):
    primary = await db.patients.find_one({"patient_id": body.primary_patient_id, "doctor_id": str(user["_id"])})
    if not primary:
        raise HTTPException(status_code=404, detail="Primary patient not found")
    family_id = "FAM-" + secrets.token_hex(3).upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.family_accounts.insert_one({
        "family_id": family_id,
        "doctor_id": str(user["_id"]),
        "primary_patient_id": body.primary_patient_id,
        "primary_phone": primary.get("phone"),
        "created_at": now_iso,
    })
    await db.patients.update_one(
        {"patient_id": body.primary_patient_id},
        {"$set": {"family_id": family_id, "relationship": "Self"}},
    )
    return {"ok": True, "family_id": family_id}


@api_router.get("/family-accounts/{family_id}")
async def get_family_account(family_id: str, user=Depends(get_current_user)):
    fam = await db.family_accounts.find_one({"family_id": family_id, "doctor_id": str(user["_id"])})
    if not fam:
        raise HTTPException(status_code=404, detail="Family account not found")
    members = await db.patients.find({
        "family_id": family_id, "doctor_id": str(user["_id"])
    }).to_list(50)
    return {
        "family_id": family_id,
        "primary_patient_id": fam["primary_patient_id"],
        "primary_phone_masked": mask_phone(fam.get("primary_phone", "")),
        "members": [serialize_patient(m, mask=True) for m in members],
    }


@api_router.post("/family-accounts/{family_id}/members")
async def add_family_member(family_id: str, body: FamilyMemberCreate, user=Depends(get_current_user)):
    if not body.consent_given:
        raise HTTPException(status_code=400, detail="Patient consent is required")
    fam = await db.family_accounts.find_one({"family_id": family_id, "doctor_id": str(user["_id"])})
    if not fam:
        raise HTTPException(status_code=404, detail="Family account not found")
    pid = "PT-" + secrets.token_hex(3).upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    # New family members inherit the primary contact phone (one phone per family)
    doc = {
        "patient_id": pid,
        "doctor_id": str(user["_id"]),
        "first_name": body.first_name,
        "last_name": body.last_name,
        "date_of_birth": body.date_of_birth,
        "gender": body.gender,
        "phone": fam.get("primary_phone", ""),
        "family_id": family_id,
        "relationship": body.relationship,
        "consent_given": True,
        "last_visit": None,
        "created_at": now_iso,
        "consent_log": [{
            "type": "digital_record_creation",
            "timestamp": now_iso, "by": user["name"],
        }],
    }
    await db.patients.insert_one(doc)
    new_doc = await db.patients.find_one({"patient_id": pid})
    await log_activity(str(user["_id"]), pid, "patient_created",
                       f"{body.first_name} {body.last_name} ({body.relationship}) added to family",
                       {"family_id": family_id})
    return serialize_patient(new_doc, mask=False)


@api_router.get("/patients/{patient_id}/family")
async def patient_family(patient_id: str, user=Depends(get_current_user)):
    patient = await db.patients.find_one({"patient_id": patient_id, "doctor_id": str(user["_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if not patient.get("family_id"):
        return {"family_id": None, "members": []}
    members = await db.patients.find({
        "family_id": patient["family_id"], "doctor_id": str(user["_id"])
    }).to_list(50)
    return {
        "family_id": patient["family_id"],
        "members": [serialize_patient(m, mask=True) for m in members],
    }



# -----------------------------------------------------------------------------
# Sample-data seeding for the seeded admin
# -----------------------------------------------------------------------------
SAMPLE_PATIENTS = [
    {"first_name": "Rahul", "last_name": "Kumar", "date_of_birth": "1986-04-12", "gender": "Male",
     "phone": "+919876543421", "email": "rahul.k@example.in",
     "allergies": "Penicillin", "conditions": "Type 2 Diabetes",
     "medications": "Metformin 500mg BD",
     "emergency_contact_name": "Anita Kumar", "emergency_contact_phone": "+919812345678"},
    {"first_name": "Priya", "last_name": "Sharma", "date_of_birth": "1994-11-03", "gender": "Female",
     "phone": "+919812376234", "email": "priya.s@example.in",
     "allergies": "None", "conditions": "Migraine",
     "medications": "Sumatriptan PRN",
     "emergency_contact_name": "Arjun Sharma", "emergency_contact_phone": "+919812389012"},
    {"first_name": "Vikram", "last_name": "Singh", "date_of_birth": "1972-08-22", "gender": "Male",
     "phone": "+919812345987", "email": "vikram.s@example.in",
     "allergies": "Sulfa drugs", "conditions": "Hypertension, Hyperlipidemia",
     "medications": "Amlodipine 5mg OD, Atorvastatin 10mg HS",
     "emergency_contact_name": "Sunita Singh", "emergency_contact_phone": "+919812376543"},
    {"first_name": "Ananya", "last_name": "Iyer", "date_of_birth": "2001-06-15", "gender": "Female",
     "phone": "+919898765654", "email": "ananya.i@example.in",
     "allergies": "Peanuts", "conditions": "Asthma",
     "medications": "Salbutamol inhaler PRN",
     "emergency_contact_name": "Lakshmi Iyer", "emergency_contact_phone": "+919898723456"},
    {"first_name": "Mohammed", "last_name": "Khan", "date_of_birth": "1989-02-09", "gender": "Male",
     "phone": "+919910023489", "email": "m.khan@example.in",
     "allergies": "None", "conditions": "Generalized Anxiety",
     "medications": "Escitalopram 10mg OD",
     "emergency_contact_name": "Fatima Khan", "emergency_contact_phone": "+919910029876"},
]


async def seed_admin_and_data():
    admin_email = os.environ.get("ADMIN_EMAIL", "doctor@carebridge.health").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "CareBridge@2026")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Dr. Aisha Sharma",
            "specialty": "Internal Medicine",
            "registration_number": "MCI-DL-58234",
            "clinic": {"name": "CareBridge Family Clinic",
                       "address": "12, MG Road, Bengaluru 560001",
                       "phone": "+91 80 4555 1200"},
            "notifications": {"email_summaries": True, "whatsapp_summaries": True, "followup_reminders": True},
            "consent_template": DEFAULT_CONSENT_TEMPLATE,
            "security": {"mfa_enabled": False, "session_timeout": 30},
            "role": "doctor",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin: {admin_email}")
    else:
        if not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )

    user = await db.users.find_one({"email": admin_email})
    if await db.patients.count_documents({"doctor_id": str(user["_id"])}) == 0:
        for p in SAMPLE_PATIENTS:
            pid = "PT-" + secrets.token_hex(3).upper()
            await db.patients.insert_one({
                **p, "patient_id": pid,
                "doctor_id": str(user["_id"]),
                "last_visit": (datetime.now(timezone.utc) - timedelta(days=secrets.randbelow(60))).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "consent_given": True,
                "consent_log": [{
                    "type": "digital_record_creation",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "by": user["name"],
                }],
            })
        logger.info("Seeded sample patients")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.patients.create_index([("doctor_id", 1), ("patient_id", 1)])
    await db.consultations.create_index([("doctor_id", 1), ("consultation_id", 1)])
    try:
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        pass
    await seed_admin_and_data()
    init_storage()


@app.on_event("shutdown")
async def shutdown():
    client.close()


# -----------------------------------------------------------------------------
# Mount
# -----------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
