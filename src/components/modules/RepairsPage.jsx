import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Wrench, Calendar, Loader2, CreditCard, 
  Plus, Trash2, Edit3, Phone, CheckCircle2, 
  Clock, AlertCircle, PackageCheck, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, getArgentinaDate } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';

const RepairsPage = () => {
  const { branchId } = useParams();
  const [loading, setLoading] = useState(false);
  const [repairs, setRepairs] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [isEditing, setIsEditing] = useState(null);

  // ✅ Referencia para hacer scroll exacto al formulario
  const formRef = useRef(null);

  // Estados para métricas globales del período completo
  const [globalMetrics, setGlobalMetrics] = useState({
    totalInvoiced: 0,
    totalCost: 0,
    totalGain: 0
  });

  // Estados para la paginación (15 reparaciones por página de acuerdo a tu setting original)
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 15;

  // Funciones auxiliares para el formateo de miles con "." en inputs de texto
  const formatNumberString = (value) => {
    if (!value && value !== 0) return '';
    const cleanValue = value.toString().replace(/\D/g, '');
    if (!cleanValue) return '';
    return Number(cleanValue).toLocaleString('es-AR');
  };

  const parseFormattedNumber = (value) => {
    if (!value) return 0;
    const cleanValue = value.toString().replace(/\./g, '');
    return Number(cleanValue) || 0;
  };

  // Estado del formulario (Creación / Edición)
  const [formData, setFormData] = useState({
    client_name: '',
    client_phone: '',
    device_model: '',
    repair_type: '',
    cost: '',
    price: '',
    status: 'Pendiente',
    payment_method: '',
    notes: '',
    date: getArgentinaDate()
  });

  // Filtros de búsqueda
  const [filters, setFilters] = useState({
    startDate: getArgentinaDate(),
    endDate: getArgentinaDate(),
    status: 'ALL',
    paymentMethod: 'ALL'
  });

  // Resetear la página a 0 cuando cambian los filtros
  useEffect(() => {
    setPage(0);
  }, [filters]);

  useEffect(() => {
    if (branchId) {
      fetchRepairsAndMetrics();
    }
  }, [branchId, filters, page]);

  useEffect(() => {
    if (branchId) {
      fetchPaymentMethods();
    }
  }, [branchId]);

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

  const fetchRepairsAndMetrics = async () => {
    setLoading(true);
    try {
      const startDateTime = `${filters.startDate}T00:00:00-03:00`;
      const endDateTime = `${filters.endDate}T23:59:59-03:00`;

      // 1. QUERY PAGINADA (Para la tabla)
      const rangeStart = page * pageSize;
      const rangeEnd = (page + 1) * pageSize;

      let tableQuery = supabase
        .from('repairs')
        .select('*')
        .eq('branch_id', branchId)
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime)
        .order('created_at', { ascending: false })
        .range(rangeStart, rangeEnd);

      // 2. QUERY GLOBAL
      let metricsQuery = supabase
        .from('repairs')
        .select('price, cost')
        .eq('branch_id', branchId)
        .gte('created_at', startDateTime)
        .lte('created_at', endDateTime);

      if (filters.status !== 'ALL') {
        tableQuery = tableQuery.eq('status', filters.status);
        metricsQuery = metricsQuery.eq('status', filters.status);
      }
      if (filters.paymentMethod !== 'ALL') {
        tableQuery = tableQuery.eq('payment_method', filters.paymentMethod);
        metricsQuery = metricsQuery.eq('payment_method', filters.paymentMethod);
      }

      const [tableRes, metricsRes] = await Promise.all([tableQuery, metricsQuery]);

      if (tableRes.error) throw tableRes.error;
      if (metricsRes.error) throw metricsRes.error;

      const rows = tableRes.data || [];
      if (rows.length > pageSize) {
        setHasMore(true);
        setRepairs(rows.slice(0, pageSize));
      } else {
        setHasMore(false);
        setRepairs(rows);
      }

      const allRowsForMetrics = metricsRes.data || [];
      const totalInvoiced = allRowsForMetrics.reduce((sum, r) => sum + Number(r.price || 0), 0);
      const totalCost = allRowsForMetrics.reduce((sum, r) => sum + Number(r.cost || 0), 0);
      
      setGlobalMetrics({
        totalInvoiced,
        totalCost,
        totalGain: totalInvoiced - totalCost
      });

    } catch (error) {
      console.error(error);
      toast({ title: "Error al cargar datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'cost' || name === 'price') {
      setFormData(prev => ({ ...prev, [name]: formatNumberString(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const resetForm = () => {
    setFormData({
      client_name: '',
      client_phone: '',
      device_model: '',
      repair_type: '',
      cost: '',
      price: '',
      status: 'Pendiente',
      payment_method: '',
      notes: '',
      date: getArgentinaDate()
    });
    setIsEditing(null);
  };

  const handleSubmit = async () => {
    if (!formData.client_name || !formData.device_model || !formData.repair_type || !formData.date) {
      toast({ title: "Por favor completa los campos obligatorios", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; 
      const timestamp = `${formData.date}T${timeStr}-03:00`;

      const payload = {
        branch_id: branchId,
        client_name: formData.client_name,
        client_phone: formData.client_phone || null,
        device_model: formData.device_model,
        repair_type: formData.repair_type,
        cost: parseFormattedNumber(formData.cost),
        price: parseFormattedNumber(formData.price),
        status: formData.status,
        payment_method: formData.payment_method || null,
        notes: formData.notes || null,
        created_at: timestamp
      };

      if (isEditing) {
        const { error } = await supabase
          .from('repairs')
          .update(payload)
          .eq('id', isEditing);
        
        if (error) throw error;
        toast({ title: "Reparación actualizada correctamente" });
      } else {
        const { error } = await supabase
          .from('repairs')
          .insert([payload]);

        if (error) throw error;
        toast({ title: "Reparación registrada correctamente" });
      }

      resetForm();
      fetchRepairsAndMetrics();
    } catch (error) {
      console.error(error);
      toast({ title: "Error al procesar la reparación", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (repair) => {
    setIsEditing(repair.id);
    const cleanDate = repair.created_at ? repair.created_at.split('T')[0] : getArgentinaDate();

    setFormData({
      client_name: repair.client_name,
      client_phone: repair.client_phone || '',
      device_model: repair.device_model,
      repair_type: repair.repair_type,
      cost: formatNumberString(repair.cost),
      price: formatNumberString(repair.price),
      status: repair.status,
      payment_method: repair.payment_method || '',
      notes: repair.notes || '',
      date: cleanDate
    });

    // ✅ Hace scroll suave exacto hasta la posición del formulario
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este registro de reparación?")) return;
    try {
      const { error } = await supabase.from('repairs').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Registro eliminado" });
      fetchRepairsAndMetrics();
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Pendiente': 'bg-amber-100 text-amber-700 border-amber-200',
      'En reparación': 'bg-blue-100 text-blue-700 border-blue-200',
      'Listo': 'bg-green-100 text-green-700 border-green-200',
      'Entregado': 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-red-100 text-red-600 rounded-lg">
          <Wrench className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Servicio Técnico / Reparaciones</h1>
      </div>

      {/* Formulario de Ingreso y Modificación */}
      {/* ✅ Agregada la referencia formRef acá */}
      <div ref={formRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 scroll-mt-6">
        <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 flex items-center gap-2">
          {isEditing ? <Edit3 className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-green-500" />}
          {isEditing ? "Modificar Reparación" : "Ingresar Nueva Reparación"}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Cliente *</label>
            <input name="client_name" value={formData.client_name} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Nombre completo" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Teléfono</label>
            <input name="client_phone" value={formData.client_phone} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej: 1123456789" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Modelo del Equipo *</label>
            <input name="device_model" value={formData.device_model} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej: iPhone 13 Pro, Samsung A54" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Falla / Reparación *</label>
            <input name="repair_type" value={formData.repair_type} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej: Cambio de Módulo, Pin de Carga" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Fecha *</label>
            <input name="date" type="date" value={formData.date} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Costo del Repuesto</label>
            <input name="cost" type="text" value={formData.cost} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Presupuesto / Precio Final</label>
            <input name="price" type="text" value={formData.price} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
          </div>
          <div className="space-y-1">
             <label className="text-xs font-semibold text-gray-500 uppercase">Estado</label>
             <select name="status" value={formData.status} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
               <option value="Pendiente">⏳ Pendiente</option>
               <option value="En reparación">🛠 En reparación</option>
               <option value="Listo">✅ Listo para retirar</option>
               <option value="Entregado">📦 Entregado</option>
             </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Método de Pago</label>
            <select name="payment_method" value={formData.payment_method} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
              <option value="">No cobrado aún / Ninguno</option>
              {paymentMethods.map(m => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1 mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase">Notas internas / Detalles adicionales</label>
          <textarea name="notes" rows="2" value={formData.notes} onChange={handleInputChange} className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Detalles de rayas, contraseñas del equipo, etc."></textarea>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={loading} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : isEditing ? "Guardar Cambios" : "Ingresar Orden"}
          </Button>
          {isEditing && (
            <Button onClick={resetForm} variant="outline" className="w-full sm:w-auto">
              Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Filtros de Busqueda */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1"><label className="text-xs font-semibold text-gray-500 uppercase">Desde</label><input type="date" value={filters.startDate} onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none" /></div>
        <div className="space-y-1"><label className="text-xs font-semibold text-gray-500 uppercase">Hasta</label><input type="date" value={filters.endDate} onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm outline-none" /></div>
        <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Estado</label>
            <select value={filters.status} onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="ALL">Todos los Estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En reparación">En reparación</option>
                <option value="Listo">Listo</option>
                <option value="Entregado">Entregado</option>
            </select>
        </div>
        <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Método de Pago</label>
            <select value={filters.paymentMethod} onChange={(e) => setFilters(prev => ({ ...prev, paymentMethod: e.target.value }))} className="w-full p-2 rounded-lg border border-gray-200 text-sm bg-white">
                <option value="ALL">Todos</option>
                {paymentMethods.map(m => (<option key={m.id} value={m.name}>{m.name}</option>))}
            </select>
        </div>
      </div>

      {/* Listado de Reparaciones con Tabla y Controles */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Ingreso</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Equipo / Falla</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Cobro</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && repairs.length === 0 ? (
                   <tr><td colSpan="6" className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></td></tr>
                ) : repairs.length === 0 ? (
                   <tr><td colSpan="6" className="text-center py-10 text-gray-400 font-medium">No se encontraron órdenes de reparación en este rango de fechas o filtros.</td></tr>
                ) : (
                  repairs.map(rep => (
                    <tr key={rep.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-4 whitespace-nowrap text-gray-500 text-xs">
                        {formatDisplayDate(rep.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-bold text-gray-900">{rep.client_name}</div>
                        {rep.client_phone && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {rep.client_phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-indigo-900">{rep.device_model}</div>
                        <div className="text-xs text-gray-600 font-medium mt-0.5">{rep.repair_type}</div>
                        {rep.notes && <div className="text-[11px] bg-amber-50 border border-amber-100 text-amber-800 rounded px-1.5 py-0.5 mt-1 inline-block max-w-[260px] truncate">{rep.notes}</div>}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusBadge(rep.status)}`}>
                          {rep.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-bold text-gray-900">{formatCurrency(rep.price)}</div>
                        <div className="text-[10px] text-gray-400 font-medium">Costo: {formatCurrency(rep.cost)}</div>
                        {rep.payment_method && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold uppercase mt-1">
                            <CreditCard className="w-2.5 h-2.5" /> {rep.payment_method}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEditClick(rep)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(rep.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Controles de Paginación */}
        <div className="flex items-center justify-between px-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="rounded-xl font-bold text-xs"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Página {page + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore || loading}
            className="rounded-xl font-bold text-xs"
          >
            Siguiente <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Métricas de Cierre Globales de todo el período filtrado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
          <div className="text-indigo-800 font-semibold text-xs uppercase tracking-wider mb-1">Presupuestado Total del Período</div>
          <div className="text-2xl font-black text-gray-900">{formatCurrency(globalMetrics.totalInvoiced)}</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm">
          <div className="text-red-800 font-semibold text-xs uppercase tracking-wider mb-1">Inversión Repuestos Total</div>
          <div className="text-2xl font-black text-gray-900">{formatCurrency(globalMetrics.totalCost)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 shadow-sm">
          <div className="text-emerald-800 font-semibold text-xs uppercase tracking-wider mb-1">Ganancia Estimada Total</div>
          <div className="text-2xl font-black text-emerald-700">{formatCurrency(globalMetrics.totalGain)}</div>
        </div>
      </div>
    </motion.div>
  );
};

export default RepairsPage;