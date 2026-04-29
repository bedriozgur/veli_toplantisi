import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireFrontDesk } from "./guards";
import LoginPage from "../pages/LoginPage";
import UnauthorizedPage from "../pages/UnauthorizedPage";
import AdminLayout from "../pages/admin/AdminLayout";
import AdminDashboard from "../pages/admin/AdminDashboard";
import AdminMeetings from "../pages/admin/AdminMeetings";
import AdminMeetingDetail from "../pages/admin/AdminMeetingDetail";
import AdminUsers from "../pages/admin/AdminUsers";
import FrontDeskLayout from "../pages/frontdesk/FrontDeskLayout";
import FrontDeskHome from "../pages/frontdesk/FrontDeskHome";
import ParentCodeEntry from "../pages/parent/ParentCodeEntry";
import ParentMeetingView from "../pages/parent/ParentMeetingView";

export default function AppRouter() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
