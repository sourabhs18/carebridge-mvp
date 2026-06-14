import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { StatusBadge, statusOf, fmtDate, fmtDateTime } from "@/lib/helpers";

export default function Consultations() {
  const [list, setList] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api.get("/consultations").then((r) => setList(r.data || []));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Records</div>
        <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">Consultations</h1>
        <p className="text-[#64748B] mt-2">All recorded consultations and their summary status.</p>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Patient</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Status</th>
              <th className="p-4">Follow-up</th>
              <th className="p-4">Updated</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan="7" className="p-8 text-center text-sm text-[#64748B]">No consultations yet.</td></tr>
            )}
            {list.map((c) => (
              <tr key={c.consultation_id} className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                  onClick={() => navigate(`/consultation/${c.consultation_id}/review`)}>
                <td className="p-4 text-sm">{fmtDate(c.created_at)}</td>
                <td className="p-4 text-sm font-medium text-[#0F172A]">{c.patient_name}</td>
                <td className="p-4 text-sm text-[#64748B]">{c.visit_reason || "—"}</td>
                <td className="p-4"><StatusBadge status={statusOf(c)} /></td>
                <td className="p-4 text-sm text-[#64748B]">{c.followup_date ? fmtDate(c.followup_date) : "—"}</td>
                <td className="p-4 text-sm text-[#64748B]">{fmtDateTime(c.updated_at)}</td>
                <td className="p-4 text-right">
                  <button className="px-3 h-9 rounded-lg border border-[#E2E8F0] hover:bg-white text-[#0F172A] text-sm font-medium">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
