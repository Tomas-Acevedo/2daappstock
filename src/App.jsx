import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import PostLoginRedirect from "@/pages/PostLoginRedirect";
import OwnerDashboard from "@/pages/OwnerDashboard";
import BranchDashboard from "@/pages/BranchDashboard";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Helmet>
          <title>Franquify ERP - Sistema de Gestión de Franquicias</title>
          <meta
            name="description"
            content="Sistema ERP completo para la gestión de franquicias con Torre de Control, gestión de sucursales y control de personal"
          />
        </Helmet>

        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/post-login" element={<PostLoginRedirect />} />

          {/* Protected */}
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

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Catch-all (recomendado) */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>

        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
