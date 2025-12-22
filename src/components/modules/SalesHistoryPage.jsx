import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, Search, Trash2, Edit, Receipt,
  ChevronLeft, ChevronRight, CreditCard, Wallet, Loader2 
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
  const [paymentMethods, setPaymentMethods] = useState([]); // Métodos dinámicos
  
  // Paginación
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [hasMore, setHasMore] = useState(true);

  // Filtros
  const [dateRange, setDateRange] = useState({
    start: getArgentinaDate(), 
    end: getArgentinaDate()
  });
  const [paymentFilter, setPaymentFilter] = useState('all');

  // Estado de Edición
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState({ customer_name: '', payment_method: '' });

  useEffect(() => {
    const initializePage = async () => {
      setRoleLoading(true);
      await fetchUserRole();
      await fetchBranchDetails();
      await fetchPaymentMethods(); // Cargar métodos de la DB
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
        .select('name')
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

      if (userRole === 'owner') {
        if (dateRange.start) query = query.gte('created_at', `${dateRange.start}T00:00:00-03:00`);
        if (dateRange.end) query = query.lte('created_at', `${dateRange.end}T23:59:59-03:00`);
        if (paymentFilter !== 'all') query = query.eq('payment_method', paymentFilter);
      } else {
        const today = getArgentinaDate();
        query = query.gte('created_at', `${today}T00:00:00-03:00`);
        query = query.lte('created_at', `${today}T23:59:59-03:00`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setHasMore(data.length === pageSize);
      setSales(data || []);
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
      setSales(sales.map(s => s.id === editingSale.id ? { ...s, ...editForm } : s));
      setIsEditDialogOpen(false);
    } catch (error) {
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  const printTicket = (sale) => {
    const ticketContent = `
      <html><head><title>Ticket</title><style>body{font-family:'Courier New',monospace;font-size:12px;width:280px;padding:10px}h3,p{margin:0}.text-center{text-align:center}.divider{border-top:1px dashed #000;margin:10px 0}.flex{display:flex;justify-content:space-between}</style></head><body>
      <div class="text-center"><h3>${branchName}</h3><p>${formatDateTime(sale.created_at)}</p></div><div class="divider"></div>
      ${sale.sale_items?.map(item => `<div class="flex"><span>${item.quantity}x ${item.product_name}</span><span>$${(item.unit_price * item.quantity).toLocaleString('es-AR')}</span></div>`).join('')}
      <div class="divider"></div><div class="flex" style="font-weight: bold;"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <p class="text-center" style="font-size: 10px; margin-top: 20px;">Gracias por su compra</p>
      <script>window.onload = () => { window.print(); window.close(); }</script></body></html>
    `;
    const win = window.open('', '', 'width=400,height=600');
    win.document.write(ticketContent);
    win.document.close();
  };

  if (roleLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p>Verificando permisos...</p>
      </div>
    );
  }

  const isOwner = userRole === 'owner';

  // --- Lógica para Resumen Dinámico ---
  const totalsByMethod = sales.reduce((acc, sale) => {
    const method = sale.payment_method || 'Sin especificar';
    acc[method] = (acc[method] || 0) + Number(sale.total);
    return acc;
  }, {});

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

      {/* --- FILTROS DINÁMICOS: SOLO OWNER --- */}
      {isOwner && (
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
      )}

      {/* RESUMEN DINÁMICO (Genera una tarjeta por cada método que tenga ventas) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Total {isOwner ? '(Periodo)' : '(Hoy)'}</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(sales.reduce((sum, s) => sum + Number(s.total), 0))}</p>
        </div>
        
        {Object.entries(totalsByMethod).map(([method, total], idx) => (
          <div key={method} className={`${idx % 2 === 0 ? 'bg-green-50 border-green-100 text-green-800' : 'bg-blue-50 border-blue-100 text-blue-800'} p-4 rounded-xl shadow-sm border`}>
            <div className="flex items-center gap-2 mb-1">
               <Wallet className="w-3 h-3" />
               <p className="text-xs uppercase font-bold truncate">{method}</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(total)}</p>
          </div>
        ))}
      </div>

      {/* TABLA DE RESULTADOS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
              <tr>
                <th className="px-6 py-4">Fecha / Hora</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Detalle</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4 text-right">Total</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-400">Cargando...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-400">No hay ventas registradas.</td></tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-gray-500">
                      <div className="font-medium text-gray-900">{formatDateTime(sale.created_at).split(',')[0]}</div>
                      <div className="text-xs">{formatDateTime(sale.created_at).split(',')[1]}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{sale.customer_name || "Cliente General"}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 truncate max-w-[200px]">
                        {sale.sale_items?.map((item, idx) => (
                          <span key={idx} className="text-xs text-gray-600">
                            {item.quantity}x {item.product_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded text-xs font-bold capitalize bg-indigo-50 text-indigo-700">
                        {sale.payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">{formatCurrency(sale.total)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => printTicket(sale)} className="p-1.5 text-gray-400 hover:text-indigo-600"><Receipt className="w-4 h-4" /></button>
                        {isOwner && (
                          <>
                            <button onClick={() => openEdit(sale)} className="p-1.5 text-gray-400 hover:text-indigo-600"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(sale)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
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
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4 mr-2" /> Anterior</Button>
          <span className="text-xs text-gray-500">Página {page + 1}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>Siguiente <ChevronRight className="w-4 h-4 ml-2" /></Button>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Editar Venta</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Nombre del Cliente</label>
              <input value={editForm.customer_name} onChange={(e) => setEditForm({...editForm, customer_name: e.target.value})} className="w-full p-2 rounded border" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Método de Pago</label>
              <select value={editForm.payment_method} onChange={(e) => setEditForm({...editForm, payment_method: e.target.value})} className="w-full p-2 rounded border bg-white">
                {paymentMethods.map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} className="bg-indigo-600 hover:bg-indigo-700">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SalesHistoryPage;