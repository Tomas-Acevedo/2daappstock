import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, Search, Trash2, Edit,
  ChevronLeft, ChevronRight, Wallet, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SalesHistoryPage = () => {
  const { branchId } = useParams();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [branchName, setBranchName] = useState('Sucursal');
  const [userRole, setUserRole] = useState(null); 
  const [paymentMethods, setPaymentMethods] = useState([]);
  
  const [summaryData, setSummaryData] = useState({ total: 0, byMethod: {} });

  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [hasMore, setHasMore] = useState(true);

  const [dateRange, setDateRange] = useState({
    start: getArgentinaDate(), 
    end: getArgentinaDate()
  });
  const [paymentFilter, setPaymentFilter] = useState('all');

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState({ customer_name: '', payment_method: '' });

  const isOwner = userRole === 'owner';

  useEffect(() => {
    const initializePage = async () => {
      setRoleLoading(true);
      await fetchUserRole();
      await fetchBranchDetails();
      await fetchPaymentMethods();
      setRoleLoading(false);
    };
    initializePage();
  }, [branchId]);

  useEffect(() => {
    if (!roleLoading && userRole) {
      fetchSales();
    }
  }, [branchId, page, dateRange, paymentFilter, userRole, roleLoading]);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && profile.role) setUserRole(profile.role.trim().toLowerCase());
      }
    } catch (error) {
      console.error("Error obteniendo rol:", error);
    }
  };

  const fetchBranchDetails = async () => {
    const { data } = await supabase.from('branches').select('name').eq('id', branchId).single();
    if (data) setBranchName(data.name);
  };

  const fetchPaymentMethods = async () => {
    try {
      const { data } = await supabase
        .from('payment_methods')
        .select('name, discount_percentage')
        .eq('branch_id', branchId);
      if (data) setPaymentMethods(data);
    } catch (error) {
      console.error("Error cargando métodos:", error);
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales')
        .select(`*, sale_items (product_id, quantity, product_name, unit_price)`)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      let totalQuery = supabase
        .from('sales')
        .select('total, payment_method')
        .eq('branch_id', branchId);

      if (isOwner) {
        if (dateRange.start) {
          const startStr = `${dateRange.start}T00:00:00-03:00`;
          query = query.gte('created_at', startStr);
          totalQuery = totalQuery.gte('created_at', startStr);
        }
        if (dateRange.end) {
          const endStr = `${dateRange.end}T23:59:59-03:00`;
          query = query.lte('created_at', endStr);
          totalQuery = totalQuery.lte('created_at', endStr);
        }
        if (paymentFilter !== 'all') {
          query = query.eq('payment_method', paymentFilter);
          totalQuery = totalQuery.eq('payment_method', paymentFilter);
        }
      } else {
        const today = getArgentinaDate();
        const startToday = `${today}T00:00:00-03:00`;
        const endToday = `${today}T23:59:59-03:00`;
        query = query.gte('created_at', startToday).lte('created_at', endToday);
        totalQuery = totalQuery.gte('created_at', startToday).lte('created_at', endToday);
      }

      const [salesRes, totalsRes] = await Promise.all([query, totalQuery]);

      if (salesRes.error) throw salesRes.error;
      if (totalsRes.error) throw totalsRes.error;

      setSales(salesRes.data || []);
      setHasMore(salesRes.data.length === pageSize);

      const calculatedTotals = totalsRes.data.reduce((acc, sale) => {
        const method = sale.payment_method || 'Sin especificar';
        const amount = Number(sale.total);
        acc.total += amount;
        acc.byMethod[method] = (acc.byMethod[method] || 0) + amount;
        return acc;
      }, { total: 0, byMethod: {} });

      setSummaryData(calculatedTotals);

    } catch (error) {
      console.error(error);
      toast({ title: "Error cargando historial", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sale) => {
    if (!window.confirm("¿Estás seguro de eliminar esta venta? Se restaurará el stock.")) return;
    try {
      if (sale.sale_items?.length > 0) {
        for (const item of sale.sale_items) {
           if (item.product_id) {
             const { data: cp } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
             if (cp) await supabase.from('products').update({ stock: cp.stock + item.quantity }).eq('id', item.product_id);
           }
        }
      }
      const { error } = await supabase.from('sales').delete().eq('id', sale.id);
      if (error) throw error;
      toast({ title: "Venta eliminada correctamente" });
      fetchSales();
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const openEdit = (sale) => {
    setEditingSale(sale);
    setEditForm({ customer_name: sale.customer_name || '', payment_method: sale.payment_method || '' });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const { error } = await supabase.from('sales').update({
        customer_name: editForm.customer_name,
        payment_method: editForm.payment_method
      }).eq('id', editingSale.id);
      if (error) throw error;
      toast({ title: "Venta actualizada" });
      fetchSales(); 
      setIsEditDialogOpen(false);
    } catch (error) {
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  if (roleLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p>Verificando permisos...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isOwner ? 'Historial de Ventas' : `Ventas de Hoy - ${branchName}`}
          </h1>
          <p className="text-gray-500 text-sm">
            {isOwner ? 'Consulta y gestiona las transacciones pasadas.' : 'Consulta las transacciones realizadas hoy.'}
          </p>
        </div>
      </div>

      {/* BLOQUE DE FILTROS Y TOTALES - SOLO VISIBLE PARA OWNER */}
      {isOwner && (
        <>
          {/* Filtros */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-1 flex-1 w-full">
              <label className="text-xs font-semibold text-gray-500 uppercase">Desde</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="date" className="w-full pl-9 p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1 flex-1 w-full">
              <label className="text-xs font-semibold text-gray-500 uppercase">Hasta</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="date" className="w-full pl-9 p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} />
              </div>
            </div>
            <div className="space-y-1 flex-1 w-full">
               <label className="text-xs font-semibold text-gray-500 uppercase">Método de Pago</label>
               <select 
                 className="w-full p-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                 value={paymentFilter}
                 onChange={(e) => setPaymentFilter(e.target.value)}
               >
                 <option value="all">Todos los métodos</option>
                 {paymentMethods.map(m => (
                   <option key={m.name} value={m.name}>{m.name}</option>
                 ))}
               </select>
            </div>
            <Button onClick={() => { setPage(0); fetchSales(); }} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700">
              <Search className="w-4 h-4 mr-2" /> Filtrar
            </Button>
          </div>

          {/* Tarjetas de Totales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <p className="text-xs text-gray-500 uppercase font-black tracking-widest mb-1">Total General (Periodo)</p>
              <p className="text-2xl font-black text-gray-900">{formatCurrency(summaryData.total)}</p>
            </div>
            
            {Object.entries(summaryData.byMethod).map(([method, total], idx) => (
              <div key={method} className={`${idx % 2 === 0 ? 'bg-green-50 border-green-100 text-green-800' : 'bg-blue-50 border-blue-100 text-blue-800'} p-4 rounded-xl shadow-sm border`}>
                <div className="flex items-center gap-2 mb-1">
                   <Wallet className="w-3 h-3" />
                   <p className="text-xs uppercase font-black tracking-widest truncate">{method}</p>
                </div>
                <p className="text-2xl font-black">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-200 text-gray-700">
              <tr>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Fecha / Hora</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Cliente</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Detalle</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Método</th>
                <th className="px-6 py-5 text-right text-xs font-black uppercase tracking-widest">Total</th>
                <th className="px-6 py-5 text-center text-xs font-black uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="6" className="p-10 text-center text-lg text-gray-400 font-medium">Cargando ventas...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan="6" className="p-12 text-center text-gray-500 text-lg">No hay ventas registradas.</td></tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-indigo-50/40 transition-colors">
                    <td className="px-6 py-6 whitespace-nowrap align-top">
                      <div className="text-base font-bold text-gray-900">{formatDateTime(sale.created_at).split(',')[0]}</div>
                      <div className="text-sm text-gray-500 font-medium">{formatDateTime(sale.created_at).split(',')[1]}</div>
                    </td>
                    <td className="px-6 py-6 text-base font-bold text-gray-900 align-top">
                      {sale.customer_name || "Cliente General"}
                    </td>
                    <td className="px-6 py-6 align-top">
                      <div className="flex flex-col gap-2">
                        {sale.sale_items?.map((item, idx) => (
                          <span key={idx} className="text-sm text-gray-800 font-bold max-w-[350px] flex items-start gap-2">
                            <span className="text-indigo-600 font-black min-w-[25px]">{item.quantity}x</span> 
                            <span className="flex-1">{item.product_name}</span>
                            <span className="text-gray-400 font-semibold text-xs whitespace-nowrap">({formatCurrency(item.unit_price)})</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-6 align-top">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                          {sale.payment_method}
                        </span>
                        {(() => {
                          const method = paymentMethods.find(m => m.name === sale.payment_method);
                          if (method && Number(method.discount_percentage) > 0) {
                            return (
                              <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-black">
                                -{method.discount_percentage}%
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right text-xl font-black text-gray-900 tracking-tighter align-top">
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-6 py-6 align-top">
                      <div className="flex items-center justify-center gap-3">
                        {isOwner && (
                          <>
                            <button onClick={() => openEdit(sale)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600 transition-all">
                              <Edit className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleDelete(sale)} className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <Button variant="outline" className="font-bold rounded-xl" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4 mr-2" /> Anterior</Button>
          <span className="text-xs font-black uppercase text-gray-500 tracking-widest">Página {page + 1}</span>
          <Button variant="outline" className="font-bold rounded-xl" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Siguiente <ChevronRight className="w-4 h-4 ml-2" /></Button>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle className="text-xl font-black">Editar Venta</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-gray-400">Nombre del Cliente</label>
              <input value={editForm.customer_name} onChange={(e) => setEditForm({...editForm, customer_name: e.target.value})} className="w-full p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-black uppercase text-gray-400">Método de Pago</label>
              <select value={editForm.payment_method} onChange={(e) => setEditForm({...editForm, payment_method: e.target.value})} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                {paymentMethods.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="font-bold" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SalesHistoryPage;