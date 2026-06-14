import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Plus, Upload, Filter, Search, ShieldCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

function avatarColor(name) {
  const colors = ["bg-teal-50 text-teal-700", "bg-amber-50 text-amber-700",
                  "bg-rose-50 text-rose-700", "bg-sky-50 text-sky-700",
                  "bg-violet-50 text-violet-700", "bg-emerald-50 text-emerald-700"];
  const idx = (name || "").charCodeAt(0) % colors.length;
  return colors[idx];
}

function AddPatientModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    phone: "", email: "", address: "",
    allergies: "", conditions: "", medications: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    consent_given: false,
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.consent_given) {
      toast.error("Please confirm patient consent before saving.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/patients", form);
      toast.success(`Patient ${data.full_name} added`);
      onSaved(data);
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
         data-testid="add-patient-modal">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[#0F172A]">Add New Patient</h2>
            <p className="text-xs text-[#64748B] mt-1">Capture essentials. You can update the rest later.</p>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]" data-testid="add-patient-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold mb-3">Personal</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="First Name" required testid="patient-first-name">
                <input value={form.first_name} onChange={(e) => update("first_name", e.target.value)}
                       className="cb-input" placeholder="Rahul" />
              </Field>
              <Field label="Last Name" required testid="patient-last-name">
                <input value={form.last_name} onChange={(e) => update("last_name", e.target.value)}
                       className="cb-input" placeholder="Kumar" />
              </Field>
              <Field label="Date of Birth">
                <input type="date" value={form.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)}
                       className="cb-input" />
              </Field>
              <Field label="Gender">
                <select value={form.gender} onChange={(e) => update("gender", e.target.value)} className="cb-input">
                  <option value="">Select…</option>
                  <option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option>
                </select>
              </Field>
              <Field label="Phone Number" required testid="patient-phone">
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)}
                       className="cb-input" placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email (optional)">
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                       className="cb-input" placeholder="patient@example.in" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Address (optional)">
                  <input value={form.address} onChange={(e) => update("address", e.target.value)}
                         className="cb-input" placeholder="Street, City, PIN" />
                </Field>
              </div>
            </div>
          </section>

          <section>
            <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold mb-3">Medical</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Known Allergies">
                <input value={form.allergies} onChange={(e) => update("allergies", e.target.value)}
                       className="cb-input" placeholder="e.g. Penicillin" />
              </Field>
              <Field label="Existing Medical Conditions">
                <input value={form.conditions} onChange={(e) => update("conditions", e.target.value)}
                       className="cb-input" placeholder="e.g. Type 2 Diabetes" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Current Medications">
                  <input value={form.medications} onChange={(e) => update("medications", e.target.value)}
                         className="cb-input" placeholder="Drug, dose, frequency" />
                </Field>
              </div>
              <Field label="Emergency Contact Name">
                <input value={form.emergency_contact_name} onChange={(e) => update("emergency_contact_name", e.target.value)}
                       className="cb-input" placeholder="Family member" />
              </Field>
              <Field label="Emergency Contact Phone">
                <input value={form.emergency_contact_phone} onChange={(e) => update("emergency_contact_phone", e.target.value)}
                       className="cb-input" placeholder="+91 …" />
              </Field>
            </div>
          </section>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-start gap-3">
            <input id="cons" type="checkbox" checked={form.consent_given}
                   onChange={(e) => update("consent_given", e.target.checked)}
                   data-testid="patient-consent-checkbox"
                   className="mt-1 h-4 w-4 accent-[#0D5C55]" />
            <label htmlFor="cons" className="text-sm text-[#0F172A] leading-relaxed">
              I confirm the patient has provided consent for digital record creation.
            </label>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-6 py-4 flex items-center justify-end gap-3">
          <button onClick={onClose} className="h-11 px-5 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium"
                  data-testid="add-patient-cancel">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
                  data-testid="add-patient-save"
                  className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Patient
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, testid, children }) {
  return (
    <div data-testid={testid}>
      <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function Patients() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [q, setQ] = useState(params.get("q") || "");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);

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
    if (filter === "followup") return (p.conditions || "").length > 0;
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
        <div className="flex gap-3">
          <button data-testid="import-patient-btn"
                  className="h-11 px-5 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium inline-flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import
          </button>
          <button data-testid="add-patient-btn" onClick={() => setOpen(true)}
                  className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add New Patient
          </button>
        </div>
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
            { id: "followup", label: "Follow-up due" },
          ].map((f) => (
            <button
              key={f.id}
              data-testid={`filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                filter === f.id
                  ? "bg-[#0D5C55] text-white"
                  : "bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
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
              <tr><td colSpan="6" className="p-8 text-center text-sm text-[#64748B]">No patients found.</td></tr>
            )}
            {visible.map((p) => {
              const age = p.date_of_birth
                ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / (365.25 * 86400000))
                : "—";
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
                      <div className="text-sm font-medium text-[#0F172A]">{p.full_name}</div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-[#64748B]">{age} / {p.gender?.[0] || "—"}</td>
                  <td className="p-4 text-sm font-mono text-[#64748B]">{p.phone_masked}</td>
                  <td className="p-4 text-sm text-[#64748B]">
                    {p.last_visit ? new Date(p.last_visit).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </td>
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
        Only authorized clinic users should access patient records.
      </div>

      <AddPatientModal open={open} onClose={() => setOpen(false)} onSaved={() => fetchList()} />

      <style>{`.cb-input{height:2.75rem;width:100%;border:1px solid #E2E8F0;border-radius:0.5rem;padding:0 1rem;font-size:0.875rem;background:white;outline:none;}
      .cb-input:focus{border-color:#0D5C55;box-shadow:0 0 0 3px rgba(13,92,85,0.15);}`}</style>
    </div>
  );
}
