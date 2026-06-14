import { CalendarDays, Clock } from "lucide-react";

const APPTS = [
  { day: "Today", time: "09:30 AM", name: "Rahul Kumar", reason: "Diabetes follow-up" },
  { day: "Today", time: "10:15 AM", name: "Priya Sharma", reason: "Migraine review" },
  { day: "Today", time: "11:00 AM", name: "Vikram Singh", reason: "BP check-up" },
  { day: "Today", time: "12:30 PM", name: "Ananya Iyer", reason: "Asthma flare" },
  { day: "Tomorrow", time: "09:00 AM", name: "Mohammed Khan", reason: "Anxiety review" },
  { day: "Tomorrow", time: "11:30 AM", name: "New patient — Reema Das", reason: "Initial consult" },
];

export default function Appointments() {
  return (
    <div>
      <div className="mb-8">
        <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Schedule</div>
        <h1 className="font-heading text-4xl md:text-5xl font-semibold text-[#0F172A] mt-1 tracking-tight">Appointments</h1>
        <p className="text-[#64748B] mt-2">A snapshot of your upcoming consultations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {APPTS.map((a, i) => (
          <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-[#F8FAFC] flex items-center justify-center text-[#0D5C55]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">{a.day}</div>
              <div className="text-base font-medium text-[#0F172A] mt-0.5">{a.name}</div>
              <div className="text-sm text-[#64748B] mt-0.5">{a.reason}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-[#0F172A] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#94A3B8]" /> {a.time}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
