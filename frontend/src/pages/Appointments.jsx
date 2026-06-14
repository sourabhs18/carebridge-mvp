import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { CalendarDays, Clock } from "lucide-react";
import { fmtDate, StatusBadge, statusOf } from "@/lib/helpers";

export default function Appointments() {
  const [followups, setFollowups] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/followups/upcoming").then((r) => setFollowups(r.data || []));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Schedule</div>
        <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">Appointments</h1>
        <p className="text-[#64748B] mt-2">Upcoming follow-ups scheduled after approved consultations.</p>
      </div>

      <section className="mb-10">
        <h2 className="font-heading text-2xl font-medium text-[#0F172A] mb-4">Follow-up Queue</h2>
        {followups.length === 0 ? (
          <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-12 text-center">
            <CalendarDays className="h-6 w-6 mx-auto text-[#94A3B8] mb-2" />
            <div className="font-medium text-[#0F172A]">No upcoming follow-ups</div>
            <div className="text-xs text-[#64748B] mt-1">Set a follow-up date when approving a consultation.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {followups.map((c) => (
              <div key={c.consultation_id}
                   onClick={() => navigate(`/consultation/${c.consultation_id}/review`)}
                   className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow flex items-center gap-4 cursor-pointer">
                <div className="h-12 w-12 rounded-xl bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{fmtDate(c.followup_date)}</div>
                  <div className="text-base font-medium text-[#0F172A] mt-0.5">{c.patient_name}</div>
                  <div className="text-sm text-[#64748B] mt-0.5">{c.visit_reason || "Follow-up"}</div>
                </div>
                <StatusBadge status={statusOf(c)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
