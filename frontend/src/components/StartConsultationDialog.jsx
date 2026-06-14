import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Search, X, Plus, UserPlus, Loader2, Users } from "lucide-react";
import { calcAge, RELATIONSHIPS } from "@/lib/helpers";
import { toast } from "sonner";

/**
 * Search-First Start Consultation Dialog.
 * Step 1: Search by phone or name
 * Step 2a: Show matching patients (incl. family members) -> select -> create consultation
 * Step 2b: No match -> Quick Add Patient (4 fields + consent) -> create consultation
 */
export default function StartConsultationDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [step, setStep] = useState("search"); // search | create
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  // Quick add form
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    phone: "", consent_given: false,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("search"); setQ(""); setResults([]); setSearched(false);
      setForm({ first_name: "", last_name: "", date_of_birth: "", gender: "", phone: "", consent_given: false });
    }
  }, [open]);

  if (!open) return null;

  const runSearch = async () => {
    if (q.trim().length < 2) {
      toast.error("Type at least 2 characters");
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get(`/search/patients?q=${encodeURIComponent(q.trim())}`);
      setResults(data || []);
      setSearched(true);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSearching(false);
    }
  };

  const startWith = async (patient_id) => {
    try {
      const { data } = await api.post("/consultations", { patient_id });
      onClose();
      navigate(`/consultation/${data.consultation_id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not start consultation");
    }
  };

  const goToCreate = () => {
    // Pre-fill phone if query looked like a number
    const digits = q.replace(/\D/g, "");
    setForm((f) => ({
      ...f,
      phone: digits ? (digits.startsWith("91") ? `+${digits}` : `+91${digits}`) : "",
      first_name: /^[a-z]/i.test(q) ? q.trim().split(" ")[0] : "",
      last_name: /^[a-z]/i.test(q) ? (q.trim().split(" ").slice(1).join(" ") || "") : "",
    }));
    setStep("create");
  };

  const createAndStart = async () => {
    if (!form.consent_given) {
      toast.error("Please confirm patient consent.");
      return;
    }
    if (!form.first_name || !form.last_name || !form.phone) {
      toast.error("Name and mobile number are required.");
      return;
    }
    setCreating(true);
    try {
      const { data: patient } = await api.post("/patients", {
        first_name: form.first_name,
        last_name: form.last_name,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        phone: form.phone,
        consent_given: form.consent_given,
      });
      const { data: c } = await api.post("/consultations", { patient_id: patient.patient_id });
      toast.success(`Patient ${patient.full_name} created. Consultation started.`);
      onClose();
      navigate(`/consultation/${c.consultation_id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         data-testid="start-consultation-dialog">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[#0F172A]">
              {step === "search" ? "Start New Consultation" : "Quick Add Patient"}
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              {step === "search"
                ? "Search the patient by phone or name. We'll prevent duplicates."
                : "Add the essentials. You can fill in medical history later."}
            </p>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]" data-testid="dialog-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === "search" ? (
          <div className="p-6 space-y-5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <input
                  data-testid="search-patient-input"
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Mobile number or patient name"
                  className="w-full h-12 pl-10 pr-4 rounded-lg border border-[#E2E8F0] focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none"
                />
              </div>
              <button onClick={runSearch} disabled={searching}
                      data-testid="search-patient-submit"
                      className="h-12 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>

            {searched && (
              <div className="space-y-3">
                {results.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center bg-[#F8FAFC]">
                    <Users className="h-6 w-6 mx-auto text-[#94A3B8] mb-2" />
                    <div className="font-medium text-[#0F172A]">No matching patient found</div>
                    <div className="text-xs text-[#64748B] mt-1">Create a new patient record to proceed.</div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
                      {results.length} matching {results.length === 1 ? "patient" : "patients"}
                    </div>
                    <div className="space-y-2">
                      {results.map((p) => (
                        <div key={p.id}
                             data-testid={`search-result-${p.patient_id}`}
                             className="flex items-center justify-between rounded-xl border border-[#E2E8F0] p-4 hover:border-[#0D5C55] hover:bg-[#F8FAFC] transition-colors">
                          <div>
                            <div className="font-medium text-[#0F172A]">{p.full_name}</div>
                            <div className="text-xs text-[#64748B] mt-0.5 flex items-center gap-3 font-mono">
                              <span>{p.patient_id}</span>
                              <span>{calcAge(p.date_of_birth)} / {p.gender?.[0] || "—"}</span>
                              <span>{p.phone_masked}</span>
                              {p.family_id && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#0D5C55]/10 text-[#0D5C55]">
                                  Family
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => navigate(`/patients/${p.patient_id}`)}
                                    className="h-9 px-3 rounded-lg border border-[#E2E8F0] text-sm font-medium hover:bg-white text-[#0F172A]">
                              Open Profile
                            </button>
                            <button onClick={() => startWith(p.patient_id)}
                                    data-testid={`search-start-${p.patient_id}`}
                                    className="h-9 px-3 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white text-sm font-medium">
                              Start
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button onClick={goToCreate}
                        data-testid="continue-create-new"
                        className="w-full h-12 rounded-lg border-2 border-dashed border-[#E2E8F0] hover:border-[#0D5C55] hover:bg-[#F8FAFC] text-[#0D5C55] font-medium inline-flex items-center justify-center gap-2">
                  <UserPlus className="h-4 w-4" /> Continue Creating New Patient
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="First Name" required>
                <input className="cb-i" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                       data-testid="quick-first-name" placeholder="Rahul" />
              </Field>
              <Field label="Last Name" required>
                <input className="cb-i" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                       data-testid="quick-last-name" placeholder="Kumar" />
              </Field>
              <Field label="Mobile Number" required>
                <input className="cb-i" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                       data-testid="quick-phone" placeholder="+91 98765 43210" />
              </Field>
              <Field label="Date of Birth">
                <input type="date" className="cb-i" value={form.date_of_birth}
                       onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                       data-testid="quick-dob" />
              </Field>
              <Field label="Gender">
                <select className="cb-i" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}
                        data-testid="quick-gender">
                  <option value="">Select…</option>
                  <option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option>
                </select>
              </Field>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-start gap-3">
              <input id="qcons" type="checkbox" checked={form.consent_given}
                     onChange={(e) => setForm({ ...form, consent_given: e.target.checked })}
                     data-testid="quick-consent" className="mt-1 h-4 w-4 accent-[#0D5C55]" />
              <label htmlFor="qcons" className="text-sm text-[#0F172A] leading-relaxed">
                I confirm the patient has provided consent for digital record creation.
              </label>
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep("search")}
                      className="h-11 px-5 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium">
                ← Back to search
              </button>
              <div className="flex gap-2">
                <button onClick={onClose}
                        className="h-11 px-5 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium">
                  Cancel
                </button>
                <button onClick={createAndStart} disabled={creating}
                        data-testid="quick-create-submit"
                        className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Plus className="h-4 w-4" /> Create Patient & Start
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`.cb-i{height:2.75rem;width:100%;border:1px solid #E2E8F0;border-radius:0.5rem;padding:0 1rem;font-size:0.875rem;background:white;outline:none;}
        .cb-i:focus{border-color:#0D5C55;box-shadow:0 0 0 3px rgba(13,92,85,0.15);}`}</style>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
