import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, Settings as Cog,
  LogOut, Search, ChevronDown, ShieldCheck, Smartphone,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard" },
  { to: "/patients", icon: Users, label: "Patients", testid: "nav-patients" },
  { to: "/consultations", icon: Stethoscope, label: "Consultations", testid: "nav-consultations" },
  { to: "/appointments", icon: CalendarDays, label: "Appointments", testid: "nav-appointments" },
  { to: "/settings", icon: Cog, label: "Settings", testid: "nav-settings" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const initials = (user?.name || "Dr")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onSearch = (e) => {
    e.preventDefault();
    if (search.trim()) navigate(`/patients?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar */}
      <aside
        data-testid="app-sidebar"
        className="w-64 hidden md:flex flex-col border-r border-[#E2E8F0] bg-[#F8FAFC]"
      >
        <div className="px-6 py-6 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#0D5C55] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-heading font-semibold text-lg text-[#0F172A] leading-none">
                CareBridge
              </div>
              <div className="text-[10px] tracking-[0.12em] uppercase text-[#64748B] mt-1">
                Doctor Console
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label, testid }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white text-[#0D5C55] shadow-sm border border-[#E2E8F0]"
                    : "text-[#64748B] hover:bg-white hover:text-[#0F172A]"
                }`
              }
            >
              <Icon className="h-4 w-4" strokeWidth={1.6} />
              {label}
            </NavLink>
          ))}

          <div className="pt-3 mt-3 border-t border-[#E2E8F0]">
            <div className="text-[10px] tracking-[0.12em] uppercase text-[#94A3B8] font-semibold px-3 mb-2">
              Roadmap
            </div>
            <div
              data-testid="nav-patient-app-soon"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#94A3B8] cursor-not-allowed"
              aria-disabled="true"
            >
              <Smartphone className="h-4 w-4" strokeWidth={1.6} />
              Patient App
              <span className="ml-auto text-[9px] tracking-[0.08em] uppercase px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                Soon
              </span>
            </div>
          </div>
        </nav>

        <button
          data-testid="nav-logout"
          onClick={logout}
          className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#64748B] hover:bg-white hover:text-[#0F172A] transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.6} /> Logout
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          data-testid="app-header"
          className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-4"
        >
          <form onSubmit={onSearch} className="flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
              <input
                data-testid="global-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient by name, phone, or patient ID"
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] focus:bg-white focus:ring-2 focus:ring-[#0D5C55]/30 focus:border-[#0D5C55] outline-none text-sm placeholder:text-[#94A3B8]"
              />
            </div>
          </form>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="doctor-profile-dropdown"
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-[#0D5C55] text-white flex items-center justify-center font-heading font-semibold text-sm">
                  {initials}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-medium text-[#0F172A] leading-none">
                    {user?.name || "Doctor"}
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">{user?.specialty || ""}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#94A3B8]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={logout} data-testid="dropdown-logout">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-6 md:p-8 cb-fade-up">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
