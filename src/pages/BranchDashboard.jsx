import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import TopNav from '@/components/TopNav';
import Sidebar from '@/components/Sidebar';
import DashboardHome from '@/components/modules/DashboardHome';
import SalesModule from '@/components/modules/SalesModule';
import InventoryModule from '@/components/modules/InventoryModule';
import ReportsModule from '@/components/modules/ReportsModule';
import CashRegister from '@/components/modules/CashRegister';
import LogsPage from '@/components/modules/LogsPage';
import ExpensesPage from '@/components/modules/ExpensesPage';
import SalesHistoryPage from '@/components/modules/SalesHistoryPage';
import OrdersPage from '@/components/modules/OrdersPage';
import ConfigurationPage from '@/components/modules/ConfigurationPage';
import JornadasPage from '@/components/modules/JornadasPage'; // ✅ Importación de la nueva página
import ProtectedRoute from '@/components/ProtectedRoute';

const BranchDashboard = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <TopNav onMenuClick={() => setIsMobileMenuOpen(true)} />
      
      <div className="flex flex-1 relative overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block h-full shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Sidebar (Drawer) */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              />
              
              {/* Slide-in Menu */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden h-full shadow-2xl"
              >
                <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto w-full p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/sales" element={<SalesModule />} />
              <Route path="/sales-history" element={<SalesHistoryPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/inventory" element={<InventoryModule />} />
              <Route path="/caja" element={<CashRegister />} />
              <Route path="/reports" element={<ReportsModule />} />
              
              {/* ✅ Nueva Ruta de Jornadas */}
              <Route path="/jornadas" element={<JornadasPage />} />

              {/* Owner Only Routes */}
              <Route 
                path="/logs" 
                element={
                  <ProtectedRoute requiredRole="owner">
                    <LogsPage />
                  </ProtectedRoute>
                } 
              />
               <Route 
                path="/expenses" 
                element={
                  <ProtectedRoute requiredRole="owner">
                    <ExpensesPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/configuration" 
                element={
                  <ProtectedRoute requiredRole="owner">
                    <ConfigurationPage />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BranchDashboard;