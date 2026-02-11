
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Building2, ExternalLink, Trash2, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import BranchCreationForm from '@/components/BranchCreationForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const OwnerDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [isNewBranchOpen, setIsNewBranchOpen] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchBranches();
  }, [user]);

const fetchBranches = async () => {
  if (!user) return;
  setIsLoadingBranches(true);
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('owner_id', user.id)
      .eq('is_visible', true) // <--- ESTA ES LA LÍNEA NUEVA
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    setBranches(data || []);
  } catch (error) {
    console.error("Error fetching branches:", error);
    toast({ title: "Error cargando sucursales", variant: "destructive" });
  } finally {
    setIsLoadingBranches(false);
  }
};

  const handleBranchCreated = () => {
    setIsNewBranchOpen(false);
    fetchBranches(); // Refresh the list
  };

  const handleDeleteBranch = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("¿Seguro que deseas eliminar esta sucursal? Se eliminarán todos los datos asociados (ventas, inventario, usuario).")) return;

    setDeletingId(id);
    try {
      // Use the Edge Function to ensure clean deletion of Auth User + Data
      const { data, error } = await supabase.functions.invoke('delete-branch', {
        body: { branch_id: id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setBranches(prev => prev.filter(b => b.id !== id));
      toast({ title: "Sucursal eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting branch:", error);
      toast({ title: "Error al eliminar", description: error.message || "No se pudo eliminar la sucursal", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEnterBranch = (branch) => {
    // Navigate directly using the URL structure defined in App.jsx
    navigate(`/branch/${branch.id}/sales`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Torre de Control</h1>
              <p className="text-xs text-gray-500 font-medium">ADMINISTRACIÓN CENTRAL</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:inline-block">Hola, {user?.email}</span>
            <Button variant="outline" onClick={logout} className="text-gray-600 hover:text-red-600 hover:border-red-200">
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
             <h2 className="text-2xl font-bold text-gray-900">Mis Sucursales</h2>
             <p className="text-gray-500 mt-1">Gestiona y accede a tus puntos de venta</p>
          </div>
          
          <Dialog open={isNewBranchOpen} onOpenChange={setIsNewBranchOpen}>
            <DialogTrigger asChild>
           {/*  
                  BOTÓN NUEVA SUCURSAL
           <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg transition-all">
                <Plus className="w-5 h-5 mr-2" />
              Nueva Sucursal
             </Button>*/}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-gray-900">Registrar Nueva Sucursal</DialogTitle>
                <p className="text-sm text-gray-500">Completa la información para dar de alta un nuevo punto de venta.</p>
              </DialogHeader>
              <div className="mt-4">
                <BranchCreationForm 
                  ownerId={user?.id} 
                  onSuccess={handleBranchCreated} 
                  onCancel={() => setIsNewBranchOpen(false)}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoadingBranches ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {branches.map((branch, index) => (
              <motion.div
                key={branch.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleEnterBranch(branch)}
                className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-200 p-6 cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                    onClick={(e) => handleDeleteBranch(e, branch.id)}
                    disabled={deletingId === branch.id}
                  >
                    {deletingId === branch.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-indigo-50 p-3 rounded-lg group-hover:bg-indigo-100 transition-colors">
                    <Building2 className="w-8 h-8 text-indigo-600" />
                  </div>
                  <div className="bg-gray-50 p-2 rounded-full group-hover:bg-indigo-50 transition-colors">
                     <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 mb-1">{branch.name}</h3>
                <p className="text-gray-500 text-sm mb-4 line-clamp-1 h-5">{branch.address || 'Dirección no registrada'}</p>
                
                <div className="space-y-2 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded-md">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="truncate text-xs font-medium">{branch.email}</span>
                  </div>
                </div>
                
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-xs text-gray-400 font-mono"></span>
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">Activa</span>
                </div>
              </motion.div>
            ))}
            
            {branches.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <Building2 className="w-16 h-16 mb-4 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-600">No hay sucursales</h3>
                <p className="text-sm text-gray-500 mb-6">Registra tu primera sucursal para comenzar.</p>
                <Button variant="outline" onClick={() => setIsNewBranchOpen(true)}>
                  Crear Primera Sucursal
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default OwnerDashboard;
