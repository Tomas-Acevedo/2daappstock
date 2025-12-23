import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Banknote, Upload, Trash2, Calendar, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, getArgentinaDate } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';

const ExpensesPage = () => {
  const { branchId } = useParams();
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    currency: 'ARS',
    payment_method: '',
    date: getArgentinaDate(),
    file: null
  });

  const [filters, setFilters] = useState({
    startDate: getArgentinaDate(),
    endDate: getArgentinaDate(),
    currency: 'ALL',
    paymentMethod: 'ALL'
  });

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "-";
    const dateOnly = dateStr.split('T')[0];
    const localDate = new Date(dateOnly.replace(/-/g, '\/'));
    return localDate.toLocaleDateString('es-AR');
  };

  useEffect(() => {
    if (branchId) {
        fetchExpenses();
        fetchPaymentMethods();
    }
  }, [branchId, filters]);

  const fetchPaymentMethods = async () => {
    try {
        const { data } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('branch_id', branchId)
            .eq('is_active', true)
            .order('name', { ascending: true });
        
        setPaymentMethods(data || []);
    } catch (error) {
        console.error("Error fetching payment methods:", error);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const startDateTime = `${filters.startDate}T00:00:00-03:00`;
      const endDateTime = `${filters.endDate}T23:59:59-03:00`;

      let query = supabase
        .from('expenses')
        .select('*')
        .eq('branch_id', branchId)
        .gte('date', startDateTime)
        .lte('date', endDateTime)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.currency !== 'ALL') {
        query = query.eq('currency', filters.currency);
      }

      if (filters.paymentMethod !== 'ALL') {
        query = query.eq('payment_method', filters.paymentMethod);
      }

      const { data, error } = await query;
      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error(error);
      toast({ title: "Error al cargar gastos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData(prev => ({ ...prev, file: e.target.files[0] }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.amount || !formData.date || !formData.payment_method) {
      toast({ title: "Campos incompletos", description: "Asegúrate de incluir el método de pago", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; 
      const timestamp = `${formData.date}T${timeStr}-03:00`;

      let imageUrl = null;
      if (formData.file) {
        const fileExt = formData.file.name.split('.').pop();
        const fileName = `${branchId}/${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('expenses')
          .upload(fileName, formData.file);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('expenses').getPublicUrl(fileName);
          imageUrl = publicUrl;
        }
      }

      const { error } = await supabase.from('expenses').insert([{
        branch_id: branchId,
        name: formData.name,
        amount: Number(formData.amount),
        currency: formData.currency,
        payment_method: formData.payment_method,
        date: timestamp, 
        image_url: imageUrl
      }]);

      if (error) throw error;

      toast({ title: "Gasto registrado correctamente" });
      setFormData({
        name: '',
        amount: '',
        currency: 'ARS',
        payment_method: '',
        date: getArgentinaDate(),
        file: null
      });
      fetchExpenses();

    } catch (error) {
      console.error(error);
      toast({ title: "Error al registrar gasto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este gasto?")) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Gasto eliminado" });
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const totalARS = expenses
    .filter(e => e.currency === 'ARS')
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const totalUSD = expenses
    .filter(e => e.currency === 'USD')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Nombre del gasto</label>
            <input name="name" value={formData.name} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej: Flete, empaques, etc." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Monto</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input name="amount" type="number" value={formData.amount} onChange={handleInputChange} className="w-full p-2.5 pl-7 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
            </div>
          </div>
          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-500 uppercase">Moneda</label>
             <select name="currency" value={formData.currency} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
               <option value="ARS">ARS (Pesos)</option>
               <option value="USD">USD (Dólares)</option>
             </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Método de Pago</label>
            <select name="payment_method" value={formData.payment_method} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
              <option value="">Seleccionar...</option>
              {paymentMethods.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Fecha (ART)</label>
                <input name="date" type="date" value={formData.date} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Imágenes (opcional)</label>
                <div className="flex items-center gap-3">
                    <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto text-center border-dashed">
                    Elegir archivos
                    <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
                    </label>
                    <span className="text-sm text-gray-500 truncate max-w-[200px]">{formData.file ? formData.file.name : "Sin archivos"}</span>
                </div>
            </div>
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-medium">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Registrar Gasto"}
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1">
           <label className="text-xs font-semibold text-gray-500 uppercase">Desde</label>
           <input type="date" value={filters.startDate} onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500" />
        </div>
        <div className="space-y-1">
           <label className="text-xs font-semibold text-gray-500 uppercase">Hasta</label>
           <input type="date" value={filters.endDate} onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500" />
        </div>
        <div className="space-y-1">
           <label className="text-xs font-semibold text-gray-500 uppercase">Moneda</label>
           <select value={filters.currency} onChange={(e) => setFilters(prev => ({ ...prev, currency: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500 bg-white">
             <option value="ALL">Todas las Monedas</option>
             <option value="ARS">ARS</option>
             <option value="USD">USD</option>
           </select>
        </div>
        <div className="space-y-1">
           <label className="text-xs font-semibold text-gray-500 uppercase">Método de Pago</label>
           <select value={filters.paymentMethod} onChange={(e) => setFilters(prev => ({ ...prev, paymentMethod: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-500 bg-white">
             <option value="ALL">Todos los Métodos</option>
             {paymentMethods.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
             ))}
           </select>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Historial</h3>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Adjunto</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && expenses.length === 0 ? (
                   <tr><td colSpan="6" className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></td></tr>
                ) : expenses.length === 0 ? (
                   <tr><td colSpan="6" className="text-center py-10 text-gray-400">No hay gastos en este período.</td></tr>
                ) : (
                  expenses.map(exp => {
                    const symbol = exp.currency === 'USD' ? 'US$ ' : '$ ';
                    return (
                      <tr key={exp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDisplayDate(exp.date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{exp.name}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-gray-600">
                              <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                              {exp.payment_method || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${exp.currency === 'ARS' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {symbol}{Number(exp.amount).toLocaleString('es-AR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {exp.image_url ? (
                            <a href={exp.image_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">
                              <Upload className="w-3 h-3" /> Ver
                            </a>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDelete(exp.id)} className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-green-200 text-green-800 text-xs font-bold px-2 py-0.5 rounded">ARS</span>
              <span className="text-green-800 font-medium text-sm">Total ARS del período</span>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">${totalARS.toLocaleString('es-AR')}</div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-0.5 rounded">USD</span>
              <span className="text-blue-800 font-medium text-sm">Total USD del período</span>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">US$ {totalUSD.toLocaleString('es-AR')}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ExpensesPage;