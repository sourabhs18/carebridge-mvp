import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { X, Plus, Loader2 } from "lucide-react";
import { RELATIONSHIPS } from "@/lib/helpers";
import { toast } from "sonner";

export default function AddFamilyMemberModal({ open, familyId, onClose, onAdded }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", date_of_birth: "", gender: "",
    relationship: "Spouse", consent_given: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm({ first_name: "", last_name: "", date_of_birth: "", gender: "",
                relationship: "Spouse", consent_given: false });
    }
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (!form.consent_given) return toast.error("Please confirm consent.");
    if (!form.first_name || !form.last_name) return toast.error("Name is required.");
    setSaving(true);
    try {
      const { data } = await api.post(`/family-accounts/${familyId}/members`, form);
      toast.success(`${data.full_name} added to family`);
      onAdded?.(data);
      onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         data-testid="add-family-modal">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
        <div className="border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold text-[#0F172A]">Add Family Member</h2>
            <p className="text-xs text-[#64748B] mt-1">Medical records remain separate. Only the family link is shared.</p>
          </div>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="First Name" required>
            <input className="cb-i" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                   data-testid="fam-first-name" placeholder="Priya" />
          </Field>
          <Field label="Last Name" required>
            <input className="cb-i" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                   data-testid="fam-last-name" placeholder="Sharma" />
          </Field>
          <Field label="Date of Birth">
            <input type="date" className="cb-i" value={form.date_of_birth}
                   onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </Field>
          <Field label="Gender">
            <select className="cb-i" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select…</option>
              <option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Relationship" required>
              <select className="cb-i" value={form.relationship}
                      onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                      data-testid="fam-relationship">
                {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="px-6 pb-2">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-start gap-3">
            <input id="famc" type="checkbox" checked={form.consent_given}
                   onChange={(e) => setForm({ ...form, consent_given: e.target.checked })}
                   data-testid="fam-consent" className="mt-1 h-4 w-4 accent-[#0D5C55]" />
            <label htmlFor="famc" className="text-sm text-[#0F172A] leading-relaxed">
              I confirm consent has been received for this family member&apos;s digital record.
            </label>
          </div>
        </div>

        <div className="border-t border-[#E2E8F0] px-6 py-4 flex justify-end gap-2">
          <button onClick={onClose} className="h-11 px-5 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC] font-medium">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
                  data-testid="fam-save"
                  className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} <Plus className="h-4 w-4" /> Save Family Member
          </button>
        </div>

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
