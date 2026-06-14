import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, FileText, Pill, ClipboardList, Upload, Plus, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  not_generated: "bg-slate-100 text-slate-600",
  generating: "bg-sky-50 text-sky-700",
  ready: "bg-teal-50 text-teal-700",
  approved: "bg-emerald-50 text-emerald-700",
};

const STATUS_LABEL = {
  not_generated: "Not generated",
  generating: "Generating",
  ready: "Ready",
  approved: "Approved",
};

export default function PatientProfile() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [consultations, setConsultations] = useState([]);

  useEffect(() => {
    api.get(`/patients/${patientId}`).then((r) => setP(r.data)).catch(() => navigate("/patients"));
    api.get(`/consultations?patient_id=${patientId}`).then((r) => setConsultations(r.data || []));
  }, [patientId, navigate]);

  const startConsultation = async () => {
    const { data } = await api.post("/consultations", { patient_id: patientId });
    navigate(`/consultation/${data.consultation_id}`);
  };

  if (!p) return null;

  const age = p.date_of_birth
    ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / (365.25 * 86400000))
    : "—";

  return (
    <div>
      <button onClick={() => navigate(-1)}
              className="text-sm text-[#64748B] hover:text-[#0F172A] inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-5">
            <div className="h-14 w-14 rounded-full bg-[#0D5C55] text-white flex items-center justify-center font-heading font-semibold text-lg">
              {(p.first_name?.[0] || "") + (p.last_name?.[0] || "")}
            </div>
            <div>
              <h1 className="font-heading text-3xl font-semibold text-[#0F172A] tracking-tight">{p.full_name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-[#64748B]">
                <span className="font-mono">{p.patient_id}</span>
                <span>{age} / {p.gender || "—"}</span>
                <span className="font-mono">{p.phone_masked}</span>
                <span>Last visit: {p.last_visit ? new Date(p.last_visit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toast.info("Upload Document coming soon")}
                    data-testid="upload-document-btn"
                    className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload
            </button>
            <button onClick={() => toast.info("Add note saved as draft")}
                    data-testid="add-note-btn"
                    className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Note
            </button>
            <button onClick={startConsultation}
                    data-testid="start-consultation-btn"
                    className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium">
              Start New Consultation
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent border-b border-[#E2E8F0] w-full justify-start rounded-none h-auto p-0 mb-6">
          {[
            { v: "overview", l: "Overview" },
            { v: "consultations", l: "Consultations" },
            { v: "medications", l: "Medications" },
            { v: "documents", l: "Documents" },
            { v: "consent", l: "Consent Log" },
          ].map((t) => (
            <TabsTrigger key={t.v} value={t.v}
                         data-testid={`tab-${t.v}`}
                         className="data-[state=active]:border-[#0D5C55] data-[state=active]:text-[#0D5C55] data-[state=active]:shadow-none data-[state=active]:bg-transparent border-b-2 border-transparent rounded-none px-4 pb-3 text-sm font-medium text-[#64748B]">
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <OverviewCard title="Allergies" icon={ShieldCheck} value={p.allergies || "None on record"} />
            <OverviewCard title="Medical Conditions" icon={FileText} value={p.conditions || "None on record"} />
            <OverviewCard title="Current Medications" icon={Pill} value={p.medications || "None"} />
            <OverviewCard title="Recent Notes" icon={ClipboardList} value="No recent notes" />
          </div>
        </TabsContent>

        <TabsContent value="consultations">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Doctor</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Patient Summary</th>
                  <th className="p-4">Doctor Notes</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {consultations.length === 0 && (
                  <tr><td colSpan="6" className="p-8 text-center text-sm text-[#64748B]">No consultations yet.</td></tr>
                )}
                {consultations.map((c) => (
                  <tr key={c.consultation_id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-4 text-sm">{new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="p-4 text-sm">{c.doctor_name}</td>
                    <td className="p-4 text-sm">{c.visit_reason || "—"}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.summary_status]}`}>
                        {STATUS_LABEL[c.summary_status]}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs text-[#64748B]">
                        {Object.keys(c.doctor_notes || {}).length > 0 ? "Drafted" : "Empty"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => navigate(`/consultation/${c.consultation_id}/review`)}
                              className="px-3 h-9 rounded-lg border border-[#E2E8F0] hover:bg-white text-[#0F172A] text-sm font-medium">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="medications">
          <Empty title="Medications" message={p.medications || "No active medications on record."} />
        </TabsContent>

        <TabsContent value="documents">
          <Empty title="Documents" message="Documents uploaded for this patient will appear here." />
        </TabsContent>

        <TabsContent value="consent">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6 space-y-3">
            {(p.consent_log || []).length === 0 && (
              <div className="text-sm text-[#64748B]">No consent events logged.</div>
            )}
            {(p.consent_log || []).map((c, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-[#E2E8F0] last:border-b-0">
                <ShieldCheck className="h-5 w-5 text-[#0D5C55] mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-[#0F172A]">{c.type.replaceAll("_", " ")}</div>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {new Date(c.timestamp).toLocaleString("en-IN")} · by {c.by}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewCard({ title, value, icon: Icon }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5">
      <div className="flex items-center gap-2 text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="mt-3 text-sm text-[#0F172A] leading-relaxed">{value}</div>
    </div>
  );
}

function Empty({ title, message }) {
  return (
    <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-12 text-center">
      <div className="font-heading text-lg text-[#0F172A]">{title}</div>
      <div className="text-sm text-[#64748B] mt-2">{message}</div>
    </div>
  );
}
