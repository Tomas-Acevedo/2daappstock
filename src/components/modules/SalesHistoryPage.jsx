import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Search,
  Trash2,
  Edit,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Loader2
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

  // Para hacer "debounce" de refetch cuando llegan varios eventos seguidos
  const realtimeTimerRef = useRef(null);

  useEffect(() => {
    const initializePage = async () => {
      setRoleLoading(true);
      await fetchUserRole();
      await fetchBranchDetails();
      await fetchPaymentMethods();
      setRoleLoading(false);
    };
    initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
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

  const fetchSales = useCallback(async () => {
    if (!branchId) return;
    if (roleLoading || !userRole) return;

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
      setHasMore((salesRes.data || []).length === pageSize);

      const calculatedTotals = (totalsRes.data || []).reduce((acc, sale) => {
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
  }, [branchId, roleLoading, userRole, page, pageSize, isOwner, dateRange.start, dateRange.end, paymentFilter]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  // =========================
  // REALTIME: SALES (Historial)
  // =========================
  useEffect(() => {
    if (!branchId) return;
    if (roleLoading || !userRole) return;

    const channel = supabase
      .channel(`realtime:sales_history:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales",
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          // mini debounce + delay para asegurar que sale_items ya estén listos
          if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
          realtimeTimerRef.current = setTimeout(() => {
            fetchSales();
          }, 350);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [branchId, roleLoading, userRole, fetchSales]);

  const handleDelete = async (sale) => {
    if (!window.confirm("¿Estás seguro de eliminar esta venta? Se restaurará el stock.")) return;
    try {
      if (sale.sale_items?.length > 0) {
        for (const item of sale.sale_items) {
          if (item.product_id) {
            const { data: cp } = await supabase
              .from('products')
              .select('stock')
              .eq('id', item.product_id)
              .single();
            if (cp) {
              await supabase
                .from('products')
                .update({ stock: cp.stock + item.quantity })
                .eq('id', item.product_id);
            }
          }
        }
      }

      const { error } = await supabase.from('sales').delete().eq('id', sale.id);
      if (error) throw error;

      toast({ title: "Venta eliminada correctamente" });
      // No hace falta llamar fetchSales sí o sí: realtime lo hará,
      // pero lo dejamos por feedback inmediato
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
        <p>Verificando permisos.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Historial de Ventas</h1>
          <p className="text-sm text-gray-500 font-medium">Sucursal: {branchName}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
          <Wallet className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total</div>
            <div className="text-lg font-black text-gray-900">{formatCurrency(summaryData.total)}</div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-1 w-full md:w-auto">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Fechas
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  className="border p-2 rounded-md text-sm w-full"
                  value={dateRange.start}
                  onChange={e => { setPage(0); setDateRange({ ...dateRange, start: e.target.value }); }}
                />
                <input
                  type="date"
                  className="border p-2 rounded-md text-sm w-full"
                  value={dateRange.end}
                  onChange={e => { setPage(0); setDateRange({ ...dateRange, end: e.target.value }); }}
                />
              </div>
            </div>

            <div className="space-y-1 w-full md:w-auto flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                <Search className="w-3 h-3" /> Método
              </label>
              <select
                className="w-full border p-2 rounded-md text-sm bg-white"
                value={paymentFilter}
                onChange={e => { setPage(0); setPaymentFilter(e.target.value); }}
              >
                <option value="all">Todos</option>
                {paymentMethods.map((m, idx) => (
                  <option key={idx} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
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
                <tr>
                  <td colSpan="6" className="text-center p-10 text-lg text-gray-400 font-medium">
                    Cargando ventas...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center p-12 text-gray-500 text-lg">
                    No se encontraron ventas.
                  </td>
                </tr>
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
                      <span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                        {sale.payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-right text-xl font-black text-gray-900 tracking-tighter align-top">
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-6 py-6 align-top">
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-xl border-gray-200 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                          onClick={() => openEdit(sale)}
                        >
                          <Edit className="w-5 h-5 text-indigo-600" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-xl border-gray-200 hover:bg-red-50 hover:text-red-600 transition-all"
                          onClick={() => handleDelete(sale)}
                        >
                          <Trash2 className="w-5 h-5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          className="rounded-xl"
          disabled={page === 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
        >
          <ChevronLeft className="w-4 h-4 mr-2" /> Anterior
        </Button>

        <div className="text-sm text-gray-500 font-bold">
          Página {page + 1}
        </div>

        <Button
          variant="outline"
          className="rounded-xl"
          disabled={!hasMore}
          onClick={() => setPage(p => p + 1)}
        >
          Siguiente <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar venta</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Cliente</label>
              <input
                className="w-full border p-2 rounded-md text-sm"
                value={editForm.customer_name}
                onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Método de pago</label>
              <select
                className="w-full border p-2 rounded-md text-sm bg-white"
                value={editForm.payment_method}
                onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })}
              >
                {paymentMethods.map((m, idx) => (
                  <option key={idx} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SalesHistoryPage;
