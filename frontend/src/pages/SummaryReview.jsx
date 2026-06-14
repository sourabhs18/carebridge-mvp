import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { ArrowLeft, Check, Download, Send, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";

const PATIENT_SECTIONS = [
  ["diagnosis", "Diagnosis / Assessment"],
  ["medicines", "Medicines"],
  ["dosage", "Dosage Instructions"],
  ["lifestyle", "Lifestyle Advice"],
  ["tests_ordered", "Tests Ordered"],
  ["followup", "Follow-up Instructions"],
  ["warning_signs", "Warning Signs"],
  ["next_visit", "Next Visit"],
];

const DOCTOR_SECTIONS = [
  ["chief_complaint", "Chief Complaint"],
  ["history", "History / Symptoms"],
  ["observations", "Observations"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
  ["followup", "Follow-up"],
];

export default function SummaryReview() {
  const { cid } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [patient, setPatient] = useState({});
  const [doctor, setDoctor] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/consultations/${cid}`).then((r) => {
      setC(r.data);
      setPatient(r.data.patient_summary || {});
      setDoctor(r.data.doctor_notes || {});
    });
  }, [cid]);

  const save = async (status = null) => {
    setSaving(true);
    try {
      await api.put(`/consultations/${cid}/summary`, {
        patient_summary: patient,
        doctor_notes: doctor,
        status,
      });
      toast.success(status === "approved" ? "Summary approved" : "Draft saved");
      if (status === "approved") {
        const { data } = await api.get(`/consultations/${cid}`);
        setC(data);
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!c) return null;

  return (
    <div>
      <button onClick={() => navigate(-1)}
              className="text-sm text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Review & Approve</div>
          <h1 className="font-heading text-3xl md:text-4xl font-semibold text-[#0F172A] mt-1 tracking-tight">
            {c.patient_name}
          </h1>
          <div className="mt-2 text-sm text-[#64748B]">
            <span className="font-mono">{c.patient_id}</span> · {new Date(c.created_at).toLocaleString("en-IN")} ·{" "}
            {c.doctor_name}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => save(null)} disabled={saving}
                  data-testid="save-draft-btn"
                  className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button onClick={() => toast.info("PDF download coming soon")}
                  data-testid="download-pdf-btn"
                  className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <button onClick={() => toast.info("Send to patient coming soon")}
                  data-testid="send-patient-btn"
                  className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
            <Send className="h-4 w-4" /> Send to Patient
          </button>
          <button onClick={() => save("approved")} disabled={saving || c.approved}
                  data-testid="approve-summary-btn"
                  className="h-11 px-4 rounded-lg bg-[#10B981] hover:bg-emerald-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
            <Check className="h-4 w-4" /> {c.approved ? "Approved" : "Approve Summary"}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 mb-6">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
        <p className="text-sm text-amber-900 leading-relaxed">
          AI-generated content must be reviewed and approved by the doctor before sharing with the patient.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Column
          title="Patient-Friendly Summary"
          subtitle="Plain-language summary the patient will receive."
          accent="#0D5C55"
          sections={PATIENT_SECTIONS}
          values={patient}
          onChange={(k, v) => setPatient({ ...patient, [k]: v })}
          testidPrefix="patient"
        />
        <Column
          title="Doctor Clinical Notes"
          subtitle="Clinical notes for your records."
          accent="#0F172A"
          sections={DOCTOR_SECTIONS}
          values={doctor}
          onChange={(k, v) => setDoctor({ ...doctor, [k]: v })}
          testidPrefix="doctor"
        />
      </div>
    </div>
  );
}

function Column({ title, subtitle, accent, sections, values, onChange, testidPrefix }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <div>
          <h2 className="font-heading text-lg font-medium text-[#0F172A]">{title}</h2>
          <p className="text-xs text-[#64748B] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-6 space-y-5">
        {sections.map(([key, label]) => (
          <div key={key}>
            <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{label}</label>
            <textarea
              value={values[key] || ""}
              onChange={(e) => onChange(key, e.target.value)}
              rows={3}
              data-testid={`${testidPrefix}-${key}`}
              placeholder="—"
              className="mt-2 w-full rounded-lg border border-[#E2E8F0] p-3 text-sm focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none bg-white"
            />
          </div>
        ))}
        {values.raw && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="font-semibold mb-1">Note</div>
            AI did not return strict JSON. Raw output kept below — please copy into appropriate fields.
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px]">{values.raw}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
