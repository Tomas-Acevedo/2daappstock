import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, Trash2, Edit, CreditCard, ToggleLeft, 
  ToggleRight, ShieldCheck, Loader2, Image as ImageIcon, Upload, Users, Clock
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
  const fileInputRef = useRef(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branchData, setBranchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [formData, setFormData] = useState({ name: '', discount_percentage: 0, is_active: true });

  const [isEmpDialogOpen, setIsEmpDialogOpen] = useState(false);
  const [empName, setEmpName] = useState('');

  useEffect(() => {
    if (branchId) {
      fetchConfig();
      fetchPaymentMethods();
      fetchEmployees();
    }
  }, [branchId]);

  const fetchConfig = async () => {
    const { data } = await supabase.from('branches').select('*').eq('id', branchId).single();
    if (data) setBranchData(data);
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', branchId).order('created_at', { ascending: true });
    setPaymentMethods(data || []);
    setLoading(false);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').eq('branch_id', branchId).eq('is_active', true);
    setEmployees(data || []);
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${branchId}-${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      await supabase.storage.from('branch-assets').upload(filePath, file);
      const { data: { publicUrl } } = supabase.storage.from('branch-assets').getPublicUrl(filePath);
      await supabase.from('branches').update({ logo_url: publicUrl }).eq('id', branchId);
      setBranchData({ ...branchData, logo_url: publicUrl });
      toast({ title: "Logo actualizado" });
    } catch (error) { toast({ title: "Error al subir logo", variant: "destructive" }); }
    finally { setUploadingLogo(false); }
  };

  const togglePermission = async (field) => {
    const newValue = !branchData[field];
    try {
      const { error } = await supabase.from('branches').update({ [field]: newValue }).eq('id', branchId);
      if (error) throw error;
      
      setBranchData({ ...branchData, [field]: newValue });
      
      // NOTIFICAR AL SIDEBAR PARA ACTUALIZACIÓN EN TIEMPO REAL
      window.dispatchEvent(new CustomEvent('branch-config-updated', { 
        detail: { field, value: newValue } 
      }));

      toast({ title: "Configuración actualizada" });
    } catch (err) {
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  const handleSavePaymentMethod = async () => {
    if (editingMethod) {
      await supabase.from('payment_methods').update(formData).eq('id', editingMethod.id);
    } else {
      await supabase.from('payment_methods').insert([{ ...formData, branch_id: branchId }]);
    }
    setIsDialogOpen(false);
    fetchPaymentMethods();
    toast({ title: "Guardado" });
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

  const handleAddEmployee = async () => {
    if (employees.length >= 3) {
      toast({ title: "Límite alcanzado", description: "Máximo 3 empleados por sucursal", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from('employees').insert([{ name: empName, branch_id: branchId }]);
    if (!error) {
      setEmpName('');
      setIsEmpDialogOpen(false);
      fetchEmployees();
      toast({ title: "Empleado añadido" });
    }
  };

  const deleteEmployee = async (id) => {
    if (!confirm("¿Eliminar empleado?")) return;
    await supabase.from('employees').update({ is_active: false }).eq('id', id);
    fetchEmployees();
  };

  if (loading && !branchData) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-5xl mx-auto pb-10 px-4">
      <h1 className="text-2xl font-bold text-gray-900">Configuración de Sucursal</h1>

      {/* Identidad */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="w-32 h-32 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden bg-gray-50">
            {branchData?.logo_url ? <img src={branchData.logo_url} className="w-full h-full object-contain" /> : <ImageIcon className="w-10 h-10 text-gray-300" />}
          </div>
          <div className="space-y-3">
            <h3 className="font-bold text-gray-900">Logo de la Sucursal</h3>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleLogoUpload} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>Cambiar Logo</Button>
          </div>
        </div>
      </div>

      {/* Permisos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" /> Permisos y Funciones
        </div>
        <div className="p-6 space-y-4">
          {[
            { id: 'allow_stock_edit', label: 'Edición de Stock', desc: 'Permite modificar productos.' },
            { id: 'allow_cash_history', label: 'Historial de Cajas', desc: 'Ver cierres anteriores.' },
            { id: 'allow_sales_edit_delete', label: 'Modificar Ventas', desc: 'Editar/Borrar historial.' },
            { id: 'allow_jornadas', label: 'Activar Jornadas', desc: 'Habilita el control de asistencia.' }
          ].map(p => (
            <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
              <div>
                <p className="font-bold text-sm text-gray-900">{p.label}</p>
                <p className="text-xs text-gray-500">{p.desc}</p>
              </div>
              <button onClick={() => togglePermission(p.id)}>
                {branchData?.[p.id] ? <ToggleRight className="w-10 h-10 text-green-600" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Gestión de Empleados */}
      {branchData?.allow_jornadas && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
            <div className="flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /><h2 className="font-bold text-gray-900">Empleados ({employees.length}/3)</h2></div>
            <Button size="sm" onClick={() => setIsEmpDialogOpen(true)} disabled={employees.length >= 3}>Añadir</Button>
          </div>
          <div className="p-4 space-y-2">
            {employees.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay empleados registrados.</p>}
            {employees.map(emp => (
              <div key={emp.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50">
                <span className="font-medium text-gray-700">{emp.name}</span>
                <Button variant="ghost" size="sm" onClick={() => deleteEmployee(emp.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Métodos de Pago */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-600" /><h2 className="font-bold text-gray-900">Métodos de Pago</h2></div>
          <Button size="sm" onClick={() => openMethodDialog()}>Agregar</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-medium"><tr><th className="px-6 py-3 text-left">Nombre</th><th className="px-6 py-3 text-left">Descuento</th><th className="px-6 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {paymentMethods.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{m.name}</td>
                  <td className="px-6 py-4 text-green-600 font-bold">{m.discount_percentage}%</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openMethodDialog(m)}><Edit className="w-4 h-4 text-gray-400" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => {if(confirm("¿Eliminar?")) supabase.from('payment_methods').delete().eq('id', m.id).then(fetchPaymentMethods)}}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={isEmpDialogOpen} onOpenChange={setIsEmpDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Nuevo Empleado</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div><label className="text-sm font-medium mb-1 block">Nombre Completo</label><Input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Ej: Juan Pérez" /></div>
          </div>
          <DialogFooter><Button onClick={handleAddEmployee} className="bg-indigo-600 text-white w-full">Añadir Empleado</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>{editingMethod ? 'Editar' : 'Nuevo'} Método de Pago</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><label className="text-sm font-medium mb-1 block">Nombre</label><Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Transferencia..." /></div>
            <div><label className="text-sm font-medium mb-1 block">Descuento (%)</label><Input type="number" value={formData.discount_percentage} onChange={(e) => setFormData({...formData, discount_percentage: Number(e.target.value)})} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button><Button onClick={handleSavePaymentMethod} className="bg-indigo-600 text-white">Guardar Cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ConfigurationPage;