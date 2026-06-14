import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, FileText, Pill, ClipboardList, Upload, Plus, ShieldCheck,
  HeartHandshake, Activity, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  ageGender, fmtDate, fmtDateTime, StatusBadge, statusOf, EVENT_LABELS, calcAge,
} from "@/lib/helpers";
import AddFamilyMemberModal from "@/components/AddFamilyMemberModal";

export default function PatientProfile() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [family, setFamily] = useState({ family_id: null, members: [] });
  const [addFamilyOpen, setAddFamilyOpen] = useState(false);
  const [creatingFamily, setCreatingFamily] = useState(false);

  const upcomingFollowup = consultations
    .filter((c) => c.followup_date && new Date(c.followup_date) >= new Date())
    .sort((a, b) => new Date(a.followup_date) - new Date(b.followup_date))[0];

  const refresh = () => {
    api.get(`/patients/${patientId}`).then((r) => setP(r.data)).catch(() => navigate("/patients"));
    api.get(`/consultations?patient_id=${patientId}`).then((r) => setConsultations(r.data || []));
    api.get(`/patients/${patientId}/timeline`).then((r) => setTimeline(r.data || []));
    api.get(`/patients/${patientId}/family`).then((r) => setFamily(r.data || { family_id: null, members: [] }));
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [patientId]);

  const startConsultation = async () => {
    const { data } = await api.post("/consultations", { patient_id: patientId });
    navigate(`/consultation/${data.consultation_id}`);
  };

  const createFamilyAccount = async () => {
    setCreatingFamily(true);
    try {
      await api.post("/family-accounts", { primary_patient_id: patientId });
      toast.success("Family account created. " + p.first_name + " is the primary contact.");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setCreatingFamily(false);
    }
  };

  if (!p) return null;

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
                <span>{ageGender(p)}</span>
                <span className="font-mono">{p.phone_masked}</span>
                <span>Last visit: {fmtDate(p.last_visit)}</span>
                {p.family_id && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-[#0D5C55]/10 text-[#0D5C55] font-medium">
                    Family · {p.relationship || "Member"}
                  </span>
                )}
                {upcomingFollowup && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 font-medium">
                    <Calendar className="h-3 w-3" /> Follow-up {fmtDate(upcomingFollowup.followup_date)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toast.info("Upload Document coming soon")}
                    className="h-11 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> Upload
            </button>
            <button onClick={() => toast.info("Add note saved as draft")}
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
        <TabsList className="bg-transparent border-b border-[#E2E8F0] w-full justify-start rounded-none h-auto p-0 mb-6 flex-wrap">
          {[
            { v: "overview", l: "Overview" },
            { v: "consultations", l: "Consultations" },
            { v: "family", l: "Family" },
            { v: "timeline", l: "Timeline" },
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
            <OverviewCard title="Upcoming Follow-up" icon={Calendar}
                          value={upcomingFollowup ? fmtDate(upcomingFollowup.followup_date) : "Not scheduled"} />
          </div>
        </TabsContent>

        <TabsContent value="consultations">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Follow-up</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {consultations.length === 0 && (
                  <tr><td colSpan="5" className="p-8 text-center text-sm text-[#64748B]">No consultations yet.</td></tr>
                )}
                {consultations.map((c) => (
                  <tr key={c.consultation_id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-4 text-sm">{fmtDate(c.created_at)}</td>
                    <td className="p-4 text-sm">{c.visit_reason || "—"}</td>
                    <td className="p-4"><StatusBadge status={statusOf(c)} /></td>
                    <td className="p-4 text-sm text-[#64748B]">{c.followup_date ? fmtDate(c.followup_date) : "—"}</td>
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

        <TabsContent value="family">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-medium text-[#0F172A]">Family Members</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Medical records remain separate. Only the family link is shared.
                  </p>
                </div>
              </div>
              {family.family_id ? (
                <button onClick={() => setAddFamilyOpen(true)}
                        data-testid="add-family-member-btn"
                        className="h-10 px-4 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white text-sm font-medium inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Add Family Member
                </button>
              ) : (
                <button onClick={createFamilyAccount} disabled={creatingFamily}
                        data-testid="create-family-btn"
                        className="h-10 px-4 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] text-sm font-medium inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Create Family Account
                </button>
              )}
            </div>

            {family.members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E2E8F0] p-8 text-center bg-[#F8FAFC]">
                <HeartHandshake className="h-6 w-6 mx-auto text-[#94A3B8] mb-2" />
                <div className="text-sm font-medium text-[#0F172A]">No family account yet</div>
                <div className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
                  Create a family account to link this patient with spouse, children, or elderly parents.
                  Each member keeps their own separate medical record.
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#E2E8F0]">
                {family.members.map((m) => (
                  <li key={m.id} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-[#F8FAFC] flex items-center justify-center text-xs font-semibold text-[#0F172A]">
                        {(m.first_name?.[0] || "") + (m.last_name?.[0] || "")}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#0F172A]">
                          {m.full_name}
                          <span className="ml-2 text-xs text-[#64748B] font-normal">({m.relationship || "Member"})</span>
                        </div>
                        <div className="text-xs text-[#64748B] mt-0.5 font-mono">
                          {m.patient_id} · {ageGender(m)}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => navigate(`/patients/${m.patient_id}`)}
                            className="h-9 px-3 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium">
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-medium text-[#0F172A]">Audit Timeline</h3>
                <p className="text-xs text-[#64748B] mt-0.5">Read-only record of all activity on this patient.</p>
              </div>
            </div>
            {timeline.length === 0 ? (
              <div className="text-sm text-[#64748B] py-6 text-center">No events recorded yet.</div>
            ) : (
              <ol className="relative border-l-2 border-[#E2E8F0] ml-3 space-y-5">
                {timeline.map((e, i) => (
                  <li key={i} className="ml-5">
                    <span className="absolute -left-[7px] h-3 w-3 rounded-full bg-[#0D5C55] mt-1.5" />
                    <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
                      {fmtDate(e.timestamp)}
                    </div>
                    <div className="text-sm font-medium text-[#0F172A] mt-1">
                      {EVENT_LABELS[e.event_type] || e.event_type}
                    </div>
                    <div className="text-xs text-[#64748B] mt-0.5">{e.description}</div>
                  </li>
                ))}
              </ol>
            )}
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
                    {fmtDateTime(c.timestamp)} · by {c.by}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AddFamilyMemberModal
        open={addFamilyOpen}
        familyId={family.family_id}
        onClose={() => setAddFamilyOpen(false)}
        onAdded={refresh}
      />
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
