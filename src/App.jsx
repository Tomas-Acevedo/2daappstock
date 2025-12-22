
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/AuthContext';
import LoginPage from '@/pages/LoginPage';
import OwnerDashboard from '@/pages/OwnerDashboard';
import BranchDashboard from '@/pages/BranchDashboard';
import ProtectedRoute from '@/components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Helmet>
          <title>Franquify ERP - Sistema de Gestión de Franquicias</title>
          <meta name="description" content="Sistema ERP completo para la gestión de franquicias con Torre de Control, gestión de sucursales y control de personal" />
        </Helmet>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </Router>
    </AuthProvider>
  );
}

export default App;
