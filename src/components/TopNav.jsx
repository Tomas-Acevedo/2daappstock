
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, LogOut, ChevronRight, LayoutGrid, Loader2, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';

const TopNav = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { branchId } = useParams();
  
  const [branchName, setBranchName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Safely extract role
  const role = user?.profile?.role;

  useEffect(() => {
    const fetchBranchName = async () => {
      if (!branchId) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('name')
          .eq('id', branchId)
          .maybeSingle();
        
        if (error) {
            console.error('Error fetching branch name:', error);
            setBranchName("Sucursal");
        } else if (data) {
          setBranchName(data.name);
        } else {
          setBranchName("Sucursal");
        }
      } catch (error) {
        console.error('Error in fetchBranchName:', error);
        setBranchName("Sucursal");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranchName();
  }, [branchId]);

  const handleReturnToControl = () => {
    if (role === 'owner') {
      navigate('/torre-control');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 h-16 shadow-sm flex-none">
      <div className="px-4 h-full">
        <div className="flex justify-between items-center h-full">
          {/* Left Side: Menu Toggle & Title */}
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Mobile Menu Button - Visible only on small screens if handler provided */}
            {onMenuClick && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden text-gray-500 -ml-2" 
                onClick={onMenuClick}
              >
                <Menu className="w-6 h-6" />
              </Button>
            )}

            <div className="bg-indigo-600 p-2 rounded-lg shrink-0">
               <Building2 className="w-5 h-5 text-white" />
            </div>
            
            <div className="flex items-center text-sm font-medium overflow-hidden">
              {role === 'owner' && (
                <div className="hidden sm:flex items-center shrink-0">
                  <button
                    onClick={handleReturnToControl}
                    className="text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    Torre de Control
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
                </div>
              )}
              <span className="text-gray-900 bg-gray-100 px-2 py-1 rounded-md flex items-center gap-2 truncate">
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                ) : (
                  <span className="truncate">{branchName || "Sucursal"}</span>
                )}
              </span>
            </div>
          </div>

          {/* Right Side: User Actions */}
          <div className="flex items-center gap-2 shrink-0">
             <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-sm font-semibold text-gray-700">{user?.email}</span>
                <span className="text-xs text-gray-500 capitalize">{role === 'owner' ? 'Administrador' : 'Punto de Venta'}</span>
             </div>
             
             {role === 'owner' && (
               <Button
                 onClick={handleReturnToControl}
                 variant="ghost"
                 size="sm"
                 className="hidden lg:flex text-gray-500 hover:text-indigo-600"
                 title="Volver a Torre de Control"
               >
                 <LayoutGrid className="w-5 h-5" />
               </Button>
             )}

            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="text-gray-600 hover:text-red-600 hover:bg-red-50 border-gray-200"
            >
              <LogOut className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Cerrar Sesión</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
