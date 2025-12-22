
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // 1. Not logged in -> Redirect to Login
  if (!user) {
    console.log(`ProtectedRoute: Access denied to ${location.pathname} - User not authenticated`);
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 2. Role Check (Fix: Check user.profile.role, not user.loginMode)
  if (requiredRole) {
    const userRole = user.profile?.role;
    
    if (userRole !== requiredRole) {
      console.warn(`ProtectedRoute: Role Mismatch. Required: ${requiredRole}, Found: ${userRole}`);
      // Optional: Redirect to a generic "Unauthorized" page or back to their allowed dashboard
      // For now, bounce back to login to prevent unauthorized viewing
      return <Navigate to="/login" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
