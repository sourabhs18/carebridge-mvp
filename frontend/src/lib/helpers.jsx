// Shared helpers and constants for CareBridge V2

export function calcAge(dob) {
  if (!dob) return "—";
  try {
    const ms = Date.now() - new Date(dob).getTime();
    const years = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
    return years >= 0 ? years : "—";
  } catch {
    return "—";
  }
}

export function ageGender(p) {
  const a = calcAge(p?.date_of_birth);
  const g = p?.gender?.[0] || "—";
  return `${a} / ${g}`;
}

export const STATUS = {
  draft:           { label: "Draft",              cls: "bg-slate-100 text-slate-600" },
  pending_summary: { label: "Pending Summary",    cls: "bg-sky-50 text-sky-700" },
  generating:      { label: "Generating…",        cls: "bg-sky-50 text-sky-700" },
  pending_review:  { label: "Pending Review",     cls: "bg-amber-50 text-amber-700" },
  approved:        { label: "Approved",           cls: "bg-emerald-50 text-emerald-700" },
  shared:          { label: "Shared with Patient",cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  // legacy fallback (older docs)
  not_generated:   { label: "Draft",              cls: "bg-slate-100 text-slate-600" },
  ready:           { label: "Pending Review",     cls: "bg-amber-50 text-amber-700" },
};

export function statusOf(c) {
  return c?.status || c?.summary_status || "draft";
}

export function StatusBadge({ status, className = "" }) {
  const meta = STATUS[status] || STATUS.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.cls} ${className}`}>
      {meta.label}
    </span>
  );
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "00:00:00";
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export const RELATIONSHIPS = [
  "Self", "Spouse", "Son", "Daughter", "Father", "Mother", "Grandparent", "Guardian", "Other",
];

export const EVENT_LABELS = {
  patient_created: "Patient Created",
  consent_recorded: "Consent Recorded",
  consultation_started: "Consultation Started",
  transcript_generated: "Transcript Generated",
  summary_generation_started: "AI Summary Started",
  summary_generated: "AI Summary Generated",
  summary_approved: "Summary Approved",
  summary_shared: "Summary Shared with Patient",
  followup_scheduled: "Follow-up Scheduled",
};
