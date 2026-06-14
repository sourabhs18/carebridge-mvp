import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import {
  Mic, Square, Pause, Upload, ShieldCheck, Sparkles, Loader2, ArrowRight, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, statusOf, formatDuration } from "@/lib/helpers";

export default function StartConsultation() {
  const { cid } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  const [visitReason, setVisitReason] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [vitals, setVitals] = useState({ bp: "", hr: "", temp: "", spo2: "", weight: "" });
  const [consent, setConsent] = useState({ patient: false, doctor: false, exclude_sensitive: false });

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [transcript, setTranscript] = useState("");
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const lastSavedRef = useRef({});

  // ---- Load consultation ----
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/consultations/${cid}`);
        setC(data);
        setVisitReason(data.visit_reason || "");
        setSymptoms(data.symptoms || "");
        setVitals({ bp: "", hr: "", temp: "", spo2: "", weight: "", ...(data.vitals || {}) });
        setTranscript(data.transcript || "");
        if (data.duration_seconds) setElapsed(data.duration_seconds);
        lastSavedRef.current = {
          visit_reason: data.visit_reason || "",
          symptoms: data.symptoms || "",
          vitals: data.vitals || {},
          transcript: data.transcript || "",
        };
      } catch {
        toast.error("Could not load consultation");
      } finally {
        setLoading(false);
      }
    })();
  }, [cid]);

  // ---- Polling for status when "generating" (after auto-trigger) ----
  useEffect(() => {
    if (c?.summary_status !== "generating") return;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get(`/consultations/${cid}`);
        setC(data);
        if (data.summary_status !== "generating") clearInterval(id);
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(id);
  }, [c?.summary_status, cid]);

  // ---- Auto-save every 30s if changed ----
  const doAutosave = useCallback(async () => {
    if (!cid) return;
    const cur = { visit_reason: visitReason, symptoms, vitals, transcript };
    if (JSON.stringify(cur) === JSON.stringify(lastSavedRef.current)) return;
    try {
      const { data } = await api.put(`/consultations/${cid}/autosave`, cur);
      lastSavedRef.current = cur;
      setSavedAt(data.saved_at);
    } catch { /* silent */ }
  }, [cid, visitReason, symptoms, vitals, transcript]);

  useEffect(() => {
    const id = setInterval(doAutosave, 30000);
    return () => clearInterval(id);
  }, [doAutosave]);

  // Save on unmount / route change
  useEffect(() => () => { doAutosave(); }, [doAutosave]);

  const consentAll = consent.patient && consent.doctor && consent.exclude_sensitive;

  const startRecording = async () => {
    if (!consentAll) return toast.error("Please confirm all consent items before recording.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadAudio(blob);
      };
      recorder.start();
      setRecording(true);
      setPaused(false);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const pauseRecording = () => {
    if (!mediaRef.current) return;
    if (paused) {
      mediaRef.current.resume();
      setPaused(false);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      mediaRef.current.pause();
      setPaused(true);
      clearInterval(timerRef.current);
    }
  };

  const stopRecording = () => {
    if (!mediaRef.current) return;
    mediaRef.current.stop();
    setRecording(false);
    setPaused(false);
    clearInterval(timerRef.current);
    // Save duration to server
    api.put(`/consultations/${cid}/duration`, { duration_seconds: elapsed }).catch(() => {});
  };

  const uploadAudio = async (blob) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", blob, "consultation.webm");
    try {
      const { data } = await api.post(`/consultations/${cid}/audio`, fd, {
        headers: { "Content-Type": "multipart/form-data" }, timeout: 180000,
      });
      setTranscript(data.transcript || "");
      lastSavedRef.current.transcript = data.transcript || "";
      toast.success("Transcript generated. Starting AI summary…");
      // Auto-trigger summary
      triggerAutoGenerate();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Transcription failed");
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await uploadAudio(f);
    e.target.value = "";
  };

  const saveTranscript = async () => {
    try {
      await api.put(`/consultations/${cid}/transcript`, { transcript });
      lastSavedRef.current.transcript = transcript;
      setEditingTranscript(false);
      toast.success("Transcript saved. Starting AI summary…");
      triggerAutoGenerate();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const triggerAutoGenerate = async () => {
    if (!transcript.trim()) return;
    setAutoGenerating(true);
    setC((cur) => ({ ...cur, summary_status: "generating" }));
    try {
      const { data } = await api.post(`/consultations/${cid}/auto-generate`, {}, { timeout: 180000 });
      toast.success("AI summary ready. Review and approve.");
      const { data: fresh } = await api.get(`/consultations/${cid}`);
      setC(fresh);
      // Auto-navigate to review
      setTimeout(() => navigate(`/consultation/${cid}/review`), 800);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Generation failed");
    } finally {
      setAutoGenerating(false);
    }
  };

  const goReview = () => navigate(`/consultation/${cid}/review`);

  if (loading || !c) return null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Consultation</div>
          <h1 className="font-heading text-3xl md:text-4xl font-semibold text-[#0F172A] mt-1 tracking-tight">
            {c.patient_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-[#64748B]">
            <span className="font-mono">{c.patient_id}</span>
            <span>{new Date(c.created_at).toLocaleString("en-IN")}</span>
            <span>with {c.doctor_name}</span>
            <StatusBadge status={statusOf(c)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-[#64748B] inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Draft saved
            </span>
          )}
        </div>
      </div>

      {/* A. Pre-consultation details */}
      <Section title="A. Pre-consultation Details" subtitle="Capture context before recording. Auto-saves every 30 seconds.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Visit Reason">
            <input value={visitReason} onChange={(e) => setVisitReason(e.target.value)}
                   className="cb-input" placeholder="e.g. Follow-up for diabetes" data-testid="visit-reason" />
          </Field>
          <Field label="Symptoms described by patient">
            <input value={symptoms} onChange={(e) => setSymptoms(e.target.value)}
                   className="cb-input" placeholder="Headache, fatigue…" data-testid="symptoms" />
          </Field>
        </div>
        <div className="mt-5">
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold mb-3">Vitals</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["bp", "BP (mmHg)", "120/80"],
              ["hr", "Heart Rate", "72 bpm"],
              ["temp", "Temperature", "98.6 °F"],
              ["spo2", "SpO₂", "98 %"],
              ["weight", "Weight", "70 kg"],
            ].map(([k, label, ph]) => (
              <Field key={k} label={label}>
                <input value={vitals[k]} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })}
                       className="cb-input" placeholder={ph} data-testid={`vital-${k}`} />
              </Field>
            ))}
          </div>
        </div>
      </Section>

      {/* B. Consent + Recording */}
      <Section title="B. Consent & Recording" subtitle="Verify consent before starting the recording.">
        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-5">
          <div className="flex items-start gap-3 mb-4">
            <ShieldCheck className="h-5 w-5 text-[#0D5C55] mt-0.5" />
            <p className="text-sm text-[#0F172A] leading-relaxed">
              Before recording, confirm that the patient understands the consultation may be recorded and processed to
              generate medical notes and a patient-friendly summary.
            </p>
          </div>
          {[
            ["patient", "Patient consent received"],
            ["doctor", "Doctor confirms recording is appropriate"],
            ["exclude_sensitive", "Do not include sensitive non-medical conversation"],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 py-1.5 cursor-pointer">
              <input type="checkbox" checked={consent[k]}
                     onChange={(e) => setConsent({ ...consent, [k]: e.target.checked })}
                     data-testid={`consent-${k}`} className="h-4 w-4 accent-[#0D5C55]" />
              <span className="text-sm text-[#0F172A]">{label}</span>
            </label>
          ))}
        </div>

        {/* Big consultation timer */}
        <div className="mt-6 rounded-xl border border-[#E2E8F0] p-6 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className={`relative h-14 w-14 rounded-full flex items-center justify-center ${recording ? "bg-rose-50" : "bg-[#F8FAFC]"}`}>
              {recording && <span className="absolute h-3.5 w-3.5 rounded-full bg-rose-500 cb-recording-dot" />}
              {!recording && <Mic className="h-6 w-6 text-[#0D5C55]" />}
            </div>
            <div>
              <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Consultation Duration</div>
              <div className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] tracking-tight tabular-nums mt-1">
                {formatDuration(elapsed)}
              </div>
              <div className="text-xs text-[#64748B] mt-1">
                {uploading ? "Uploading & transcribing…" : recording ? (paused ? "Paused" : "Recording") : "Idle"}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-wrap gap-2 justify-end">
            {!recording ? (
              <button onClick={startRecording} disabled={!consentAll || uploading}
                      data-testid="start-recording-btn"
                      className="h-12 px-6 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">
                <Mic className="h-4 w-4" /> Start Recording
              </button>
            ) : (
              <>
                <button onClick={pauseRecording}
                        data-testid="pause-recording-btn"
                        className="h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
                  <Pause className="h-4 w-4" /> {paused ? "Resume" : "Pause"}
                </button>
                <button onClick={stopRecording}
                        data-testid="stop-recording-btn"
                        className="h-12 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium inline-flex items-center gap-2">
                  <Square className="h-4 w-4" /> Stop
                </button>
              </>
            )}
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onPickFile} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    data-testid="upload-audio-btn"
                    className="h-12 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Audio
            </button>
          </div>
        </div>
      </Section>

      {/* C. Transcript */}
      <Section title="C. Transcript" subtitle="Saving the transcript automatically generates a doctor note and a patient-friendly summary.">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          readOnly={!editingTranscript}
          placeholder="Consultation transcript will appear here after audio processing. You can also type or paste a transcript manually."
          data-testid="transcript-area"
          className={`w-full min-h-[220px] rounded-xl border border-[#E2E8F0] p-4 text-sm bg-white ${editingTranscript ? "focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none" : "bg-[#F8FAFC]"}`}
        />
        <div className="mt-3 flex gap-2">
          {!editingTranscript ? (
            <button onClick={() => setEditingTranscript(true)}
                    data-testid="edit-transcript-btn"
                    className="h-10 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium text-sm">
              Edit Transcript
            </button>
          ) : (
            <button onClick={saveTranscript}
                    data-testid="save-transcript-btn"
                    className="h-10 px-4 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium text-sm inline-flex items-center gap-2">
              {autoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Save Transcript & Auto-Generate
            </button>
          )}
        </div>
      </Section>

      {/* D. AI Summary status */}
      <Section title="D. AI Summary" subtitle="Doctor notes and patient-friendly summary are generated together.">
        <div className="rounded-xl border border-[#E2E8F0] p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#0F172A]">Patient summary & doctor notes</div>
              <div className="text-xs text-[#64748B] mt-0.5">Auto-generates when transcript is saved.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={statusOf(c)} />
            <button onClick={triggerAutoGenerate} disabled={autoGenerating || !transcript.trim()}
                    data-testid="manual-generate-btn"
                    className="h-10 px-4 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60">
              {autoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Regenerate
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={goReview} data-testid="go-to-review-btn"
                  className="h-11 px-5 rounded-lg bg-[#0F172A] text-white font-medium inline-flex items-center gap-2 hover:bg-[#1E293B]">
            Review & Approve <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Section>

      <style>{`.cb-input{height:2.75rem;width:100%;border:1px solid #E2E8F0;border-radius:0.5rem;padding:0 1rem;font-size:0.875rem;background:white;outline:none;}
      .cb-input:focus{border-color:#0D5C55;box-shadow:0 0 0 3px rgba(13,92,85,0.15);}`}</style>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-8 bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
      <div className="mb-5">
        <h2 className="font-heading text-xl font-medium text-[#0F172A]">{title}</h2>
        {subtitle && <p className="text-sm text-[#64748B] mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
