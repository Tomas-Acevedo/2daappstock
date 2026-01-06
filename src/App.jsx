import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider } from "@/contexts/AuthContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import PostLoginRedirect from "@/pages/PostLoginRedirect";
import OwnerDashboard from "@/pages/OwnerDashboard";
import BranchDashboard from "@/pages/BranchDashboard";
import ScanProvider from "@/scan/ScanProvider";
import GlobalScanListener from "@/scan/GlobalScanListener";
import ScanDialog from "@/scan/ScanDialog";

import OfflineBanner from "@/components/OfflineBanner";

function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <ScanProvider>
          <Router>
            <OfflineBanner />
            <GlobalScanListener />

            <Helmet>
              <title>Gestify</title>
              <meta
                name="description"
                content="Sistema ERP completo para la gestión de franquicias con Torre de Control, gestión de sucursales y control de personal"
              />
            </Helmet>

            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/post-login" element={<PostLoginRedirect />} />

              <Route
                path="/torre-control"
                element={
                  <ProtectedRoute requiredRole="owner">
                    <OwnerDashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/branch/:branchId/*"
                element={
                  <ProtectedRoute>
                    <BranchDashboard />
                  </ProtectedRoute>
                }
              />

              <Route path="/" element={<PostLoginRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            <Toaster />
            <ScanDialog />
          </Router>
        </ScanProvider>
      </OfflineProvider>
    </AuthProvider>
  );
}

export default App;
