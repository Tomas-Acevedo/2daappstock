
import React from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Settings, ArrowLeft, Wallet, FileText, Banknote, X, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const Sidebar = ({ onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId } = useParams();

  // Determine Role safely
  const role = user?.profile?.role;

  const ownerMenuItems = [
    { icon: LayoutDashboard, label: 'Estadísticas', path: '' },
    { icon: ShoppingCart, label: 'Ventas', path: 'sales' },
    { icon: ClipboardList, label: 'Pedidos', path: 'orders' },
    { icon: Package, label: 'Inventario', path: 'inventory' },
    { icon: Wallet, label: 'Caja', path: 'caja' },
    { icon: Banknote, label: 'Gastos', path: 'expenses' },
    { icon: FileText, label: 'Logs', path: 'logs' },
    { icon: Settings, label: 'Configuración', path: 'configuration' }, // Added Configuration
  ];

  const branchMenuItems = [
    { icon: ShoppingCart, label: 'Ventas', path: 'sales' },
    { icon: ClipboardList, label: 'Pedidos', path: 'orders' },
    { icon: Package, label: 'Inventario', path: 'inventory' },
    { icon: Wallet, label: 'Caja', path: 'caja' },
  ];

  // Select menu based on role
  const menuItems = role === 'owner' ? ownerMenuItems : branchMenuItems;

  const handleNavigation = (path) => {
    navigate(`/branch/${branchId}/${path}`);
    if (onClose) onClose();
  };

  const handleReturnToTower = () => {
    navigate('/torre-control');
    if (onClose) onClose();
  };

  const isActive = (path) => {
    const currentPath = location.pathname.split('/').pop();
    // Special case for root path (dashboard)
    if (path === '') {
      return currentPath === branchId || location.pathname.endsWith(`/${branchId}/`) || location.pathname.endsWith(`/${branchId}`);
    }
    return currentPath === path;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full flex flex-col justify-between shadow-sm">
      <div className="flex flex-col h-full">
        {/* Mobile Header with Close Button */}
        <div className="lg:hidden p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <span className="font-bold text-gray-900">Menú</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-5 h-5 text-gray-500" />
          </Button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              onClick={() => handleNavigation(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group font-medium text-sm',
                isActive(item.path)
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-indigo-600'
              )}
            >
              <item.icon className={cn(
                'w-5 h-5 transition-transform group-hover:scale-105',
                isActive(item.path) ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'
              )} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer Section for Owners */}
        {role === 'owner' && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <Button 
              onClick={handleReturnToTower}
              variant="outline"
              className="w-full justify-start text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 border-gray-200 hover:border-indigo-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torre de Control
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
