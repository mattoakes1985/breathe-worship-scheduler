// App shell: bottom tab bar on mobile, sidebar on desktop. Dark mode first-class (§10.2).
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  Home,
  LogOut,
  Moon,
  Music,
  Repeat,
  Settings,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Modal } from "./ui";
import { formatDateTime } from "@/lib/format";

function useDarkMode() {
  const [dark, setDark] = useState(
    () =>
      document.documentElement.classList.contains("dark") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/availability", label: "Availability", icon: CalendarCheck },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/swaps", label: "Swaps", icon: Repeat },
  { to: "/stats", label: "My stats", icon: BarChart3 },
];

export default function Layout() {
  const { profile, isAdmin, isTeamLead, signOut } = useAuth();
  const { dark, toggle } = useDarkMode();
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    enabled: notifOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  async function markAllRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  const sideLinks = [
    ...tabs,
    ...(isTeamLead ? [{ to: "/team-lead", label: "Team Lead", icon: Users, end: false }] : []),
    ...(isTeamLead || isAdmin ? [{ to: "/team-lead/songs", label: "Songs", icon: Music, end: false }] : []),
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield, end: false }] : []),
    { to: "/profile/preferences", label: "Preferences", icon: Settings, end: false },
  ];

  return (
    <div className="min-h-dvh flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r glass-bar p-4 gap-1 sticky top-0 h-dvh">
        <img
          src={dark ? "/brand/breathe-all-white.png" : "/brand/breathe-black-colour-cropped.png"}
          alt="Breathe Worship"
          className="h-14 object-contain object-left mb-4"
        />
        {sideLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive ? "bg-accent-soft text-accent-strong" : "text-soft hover:bg-raised"
              }`
            }
          >
            <Icon size={18} /> {label}
          </NavLink>
        ))}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-line">
          <span className="text-sm text-soft truncate">{profile?.preferred_name || profile?.full_name}</span>
          <div className="flex gap-1">
            <button className="btn-ghost !min-h-[36px] px-2" onClick={toggle} aria-label="Toggle dark mode">
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              className="btn-ghost !min-h-[36px] px-2"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between glass-bar border-b px-4 h-14">
          <img
            src={dark ? "/brand/breathe-all-white.png" : "/brand/breathe-black-colour-cropped.png"}
            alt="Breathe Worship"
            className="h-8 object-contain"
          />
          <div className="flex items-center gap-1">
            <button className="btn-ghost !min-h-[40px] px-2 relative" onClick={() => setNotifOpen(true)} aria-label="Notifications">
              <Bell size={19} />
              {(unread ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
            <button className="btn-ghost !min-h-[40px] px-2" onClick={toggle} aria-label="Toggle dark mode">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="btn-ghost !min-h-[40px] px-2"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Desktop notifications button */}
        <div className="hidden md:flex justify-end px-6 pt-4">
          <button className="btn-ghost relative" onClick={() => setNotifOpen(true)} aria-label="Notifications">
            <Bell size={18} />
            {(unread ?? 0) > 0 && (
              <span className="absolute top-1 right-1 bg-danger text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
        </div>

        <main className="flex-1 px-4 md:px-6 py-4 pb-24 md:pb-8 max-w-4xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile bottom tab bar — 44px+ targets (§8.2) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-bar border-t flex pb-[env(safe-area-inset-bottom)]">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] font-semibold ${
                  isActive ? "text-accent-strong" : "text-faint"
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="Notifications">
        {(notifications ?? []).length === 0 ? (
          <p className="text-soft text-sm py-6 text-center">Nothing here yet — you're all caught up.</p>
        ) : (
          <>
            <button className="btn-ghost text-xs mb-2" onClick={markAllRead}>
              Mark all as read
            </button>
            <ul className="divide-y divide-line">
              {(notifications ?? []).map((n) => (
                <li key={n.id} className={`py-3 ${n.is_read ? "opacity-60" : ""}`}>
                  <p className="font-semibold text-sm">{n.title}</p>
                  {n.body && <p className="text-soft text-sm">{n.body}</p>}
                  <p className="text-faint text-xs mt-1">{formatDateTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  );
}
