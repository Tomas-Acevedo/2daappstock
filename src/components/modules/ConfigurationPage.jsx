import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, Trash2, Edit, CreditCard, ToggleLeft, 
  ToggleRight, ShieldCheck, Loader2, History 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const ConfigurationPage = () => {
  const { branchId } = useParams();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [branchData, setBranchData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [formData, setFormData] = useState({ name: '', discount_percentage: 0, is_active: true });

  useEffect(() => {
    if (branchId) {
      fetchConfig();
      fetchPaymentMethods();
    }
  }, [branchId]);

  const fetchConfig = async () => {
    const { data } = await supabase.from('branches').select('*').eq('id', branchId).single();
    if (data) setBranchData(data);
  };

  const fetchPaymentMethods = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').eq('branch_id', branchId).order('created_at', { ascending: true });
      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      toast({ title: "Error al cargar métodos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (field) => {
    const newValue = !branchData[field];
    try {
      const { error } = await supabase.from('branches').update({ [field]: newValue }).eq('id', branchId);
      if (error) throw error;
      setBranchData({ ...branchData, [field]: newValue });
      toast({ title: "Permiso actualizado" });
    } catch (err) {
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  const handleSavePaymentMethod = async () => {
    if (!formData.name) return;
    try {
      if (editingMethod) {
        await supabase.from('payment_methods').update({ name: formData.name, discount_percentage: formData.discount_percentage, is_active: formData.is_active }).eq('id', editingMethod.id);
      } else {
        await supabase.from('payment_methods').insert([{ branch_id: branchId, name: formData.name, discount_percentage: formData.discount_percentage, is_active: formData.is_active }]);
      }
      setIsDialogOpen(false);
      fetchPaymentMethods();
      toast({ title: "Guardado" });
    } catch (error) { toast({ title: "Error", variant: "destructive" }); }
  };

  // ✅ Nueva función para eliminar métodos de pago
  const handleDeletePaymentMethod = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este método de pago? Esta acción no se puede deshacer.")) return;
    
    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
      
      setPaymentMethods(paymentMethods.filter(m => m.id !== id));
      toast({ title: "Método de pago eliminado" });
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const openMethodDialog = (method = null) => {
    if (method) {
      setEditingMethod(method);
      setFormData({ name: method.name, discount_percentage: method.discount_percentage, is_active: method.is_active });
    } else {
      setEditingMethod(null);
      setFormData({ name: '', discount_percentage: 0, is_active: true });
    }
    setIsDialogOpen(true);
  };

  if (loading && !branchData) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración de Sucursal</h1>
        <p className="text-gray-500 text-sm">Gestiona los permisos globales y métodos de cobro.</p>
      </div>

      {/* PANEL DE PERMISOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center gap-2 bg-indigo-50/30">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h2 className="font-semibold text-gray-900">Seguridad y Accesos</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <p className="font-bold text-gray-900 text-sm md:text-base">Edición de Stock e Inventario</p>
              <p className="text-xs md:text-sm text-gray-500">Permite crear y modificar productos en la sucursal.</p>
            </div>
            <button onClick={() => togglePermission('allow_stock_edit')}>
              {branchData?.allow_stock_edit ? <ToggleRight className="w-12 h-12 text-green-600" /> : <ToggleLeft className="w-12 h-12 text-gray-300" />}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <p className="font-bold text-gray-900 text-sm md:text-base">Ver Historial de Cajas Anteriores</p>
              <p className="text-xs md:text-sm text-gray-500">Si se desactiva, la sucursal solo podrá ver y operar la caja del día de hoy.</p>
            </div>
            <button onClick={() => togglePermission('allow_cash_history')}>
              {branchData?.allow_cash_history ? <ToggleRight className="w-12 h-12 text-green-600" /> : <ToggleLeft className="w-12 h-12 text-gray-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL DE MÉTODOS DE PAGO */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Métodos de Pago</h2>
          </div>
          <Button onClick={() => openMethodDialog()} size="sm" className="bg-indigo-600">
            <Plus className="w-4 h-4 mr-2" /> Agregar
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Descuento</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paymentMethods.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{m.name}</td>
                  <td className="px-6 py-4 text-green-600 font-bold">{m.discount_percentage}%</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openMethodDialog(m)}>
                        <Edit className="w-4 h-4 text-gray-400 hover:text-indigo-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletePaymentMethod(m.id)}>
                        <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {paymentMethods.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-6 py-10 text-center text-gray-400">No hay métodos de pago configurados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>{editingMethod ? 'Editar' : 'Nuevo'} Método de Pago</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nombre</label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                placeholder="Ej: Transferencia, Efectivo..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descuento (%)</label>
              <Input 
                type="number" 
                value={formData.discount_percentage} 
                onChange={(e) => setFormData({...formData, discount_percentage: Number(e.target.value)})} 
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePaymentMethod} className="bg-indigo-600 text-white">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ConfigurationPage;