import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import PatientProfile from "@/pages/PatientProfile";
import StartConsultation from "@/pages/StartConsultation";
import SummaryReview from "@/pages/SummaryReview";
import Settings from "@/pages/Settings";
import Consultations from "@/pages/Consultations";
import Appointments from "@/pages/Appointments";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:patientId" element={<PatientProfile />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="consultation/new/:patientId" element={<StartConsultation />} />
            <Route path="consultation/:cid" element={<StartConsultation />} />
            <Route path="consultation/:cid/review" element={<SummaryReview />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
