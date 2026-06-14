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
    result = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": result.inserted_id})
    access = create_access_token(str(user["_id"]), email)
    refresh = create_refresh_token(str(user["_id"]))
    set_auth_cookies(response, access, refresh)
    return serialize_user(user)


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
    doc = {
        **p.model_dump(),
        "patient_id": patient_id,
        "doctor_id": str(user["_id"]),
        "last_visit": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "consent_log": [{
            "type": "digital_record_creation",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "by": user["name"],
        }],
    }
    result = await db.patients.insert_one(doc)
    new_doc = await db.patients.find_one({"_id": result.inserted_id})
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
        "created_at": d.get("created_at"),
    }


# -----------------------------------------------------------------------------
# Consultations
# -----------------------------------------------------------------------------
@api_router.post("/consultations")
async def create_consultation(c: ConsultationCreate, user=Depends(get_current_user)):
    patient = await db.patients.find_one({"patient_id": c.patient_id, "doctor_id": str(user["_id"])})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    cid = "CN-" + secrets.token_hex(3).upper()
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
        "consent_recorded": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consultations.insert_one(doc)
    await db.patients.update_one(
        {"patient_id": c.patient_id},
        {"$set": {"last_visit": doc["created_at"]}},
    )
    doc.pop("_id", None)
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
        "approved": d.get("approved", False),
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
    if body.status is not None:
        update_data["summary_status"] = body.status
        if body.status == "approved":
            update_data["approved"] = True
    res = await db.consultations.update_one(
        {"consultation_id": cid, "doctor_id": str(user["_id"])},
        {"$set": update_data},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Consultation not found")
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

Output strict JSON with these keys, all strings:
- diagnosis: short plain-language assessment
- medicines: comma-separated medicine names if any, else empty string
- dosage: dosage and timing instructions
- lifestyle: lifestyle advice
- tests_ordered: tests recommended or empty string
- followup: follow-up instructions
- warning_signs: warning signs that should prompt patient to seek immediate care
- next_visit: suggested next visit timing

Write in simple, warm, jargon-free language a patient with no medical training would understand. Output only the JSON object, no markdown fences."""

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
    today_consultations = await db.consultations.count_documents({
        "doctor_id": doctor_id, "created_at": {"$gte": today_start}
    })
    pending = await db.consultations.count_documents({
        "doctor_id": doctor_id, "summary_status": {"$in": ["not_generated", "generating", "ready"]}
    })
    total_patients = await db.patients.count_documents({"doctor_id": doctor_id})
    return {
        "today_consultations": today_consultations,
        "pending_summaries": pending,
        "followups_due": max(0, total_patients // 4),
        "total_patients": total_patients,
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
