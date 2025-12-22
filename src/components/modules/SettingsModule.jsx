
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Plus, Store, Trash2, Mail, Lock, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SettingsModule = () => {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // New Branch Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchEmail, setNewBranchEmail] = useState('');
  const [newBranchPassword, setNewBranchPassword] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error("Error fetching branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranchName || !newBranchEmail || !newBranchPassword) {
      toast({ title: "Error", description: "Complete todos los campos requeridos", variant: "destructive" });
      return;
    }

    setCreatingBranch(true);
    try {
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .insert([{
          name: newBranchName,
          address: newBranchAddress,
          owner_id: user.id,
          email: newBranchEmail,
        }])
        .select()
        .single();

      if (branchError) throw branchError;

      toast({ 
        title: "Sucursal Creada", 
        description: "El registro de la sucursal se ha creado exitosamente.",
      });

      setBranches([branchData, ...branches]);
      setIsDialogOpen(false);
      setNewBranchName('');
      setNewBranchAddress('');
      setNewBranchEmail('');
      setNewBranchPassword('');

    } catch (error) {
      console.error("Error creating branch:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreatingBranch(false);
    }
  };

  if (user?.role === 'branch') {
     return (
       <div className="p-8 text-center">
         <h2 className="text-xl font-bold text-gray-700">Acceso Restringido</h2>
         <p className="text-gray-500">Solo el dueño puede administrar la configuración global.</p>
       </div>
     )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-500 mt-2">Administra tus sucursales y permisos</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" /> Nueva Sucursal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Nueva Sucursal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBranch} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre de la Sucursal</label>
                <input 
                  className="w-full border rounded-md p-2" 
                  value={newBranchName} 
                  onChange={e => setNewBranchName(e.target.value)} 
                  placeholder="Ej: Sucursal Centro" 
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Dirección</label>
                <input 
                  className="w-full border rounded-md p-2" 
                  value={newBranchAddress} 
                  onChange={e => setNewBranchAddress(e.target.value)} 
                  placeholder="Av. Principal 123" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email de Acceso</label>
                <input 
                  type="email"
                  className="w-full border rounded-md p-2" 
                  value={newBranchEmail} 
                  onChange={e => setNewBranchEmail(e.target.value)} 
                  placeholder="centro@franquicia.com" 
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contraseña Inicial</label>
                <input 
                  type="password"
                  className="w-full border rounded-md p-2" 
                  value={newBranchPassword} 
                  onChange={e => setNewBranchPassword(e.target.value)} 
                  placeholder="********" 
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-4" disabled={creatingBranch}>
                {creatingBranch ? <Loader className="animate-spin w-4 h-4" /> : "Crear Sucursal"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Store className="w-5 h-5 text-indigo-600" /> Sucursales Activas
          </h2>
          
          {loading ? (
             <div className="text-center py-8 text-gray-400">Cargando sucursales...</div>
          ) : branches.length === 0 ? (
             <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
               <p className="text-gray-500">No hay sucursales registradas</p>
             </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {branches.map(branch => (
                <motion.div 
                  key={branch.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 border rounded-lg hover:border-indigo-200 transition-colors bg-gray-50/50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-gray-800">{branch.name}</h3>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                     <p className="flex items-center gap-2">
                       <Mail className="w-3 h-3" /> {branch.email}
                     </p>
                     {branch.address && (
                       <p className="opacity-80">{branch.address}</p>
                     )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default SettingsModule;
