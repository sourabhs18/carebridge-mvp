import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import api, { formatApiErrorDetail } from "@/lib/api";
import { ShieldCheck, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login"); // login | forgot

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/dashboard");
      } else if (mode === "forgot") {
        await api.post("/auth/forgot-password", { email });
        toast.success("If the email exists, a reset link has been sent.");
        setMode("login");
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-md cb-fade-up">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="h-10 w-10 rounded-xl bg-[#0D5C55] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-heading font-semibold text-xl text-[#0F172A] leading-none">
                CareBridge
              </div>
              <div className="text-[10px] tracking-[0.12em] uppercase text-[#64748B] mt-1">
                Doctor Console
              </div>
            </div>
          </div>

          <h1 className="font-heading text-4xl sm:text-5xl font-semibold text-[#0F172A] tracking-tight">
            {mode === "login" ? "Welcome back." : "Reset your password."}
          </h1>
          <p className="text-[#64748B] mt-3 text-base">
            {mode === "login"
              ? "Securely access patient consultations and AI-assisted notes."
              : "We'll send a reset link to your registered email."}
          </p>

          <form onSubmit={submit} className="mt-10 space-y-5">
            <div>
              <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Email address</label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                className="mt-2 h-12 w-full rounded-lg border border-[#E2E8F0] px-4 focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none bg-white text-base"
              />
            </div>

            {mode === "login" && (
              <div>
                <label className="text-xs tracking-[0.05em] uppercase text-[#64748B] font-semibold">Password</label>
                <div className="relative mt-2">
                  <input
                    data-testid="login-password-input"
                    type={showPwd ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 w-full rounded-lg border border-[#E2E8F0] px-4 pr-12 focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none bg-white text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A]"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-[#0D5C55] hover:bg-[#09403B] text-white font-medium transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Login" : "Send Reset Link"}
            </button>

            <div className="flex items-center justify-between text-sm">
              {mode === "login" ? (
                <button
                  type="button"
                  data-testid="login-forgot-button"
                  onClick={() => setMode("forgot")}
                  className="text-[#0D5C55] hover:text-[#09403B] font-medium"
                >
                  Forgot password?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-[#64748B] hover:text-[#0F172A] font-medium"
                >
                  ← Back to login
                </button>
              )}
            </div>
          </form>

          <div className="mt-10 p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-start gap-3">
            <Mail className="h-4 w-4 text-[#64748B] mt-0.5" />
            <p className="text-xs text-[#64748B] leading-relaxed">
              <span className="font-semibold text-[#0F172A]">Need an account?</span>{" "}
              Contact your Clinic Administrator for account access. Doctor accounts are created by the clinic.
            </p>
          </div>

          <p className="mt-8 text-xs text-[#64748B] leading-relaxed">
            CareBridge protects consultation data using secure access controls and consent-based workflows.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex relative overflow-hidden bg-[#0D5C55]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-90"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1657215374010-786fefd1dbbc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMHRlYWwlMjB0ZXh0dXJlfGVufDB8fHx8MTc4MTQ1NzU0NXww&ixlib=rb-4.1.0&q=85')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0D5C55]/85 via-[#0D5C55]/60 to-[#0F172A]/70" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white max-w-xl">
          <ShieldCheck className="h-10 w-10 mb-6 text-white/80" strokeWidth={1.4} />
          <h2 className="font-heading text-3xl font-semibold leading-tight">
            Consultations recorded with consent. Summaries delivered with care.
          </h2>
          <p className="mt-4 text-white/80 text-base leading-relaxed">
            CareBridge turns every consultation into a doctor-approved clinical note and a patient-friendly summary —
            in minutes, not hours.
          </p>
          <div className="mt-10 flex items-center gap-6 text-xs uppercase tracking-[0.16em] text-white/60">
            <span>HIPAA-aligned</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>Consent-first</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>Audit-ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
