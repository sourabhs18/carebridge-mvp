import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Stethoscope, ClipboardList, Bell, Users as UsersIcon, ArrowUpRight, Clock,
} from "lucide-react";

const SAMPLE_APPTS = [
  { time: "09:30 AM", name: "Rahul Kumar", ag: "38 / M", reason: "Diabetes follow-up", status: "Confirmed" },
  { time: "10:15 AM", name: "Priya Sharma", ag: "30 / F", reason: "Migraine review", status: "Confirmed" },
  { time: "11:00 AM", name: "Vikram Singh", ag: "52 / M", reason: "BP check-up", status: "Waiting" },
  { time: "12:30 PM", name: "Ananya Iyer", ag: "23 / F", reason: "Asthma flare", status: "Confirmed" },
  { time: "02:45 PM", name: "Mohammed Khan", ag: "35 / M", reason: "Anxiety review", status: "Confirmed" },
];

const STATUS_COLORS = {
  not_generated: "bg-slate-100 text-slate-600",
  generating: "bg-sky-50 text-sky-700",
  ready: "bg-teal-50 text-teal-700",
  approved: "bg-emerald-50 text-emerald-700",
};

const STATUS_LABEL = {
  not_generated: "Not generated",
  generating: "Generating",
  ready: "Ready for review",
  approved: "Approved",
};

function StatCard({ label, value, hint, icon: Icon, testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{label}</div>
          <div className="font-heading text-4xl font-semibold text-[#0F172A] mt-3 tracking-tight">{value}</div>
          <div className="text-xs text-[#64748B] mt-2">{hint}</div>
        </div>
        <div className="h-10 w-10 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
          <Icon className="h-5 w-5" strokeWidth={1.6} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ today_consultations: 0, pending_summaries: 0, followups_due: 0, total_patients: 0 });
  const [patients, setPatients] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/patients").then((r) => setPatients(r.data || [])).catch(() => {});
    api.get("/consultations").then((r) => setRecent(r.data || [])).catch(() => {});
  }, []);

  const startConsultation = async (patientName) => {
    try {
      let list = patients;
      if (!list || list.length === 0) {
        const { data } = await api.get("/patients");
        list = data || [];
        setPatients(list);
      }
      const patient = list.find((p) => p.full_name === patientName);
      if (!patient) {
        toast.error(`${patientName} is not in your patient list yet. Add them first.`);
        navigate("/patients");
        return;
      }
      const { data } = await api.post("/consultations", { patient_id: patient.patient_id });
      navigate(`/consultation/${data.consultation_id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not start consultation");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Welcome back</div>
        <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">
          {user?.name?.split(" ").slice(0, 2).join(" ") || "Doctor"}
        </h1>
        <p className="text-[#64748B] mt-2">Here&apos;s how your clinic looks today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard testid="stat-today-consultations" label="Today's Consultations"
          value={stats.today_consultations} hint="In progress and scheduled" icon={Stethoscope} />
        <StatCard testid="stat-pending-summaries" label="Pending Summaries"
          value={stats.pending_summaries} hint="Awaiting your review" icon={ClipboardList} />
        <StatCard testid="stat-followups-due" label="Follow-ups Due"
          value={stats.followups_due} hint="This week" icon={Bell} />
        <StatCard testid="stat-total-patients" label="Total Patients"
          value={stats.total_patients} hint="Under your care" icon={UsersIcon} />
      </div>

      {/* Today's Appointments */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-heading text-2xl font-medium text-[#0F172A]">Today&apos;s Appointments</h2>
            <p className="text-sm text-[#64748B] mt-1">Sample schedule. Click &ldquo;Start&rdquo; to record a consultation.</p>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
              <tr>
                <th className="p-4">Time</th>
                <th className="p-4">Patient Name</th>
                <th className="p-4">Age / Gender</th>
                <th className="p-4">Reason</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE_APPTS.map((a, i) => (
                <tr key={i} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                  <td className="p-4 text-sm font-medium text-[#0F172A]">
                    <Clock className="inline h-3.5 w-3.5 mr-1.5 text-[#94A3B8]" /> {a.time}
                  </td>
                  <td className="p-4 text-sm text-[#0F172A]">{a.name}</td>
                  <td className="p-4 text-sm text-[#64748B]">{a.ag}</td>
                  <td className="p-4 text-sm text-[#64748B]">{a.reason}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      a.status === "Confirmed" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
                    }`}>{a.status}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      data-testid={`start-consult-${i}`}
                      onClick={() => startConsultation(a.name)}
                      className="px-4 h-9 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white text-sm font-medium transition-colors"
                    >
                      Start Consultation
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Consultations */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-heading text-2xl font-medium text-[#0F172A]">Recent Consultations</h2>
            <p className="text-sm text-[#64748B] mt-1">Review and approve AI-generated summaries.</p>
          </div>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Patient</th>
                <th className="p-4">Summary Status</th>
                <th className="p-4">Last Updated</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan="5" className="p-8 text-center text-sm text-[#64748B]">
                  No consultations yet. Start your first one from above.
                </td></tr>
              )}
              {recent.slice(0, 8).map((c) => (
                <tr key={c.consultation_id}
                    className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                    onClick={() => navigate(`/consultation/${c.consultation_id}/review`)}>
                  <td className="p-4 text-sm text-[#0F172A]">{new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="p-4 text-sm font-medium text-[#0F172A]">{c.patient_name}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.summary_status]}`}>
                      {STATUS_LABEL[c.summary_status]}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-[#64748B]">{new Date(c.updated_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</td>
                  <td className="p-4 text-right">
                    <button
                      data-testid={`view-consult-${c.consultation_id}`}
                      className="px-4 h-9 rounded-lg bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] text-[#0F172A] text-sm font-medium inline-flex items-center gap-1.5"
                    >
                      View <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
