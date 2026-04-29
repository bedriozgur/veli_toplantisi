import React, { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireFrontDesk } from "./guards";
import { useLanguage } from "../contexts/LanguageContext";

const LoginPage = lazy(() => import("../pages/LoginPage"));
const UnauthorizedPage = lazy(() => import("../pages/UnauthorizedPage"));
const AdminLayout = lazy(() => import("../pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const AdminMeetings = lazy(() => import("../pages/admin/AdminMeetings"));
const AdminMeetingDetail = lazy(() => import("../pages/admin/AdminMeetingDetail"));
const AdminUsers = lazy(() => import("../pages/admin/AdminUsers"));
const FrontDeskLayout = lazy(() => import("../pages/frontdesk/FrontDeskLayout"));
const FrontDeskHome = lazy(() => import("../pages/frontdesk/FrontDeskHome"));
const ParentCodeEntry = lazy(() => import("../pages/parent/ParentCodeEntry"));
const ParentMeetingView = lazy(() => import("../pages/parent/ParentMeetingView"));

export default function AppRouter() {
  const { t } = useLanguage();
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen label={t("app.loading")} />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route path="/parent" element={<ParentCodeEntry />} />
          <Route path="/parent/:code" element={<ParentMeetingView />} />

          <Route
            path="/frontdesk/*"
            element={
              <RequireFrontDesk>
                <FrontDeskLayout />
              </RequireFrontDesk>
            }
          >
            <Route index element={<FrontDeskHome />} />
          </Route>

          <Route
            path="/admin/*"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="meetings" element={<AdminMeetings />} />
            <Route path="meetings/:meetingId" element={<AdminMeetingDetail />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          <Route path="/" element={<Navigate to="/parent" replace />} />
          <Route path="*" element={<Navigate to="/parent" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function LoadingScreen({ label }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.card}>{label}</div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f1e8",
    color: "#2b2b2b",
  },
  card: {
    padding: "1rem 1.25rem",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    fontFamily: "system-ui, sans-serif",
  },
};
