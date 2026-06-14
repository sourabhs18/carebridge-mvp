import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, ShieldCheck, Building2, Bell, FileText, Lock } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const { user, setUser } = useAuth();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setData(r.data));
  }, []);

  if (!data) return null;

  const upd = (path, value) => {
    const next = { ...data };
    const parts = path.split(".");
    let ref = next;
    for (let i = 0; i < parts.length - 1; i++) {
      ref[parts[i]] = { ...(ref[parts[i]] || {}) };
      ref = ref[parts[i]];
    }
    ref[parts[parts.length - 1]] = value;
    setData(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data: r } = await api.put("/settings", {
        name: data.name,
        specialty: data.specialty,
        registration_number: data.registration_number,
        clinic: data.clinic,
        notifications: data.notifications,
        consent_template: data.consent_template,
        security: data.security,
      });
      setData(r);
      setUser({ ...(user || {}), name: r.name, specialty: r.specialty });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Account</div>
          <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">Settings</h1>
          <p className="text-[#64748B] mt-2">Manage your profile, clinic, security, and notifications.</p>
        </div>
        <button onClick={save} disabled={saving}
                data-testid="save-settings-btn"
                className="h-11 px-5 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium inline-flex items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <Card title="Doctor Profile" icon={ShieldCheck}>
        <Grid>
          <Field label="Name"><input className="cb-input" value={data.name || ""} onChange={(e) => upd("name", e.target.value)} data-testid="settings-name" /></Field>
          <Field label="Email"><input className="cb-input" value={data.email || ""} disabled /></Field>
          <Field label="Specialty"><input className="cb-input" value={data.specialty || ""} onChange={(e) => upd("specialty", e.target.value)} data-testid="settings-specialty" /></Field>
          <Field label="Registration Number"><input className="cb-input" placeholder="MCI / State council number" value={data.registration_number || ""} onChange={(e) => upd("registration_number", e.target.value)} data-testid="settings-regno" /></Field>
        </Grid>
      </Card>

      <Card title="Clinic Profile" icon={Building2}>
        <Grid>
          <Field label="Clinic Name"><input className="cb-input" value={data.clinic?.name || ""} onChange={(e) => upd("clinic.name", e.target.value)} data-testid="settings-clinic-name" /></Field>
          <Field label="Phone"><input className="cb-input" value={data.clinic?.phone || ""} onChange={(e) => upd("clinic.phone", e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="Address"><input className="cb-input" value={data.clinic?.address || ""} onChange={(e) => upd("clinic.address", e.target.value)} /></Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Logo">
              <div className="h-24 rounded-lg border border-dashed border-[#E2E8F0] flex items-center justify-center text-sm text-[#64748B] bg-[#F8FAFC]">
                Logo upload — coming soon
              </div>
            </Field>
          </div>
        </Grid>
      </Card>

      <Card title="Security" icon={Lock}>
        <div className="space-y-4">
          <ToggleRow
            label="Enable Multi-Factor Authentication (MFA)"
            sub="Adds an extra verification step at login."
            checked={!!data.security?.mfa_enabled}
            onChange={(v) => upd("security.mfa_enabled", v)}
            testid="settings-mfa"
          />
          <Field label="Session Timeout (minutes)">
            <input type="number" min={5} max={240} className="cb-input"
                   value={data.security?.session_timeout || 30}
                   onChange={(e) => upd("security.session_timeout", parseInt(e.target.value || 30))} />
          </Field>
          <div className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
            <strong className="text-[#0F172A]">Role-based access:</strong> Only clinic staff with the
            &ldquo;Doctor&rdquo; role can access patient records and consultations.
          </div>
          <div className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3">
            <strong className="text-[#0F172A]">Audit log:</strong> Every access to patient records is logged. Full
            audit viewer placeholder — coming soon.
          </div>
        </div>
      </Card>

      <Card title="Consent Template" icon={FileText}>
        <textarea
          rows={5}
          value={data.consent_template || ""}
          onChange={(e) => upd("consent_template", e.target.value)}
          data-testid="settings-consent-template"
          className="w-full rounded-lg border border-[#E2E8F0] p-4 text-sm focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none bg-white"
        />
        <p className="text-xs text-[#64748B] mt-2">This text is shown to patients before recording a consultation.</p>
      </Card>

      <Card title="Notification Preferences" icon={Bell}>
        <div className="space-y-2">
          <ToggleRow label="Email summaries"
                     sub="Email patient summaries after approval."
                     checked={!!data.notifications?.email_summaries}
                     onChange={(v) => upd("notifications.email_summaries", v)}
                     testid="settings-notify-email" />
          <ToggleRow label="WhatsApp-ready summary text"
                     sub="Generate short text suitable for WhatsApp delivery."
                     checked={!!data.notifications?.whatsapp_summaries}
                     onChange={(v) => upd("notifications.whatsapp_summaries", v)}
                     testid="settings-notify-whatsapp" />
          <ToggleRow label="Follow-up reminders"
                     sub="Get reminded about due patient follow-ups."
                     checked={!!data.notifications?.followup_reminders}
                     onChange={(v) => upd("notifications.followup_reminders", v)}
                     testid="settings-notify-followup" />
        </div>
      </Card>

      <style>{`.cb-input{height:2.75rem;width:100%;border:1px solid #E2E8F0;border-radius:0.5rem;padding:0 1rem;font-size:0.875rem;background:white;outline:none;}
      .cb-input:focus{border-color:#0D5C55;box-shadow:0 0 0 3px rgba(13,92,85,0.15);}`}</style>
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <section className="mb-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-9 w-9 rounded-lg bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="font-heading text-xl font-medium text-[#0F172A]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange, testid }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0] last:border-b-0">
      <div>
        <div className="text-sm font-medium text-[#0F172A]">{label}</div>
        <div className="text-xs text-[#64748B] mt-0.5">{sub}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    </div>
  );
}
