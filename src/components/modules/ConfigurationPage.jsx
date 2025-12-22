
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit, Save, CreditCard, ToggleLeft, ToggleRight, X } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    discount_percentage: 0,
    is_active: true
  });

  useEffect(() => {
    fetchPaymentMethods();
  }, [branchId]);

  const fetchPaymentMethods = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error(error);
      toast({ title: "Error al cargar métodos de pago", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    try {
      if (editingMethod) {
        // Update
        const { error } = await supabase
          .from('payment_methods')
          .update({
            name: formData.name,
            discount_percentage: formData.discount_percentage,
            is_active: formData.is_active,
            updated_at: new Date()
          })
          .eq('id', editingMethod.id);
        
        if (error) throw error;
        toast({ title: "Método actualizado" });
      } else {
        // Create
        const { error } = await supabase
          .from('payment_methods')
          .insert([{
            branch_id: branchId,
            name: formData.name,
            discount_percentage: formData.discount_percentage,
            is_active: formData.is_active
          }]);

        if (error) throw error;
        toast({ title: "Método creado" });
      }

      setIsDialogOpen(false);
      setEditingMethod(null);
      setFormData({ name: '', discount_percentage: 0, is_active: true });
      fetchPaymentMethods();
    } catch (error) {
      console.error(error);
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este método de pago?")) return;

    try {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id);
      if (error) throw error;
      
      setPaymentMethods(prev => prev.filter(m => m.id !== id));
      toast({ title: "Método eliminado" });
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const openDialog = (method = null) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        name: method.name,
        discount_percentage: method.discount_percentage,
        is_active: method.is_active
      });
    } else {
      setEditingMethod(null);
      setFormData({ name: '', discount_percentage: 0, is_active: true });
    }
    setIsDialogOpen(true);
  };

  const toggleActive = async (method) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: !method.is_active })
        .eq('id', method.id);

      if (error) throw error;
      
      setPaymentMethods(prev => prev.map(m => m.id === method.id ? { ...m, is_active: !m.is_active } : m));
    } catch (error) {
      toast({ title: "Error al actualizar estado", variant: "destructive" });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración de Sucursal</h1>
          <p className="text-gray-500">Administra los métodos de pago y preferencias.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Métodos de Pago</h2>
          </div>
          <Button onClick={() => openDialog()} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Agregar Método
          </Button>
        </div>

        <div className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Cargando configuración...</div>
          ) : paymentMethods.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No hay métodos de pago configurados.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Nombre</th>
                  <th className="px-6 py-3">Descuento (%)</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paymentMethods.map((method) => (
                  <tr key={method.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-medium text-gray-900">{method.name}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {method.discount_percentage > 0 ? (
                        <span className="text-green-600 font-bold">-{method.discount_percentage}%</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleActive(method)} className="focus:outline-none">
                        {method.is_active ? (
                          <div className="flex items-center text-green-600 gap-1">
                            <ToggleRight className="w-6 h-6" /> <span className="text-xs font-bold">Activo</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-gray-400 gap-1">
                            <ToggleLeft className="w-6 h-6" /> <span className="text-xs">Inactivo</span>
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openDialog(method)}>
                          <Edit className="w-4 h-4 text-gray-500 hover:text-indigo-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(method.id)}>
                          <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMethod ? 'Editar Método' : 'Nuevo Método de Pago'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nombre del Método</label>
              <Input 
                placeholder="Ej: Efectivo, Tarjeta Visa, MercadoPago"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Descuento Automático (%)</label>
              <Input 
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={formData.discount_percentage}
                onChange={(e) => setFormData({...formData, discount_percentage: Number(e.target.value)})}
              />
              <p className="text-xs text-gray-500">Este porcentaje se descontará automáticamente al seleccionar este método en el POS.</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">Activo para ventas</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ConfigurationPage;
