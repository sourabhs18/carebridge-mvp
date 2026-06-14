import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Plus, Filter, Search, ShieldCheck, Users as UsersIcon } from "lucide-react";
import StartConsultationDialog from "@/components/StartConsultationDialog";
import { ageGender, fmtDate } from "@/lib/helpers";

function avatarColor(name) {
  const colors = ["bg-teal-50 text-teal-700", "bg-amber-50 text-amber-700",
                  "bg-rose-50 text-rose-700", "bg-sky-50 text-sky-700",
                  "bg-violet-50 text-violet-700", "bg-emerald-50 text-emerald-700"];
  const idx = (name || "").charCodeAt(0) % colors.length;
  return colors[idx];
}

export default function Patients() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchList = (query = q) => {
    api.get(`/patients${query ? `?q=${encodeURIComponent(query)}` : ""}`).then((r) => setList(r.data || []));
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, []);

  const visible = list.filter((p) => {
    if (filter === "all") return true;
    if (filter === "recent") {
      if (!p.last_visit) return false;
      const days = (Date.now() - new Date(p.last_visit).getTime()) / 86400000;
      return days <= 14;
    }
    if (filter === "family") return !!p.family_id;
    return true;
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Care Records</div>
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">Patients</h1>
          <p className="text-[#64748B] mt-2 max-w-xl">
            Only authorized clinic users should access patient records. Phone numbers are masked in this view.
          </p>
        </div>
        <button data-testid="patients-start-consult-btn" onClick={() => setDialogOpen(true)}
                className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2">
          <Plus className="h-4 w-4" /> Start New Consultation
        </button>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-4 flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
          <input
            data-testid="patients-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchList()}
            placeholder="Search by name, phone, or patient ID"
            className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#E2E8F0] focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none text-sm bg-[#F8FAFC] focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-[#64748B]" />
          {[
            { id: "all", label: "All" },
            { id: "recent", label: "Recent visit" },
            { id: "family", label: "Family accounts" },
          ].map((f) => (
            <button key={f.id}
                    data-testid={`filter-${f.id}`}
                    onClick={() => setFilter(f.id)}
                    className={`px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                      filter === f.id ? "bg-[#0D5C55] text-white" : "bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]"
                    }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-wider text-[#64748B] font-semibold">
            <tr>
              <th className="p-4">Patient ID</th>
              <th className="p-4">Name</th>
              <th className="p-4">Age / Gender</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Last Visit</th>
              <th className="p-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan="6" className="p-12 text-center text-sm text-[#64748B]">
                <UsersIcon className="h-6 w-6 mx-auto text-[#94A3B8] mb-2" />
                No patients yet. Click &ldquo;Start New Consultation&rdquo; above.
              </td></tr>
            )}
            {visible.map((p) => {
              const initials = `${(p.first_name || "")[0] || ""}${(p.last_name || "")[0] || ""}`.toUpperCase();
              return (
                <tr key={p.id}
                    data-testid={`patient-row-${p.patient_id}`}
                    className="border-t border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                    onClick={() => navigate(`/patients/${p.patient_id}`)}>
                  <td className="p-4 text-sm font-mono text-[#64748B]">{p.patient_id}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(p.first_name)}`}>
                        {initials}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[#0F172A]">{p.full_name}</div>
                        {p.family_id && (
                          <div className="text-[10px] tracking-[0.05em] uppercase text-[#0D5C55] mt-0.5">
                            Family · {p.relationship || "Member"}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-[#64748B]">{ageGender(p)}</td>
                  <td className="p-4 text-sm font-mono text-[#64748B]">{p.phone_masked}</td>
                  <td className="p-4 text-sm text-[#64748B]">{fmtDate(p.last_visit)}</td>
                  <td className="p-4 text-right">
                    <button className="px-3 h-9 rounded-lg border border-[#E2E8F0] hover:bg-white text-[#0F172A] text-sm font-medium"
                            data-testid={`view-patient-${p.patient_id}`}>
                      View Profile
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-[#64748B]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Phone numbers and contact details are masked in lists. Open a patient profile to see full details.
      </div>

      <StartConsultationDialog open={dialogOpen} onClose={() => { setDialogOpen(false); fetchList(); }} />
    </div>
  );
}
