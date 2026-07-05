// Route map — PRD Appendix A, exactly.
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Privacy from "./pages/Privacy";
import Dashboard from "./pages/Dashboard";
import Availability from "./features/availability/Availability";
import ServiceDetail from "./pages/ServiceDetail";
import Schedule from "./features/scheduling/Schedule";
import Swaps from "./features/swaps/Swaps";
import Preferences from "./pages/Preferences";
import Stats from "./pages/Stats";
import TeamLeadDashboard from "./features/scheduling/TeamLeadDashboard";
import RotaBuilder from "./features/scheduling/RotaBuilder";
import Songs from "./features/worship-planning/Songs";
import AdminDashboard from "./features/admin/AdminDashboard";
import People from "./features/admin/People";
import RolesAdmin from "./features/admin/RolesAdmin";
import Templates from "./features/admin/Templates";
import ServicesAdmin from "./features/admin/ServicesAdmin";
import Reports from "./features/admin/Reports";
import AuditLog from "./features/admin/AuditLog";
import AccessRequests from "./features/admin/AccessRequests";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/availability" element={<Availability />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/swaps" element={<Swaps />} />
        <Route path="/profile/preferences" element={<Preferences />} />
        <Route path="/stats" element={<Stats />} />
        <Route
          path="/team-lead"
          element={
            <ProtectedRoute requireTeamLead>
              <TeamLeadDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-lead/services/:id/build"
          element={
            <ProtectedRoute requireTeamLead>
              <RotaBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team-lead/songs"
          element={
            <ProtectedRoute requireTeamLead>
              <Songs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/people"
          element={
            <ProtectedRoute requireAdmin>
              <People />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <ProtectedRoute requireAdmin>
              <RolesAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/templates"
          element={
            <ProtectedRoute requireAdmin>
              <Templates />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/services"
          element={
            <ProtectedRoute requireAdmin>
              <ServicesAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requireAdmin>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit-log"
          element={
            <ProtectedRoute requireAdmin>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/access-requests"
          element={
            <ProtectedRoute requireAdmin>
              <AccessRequests />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
