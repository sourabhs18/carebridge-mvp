import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Stethoscope, ClipboardList, Bell, Users as UsersIcon, Clock, Plus,
  CheckCircle2, Timer, HeartHandshake, Activity, ArrowUpRight, Play,
} from "lucide-react";
import StartConsultationDialog from "@/components/StartConsultationDialog";
import { ageGender, fmtDate, fmtDateTime, StatusBadge, statusOf, EVENT_LABELS } from "@/lib/helpers";

const APPT_SLOTS = [
  { time: "09:30 AM", reason: "Routine check-up", status: "Confirmed" },
  { time: "10:15 AM", reason: "Follow-up review", status: "Confirmed" },
  { time: "11:00 AM", reason: "New symptoms", status: "Waiting" },
  { time: "12:30 PM", reason: "Medication review", status: "Confirmed" },
  { time: "02:45 PM", reason: "Test results discussion", status: "Confirmed" },
];

function StatCard({ label, value, hint, icon: Icon, testid }) {
  return (
    <div data-testid={testid}
         className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] tracking-[0.08em] uppercase text-[#64748B] font-semibold">{label}</div>
          <div className="font-heading text-3xl font-semibold text-[#0F172A] mt-2 tracking-tight">{value}</div>
          <div className="text-xs text-[#64748B] mt-1">{hint}</div>
        </div>
        <div className="h-9 w-9 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
          <Icon className="h-4 w-4" strokeWidth={1.6} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [patients, setPatients] = useState([]);
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activeDraft, setActiveDraft] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = () => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/patients").then((r) => setPatients(r.data || [])).catch(() => {});
    api.get("/consultations").then((r) => setRecent(r.data || [])).catch(() => {});
    api.get("/dashboard/activity").then((r) => setActivity(r.data || [])).catch(() => {});
    api.get("/dashboard/active-draft").then((r) => setActiveDraft(r.data || null)).catch(() => {});
  };

  useEffect(() => { refresh(); }, []);

  const appointments = useMemo(() => {
    return patients.slice(0, 5).map((p, i) => {
      const slot = APPT_SLOTS[i] || APPT_SLOTS[APPT_SLOTS.length - 1];
      return {
        patient_id: p.patient_id, name: p.full_name,
        ag: ageGender(p), time: slot.time, reason: slot.reason, status: slot.status,
      };
    });
  }, [patients]);

  const startConsultation = async (patient_id) => {
    const { data } = await api.post("/consultations", { patient_id });
    navigate(`/consultation/${data.consultation_id}`);
  };

  return (
    <div>
      {/* Resume Draft Banner */}
      {activeDraft && !activeDraft.approved && (
        <div data-testid="resume-draft-banner"
             className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Play className="h-5 w-5 text-amber-700 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-900">Resume previous consultation?</div>
              <div className="text-xs text-amber-800 mt-0.5">
                {activeDraft.patient_name} · started {fmtDateTime(activeDraft.created_at)} ·{" "}
                <span className="font-medium">{statusOf(activeDraft).replace("_", " ")}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setActiveDraft(null)}
                    data-testid="resume-discard"
                    className="h-9 px-3 rounded-lg border border-amber-300 text-amber-900 hover:bg-white text-sm font-medium">
              Dismiss
            </button>
            <button onClick={() => navigate(`/consultation/${activeDraft.consultation_id}`)}
                    data-testid="resume-continue"
                    className="h-9 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-sm font-medium">
              Resume
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Welcome back</div>
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">
            {user?.name?.split(" ").slice(0, 2).join(" ") || "Doctor"}
          </h1>
          <p className="text-[#64748B] mt-2">Here&apos;s how your clinic looks today.</p>
        </div>
        <button onClick={() => setDialogOpen(true)}
                data-testid="start-new-consultation-btn"
                className="h-12 px-6 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 shadow-sm">
          <Plus className="h-4 w-4" /> Start New Consultation
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <StatCard testid="stat-today-consultations" label="Today's Consults"
                  value={stats.today_consultations ?? 0} hint="Started today" icon={Stethoscope} />
        <StatCard testid="stat-pending-summaries" label="Pending Review"
                  value={stats.pending_summaries ?? 0} hint="Awaiting approval" icon={ClipboardList} />
        <StatCard testid="stat-approved-today" label="Approved Today"
                  value={stats.approved_today ?? 0} hint="Doctor approved" icon={CheckCircle2} />
        <StatCard testid="stat-avg-duration" label="Avg Duration"
                  value={`${stats.avg_consultation_minutes ?? 0}m`} hint="Per consultation" icon={Timer} />
        <StatCard testid="stat-followups-due" label="Follow-ups Today"
                  value={stats.followups_due ?? 0} hint="Scheduled" icon={Bell} />
        <StatCard testid="stat-family-accounts" label="Family Accounts"
                  value={stats.family_accounts ?? 0} hint="Households" icon={HeartHandshake} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Today's Appointments */}
        <section className="xl:col-span-2">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-heading text-2xl font-medium text-[#0F172A]">Today&apos;s Appointments</h2>
              <p className="text-sm text-[#64748B] mt-1">Sample schedule from your patient list.</p>
            </div>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-12 text-center">
              <UsersIcon className="h-6 w-6 mx-auto text-[#94A3B8] mb-3" />
              <div className="font-heading text-lg text-[#0F172A]">No patients yet</div>
              <div className="text-sm text-[#64748B] mt-1 mb-5">Search or quick-add a patient to start a consultation.</div>
              <button data-testid="dashboard-add-first-patient-btn"
                      onClick={() => setDialogOpen(true)}
                      className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Start New Consultation
              </button>
            </div>
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                  <tr>
                    <th className="p-3.5">Time</th>
                    <th className="p-3.5">Patient</th>
                    <th className="p-3.5">Age/Gender</th>
                    <th className="p-3.5">Reason</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a, i) => (
                    <tr key={a.patient_id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                      <td className="p-3.5 text-sm font-medium text-[#0F172A]">
                        <Clock className="inline h-3.5 w-3.5 mr-1.5 text-[#94A3B8]" /> {a.time}
                      </td>
                      <td className="p-3.5 text-sm text-[#0F172A]">{a.name}</td>
                      <td className="p-3.5 text-sm text-[#64748B]">{a.ag}</td>
                      <td className="p-3.5 text-sm text-[#64748B]">{a.reason}</td>
                      <td className="p-3.5 text-right">
                        <button data-testid={`start-consult-${i}`}
                                onClick={() => startConsultation(a.patient_id)}
                                className="px-3 h-9 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white text-xs font-medium">
                          Start
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Consultations */}
          <div className="mt-8">
            <div className="flex items-end justify-between mb-4">
              <h2 className="font-heading text-2xl font-medium text-[#0F172A]">Recent Consultations</h2>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
                  <tr>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Patient</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Updated</th>
                    <th className="p-3.5 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-sm text-[#64748B]">No consultations yet.</td></tr>
                  )}
                  {recent.slice(0, 6).map((c) => (
                    <tr key={c.consultation_id}
                        className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                        onClick={() => navigate(`/consultation/${c.consultation_id}/review`)}>
                      <td className="p-3.5 text-sm">{fmtDate(c.created_at)}</td>
                      <td className="p-3.5 text-sm font-medium text-[#0F172A]">{c.patient_name}</td>
                      <td className="p-3.5"><StatusBadge status={statusOf(c)} /></td>
                      <td className="p-3.5 text-sm text-[#64748B]">{fmtDateTime(c.updated_at)}</td>
                      <td className="p-3.5 text-right">
                        <ArrowUpRight className="h-4 w-4 text-[#94A3B8] inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Recent Activity Feed */}
        <aside data-testid="recent-activity">
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-heading text-2xl font-medium text-[#0F172A] flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#0D5C55]" /> Recent Activity
            </h2>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
            {activity.length === 0 && (
              <div className="p-8 text-center text-sm text-[#64748B]">No activity yet.</div>
            )}
            <ul className="divide-y divide-[#E2E8F0]">
              {activity.map((e, i) => (
                <li key={i} className="p-4 hover:bg-[#F8FAFC] transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="h-2 w-2 rounded-full bg-[#0D5C55] mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
                        {EVENT_LABELS[e.event_type] || e.event_type}
                      </div>
                      <div className="text-sm text-[#0F172A] mt-0.5 truncate">{e.description}</div>
                      <div className="text-xs text-[#94A3B8] mt-0.5">{fmtDateTime(e.timestamp)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <StartConsultationDialog open={dialogOpen} onClose={() => { setDialogOpen(false); refresh(); }} />
    </div>
  );
}
