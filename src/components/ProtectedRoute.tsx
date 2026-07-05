// UX-layer route guard only — RLS enforces real access (PRD §8.3).
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "./ui";

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireTeamLead = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
  requireTeamLead?: boolean;
}) {
  const { session, loading, isAdmin, isTeamLead } = useAuth();
  if (loading) return <Spinner label="Signing you in…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  if (requireTeamLead && !isTeamLead && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
