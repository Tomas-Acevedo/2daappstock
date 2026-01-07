import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Search, Trash2, Edit, ChevronLeft, ChevronRight, Wallet, Loader2, FileText, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Offline Imports
import { useOffline } from "@/contexts/OfflineContext";
import {
  cachePaymentMethods,
  cacheBranches,
  getPaymentMethodsByBranch,
  getBranchById,
} from "@/lib/offlineDb";
import { getLocalSalesForBranch, mergeSales } from "@/lib/offlineSalesHistory";

const SalesHistoryPage = () => {
  const { branchId } = useParams();
  const { online, pendingCount } = useOffline();

  const [sales, setSales] = useState([]);
  const [localSales, setLocalSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [branchDetails, setBranchDetails] = useState({ name: 'Sucursal', logo_url: '', address: '', tel: '' });
  const [userRole, setUserRole] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [allowEditDelete, setAllowEditDelete] = useState(true);

  const [summaryData, setSummaryData] = useState({ total: 0 });
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [hasMore, setHasMore] = useState(true);

  const [dateRange, setDateRange] = useState({ start: getArgentinaDate(), end: getArgentinaDate() });
  const [paymentFilter, setPaymentFilter] = useState('all');

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState({ customer_name: '', payment_method: '' });

  const isOwner = userRole === 'owner';
  const canModifySales = isOwner || allowEditDelete;

  useEffect(() => {
    const initializePage = async () => {
      setRoleLoading(true);
      await fetchUserRole();
      await fetchBranchDetails();
      await fetchPaymentMethods();
      
      // Fallback de rol para offline extremo
      if (!online && !localStorage.getItem("gestify_role")) {
        setUserRole("pos");
      }
      
      setRoleLoading(false);
    };
    initializePage();
  }, [branchId, online]);

  const fetchUserRole = async () => {
    try {
      // 1) Si estoy offline, uso cache
      if (!online) {
        const cachedRole = localStorage.getItem("gestify_role");
        if (cachedRole) setUserRole(cachedRole);
        return;
      }

      // 2) Online normal
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Si no hay user logueado pero estamos online, intentamos cache
        const cachedRole = localStorage.getItem("gestify_role");
        if (cachedRole) setUserRole(cachedRole);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      const role = (profile?.role || "").trim().toLowerCase();
      if (role) {
        setUserRole(role);
        localStorage.setItem("gestify_role", role); // ✅ cache para offline
      }
    } catch (e) {
      // fallback final
      const cachedRole = localStorage.getItem("gestify_role");
      if (cachedRole) setUserRole(cachedRole);
    }
  };

  const fetchBranchDetails = async () => {
    try {
      if (online) {
        const { data, error } = await supabase
          .from("branches")
          .select("id, name, logo_url, address, tel, allow_sales_edit_delete")
          .eq("id", branchId)
          .single();

        if (error) throw error;
        if (data) {
          setBranchDetails({ name: data.name, logo_url: data.logo_url, address: data.address, tel: data.tel });
          setAllowEditDelete(data.allow_sales_edit_delete ?? true);
          await cacheBranches([data]);
        }
      } else {
        const cached = await getBranchById(branchId);
        if (cached) {
          setBranchDetails({ name: cached.name, logo_url: cached.logo_url, address: cached.address, tel: cached.tel });
          setAllowEditDelete(cached.allow_sales_edit_delete ?? true);
        }
      }
    } catch {
      const cached = await getBranchById(branchId);
      if (cached) {
        setBranchDetails({ name: cached.name, logo_url: cached.logo_url, address: cached.address, tel: cached.tel });
        setAllowEditDelete(cached.allow_sales_edit_delete ?? true);
      }
    }
  };

  const fetchPaymentMethods = async () => {
    try {
      if (online) {
        const { data, error } = await supabase
  .from("payment_methods")
  .select("*") // ✅ importante: no recortar campos
  .eq("branch_id", branchId);

        if (error) throw error;
        const active = (data || []).filter(m => m.is_active);
        setPaymentMethods(active);
        await cachePaymentMethods(data || []);
      } else {
        const cached = await getPaymentMethodsByBranch(branchId);
        setPaymentMethods(cached || []);
      }
    } catch {
      const cached = await getPaymentMethodsByBranch(branchId);
      setPaymentMethods(cached || []);
    }
  };

  const fetchLocalSales = useCallback(async () => {
    if (!branchId) return;
    const locals = await getLocalSalesForBranch(branchId);
    setLocalSales(locals);
  }, [branchId]);

  useEffect(() => {
    fetchLocalSales();
  }, [fetchLocalSales, pendingCount, online]);

  const fetchSales = useCallback(async () => {
    if (!branchId || roleLoading) return; // Ya no depende estrictamente de userRole para entrar
    setLoading(true);

    try {
      const locals = await getLocalSalesForBranch(branchId);
      setLocalSales(locals);

      if (!online) {
        let filtered = [...locals];
        // Si no tenemos rol, se asume no-owner (lógica de hoy solamente)
        if (isOwner) {
          if (dateRange.start) filtered = filtered.filter(s => (s.created_at || "").startsWith(dateRange.start));
          if (dateRange.end) filtered = filtered.filter(s => (s.created_at || "").startsWith(dateRange.end));
          if (paymentFilter !== "all") filtered = filtered.filter(s => s.payment_method === paymentFilter);
        } else {
          const today = getArgentinaDate();
          filtered = filtered.filter(s => (s.created_at || "").startsWith(today));
        }

        const start = page * pageSize;
        const end = start + pageSize;
        const pageRows = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(start, end);

        setSales(pageRows);
        setHasMore(filtered.length > end);
        setSummaryData({ total: filtered.reduce((acc, s) => acc + Number(s.total || 0), 0) });
        return;
      }

      // ONLINE MODE
      let query = supabase
        .from("sales")
        .select(`*, sale_items (product_id, quantity, product_name, unit_price)`)
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      let totalQuery = supabase.from("sales").select("total, payment_method").eq("branch_id", branchId);

      if (isOwner) {
        if (dateRange.start) {
          query = query.gte("created_at", `${dateRange.start}T00:00:00-03:00`);
          totalQuery = totalQuery.gte("created_at", `${dateRange.start}T00:00:00-03:00`);
        }
        if (dateRange.end) {
          query = query.lte("created_at", `${dateRange.end}T23:59:59-03:00`);
          totalQuery = totalQuery.lte("created_at", `${dateRange.end}T23:59:59-03:00`);
        }
        if (paymentFilter !== "all") {
          query = query.eq("payment_method", paymentFilter);
          totalQuery = totalQuery.eq("payment_method", paymentFilter);
        }
      } else {
        const today = getArgentinaDate();
        query = query.gte("created_at", `${today}T00:00:00-03:00`).lte("created_at", `${today}T23:59:59-03:00`);
        totalQuery = totalQuery.gte("created_at", `${today}T00:00:00-03:00`).lte("created_at", `${today}T23:59:59-03:00`);
      }

      const [salesRes, totalsRes] = await Promise.all([query, totalQuery]);
      const remoteSales = salesRes.data || [];
      const merged = mergeSales(remoteSales, locals);

      setSales(merged);
      setHasMore(remoteSales.length === pageSize);

      const remoteTotal = (totalsRes.data || []).reduce((acc, s) => acc + Number(s.total), 0);
      const localTotal = locals.reduce((acc, s) => acc + Number(s.total || 0), 0);
      setSummaryData({ total: remoteTotal + localTotal });

    } catch (error) {
      toast({ title: "Error cargando historial", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [branchId, roleLoading, userRole, page, dateRange, paymentFilter, isOwner, online]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const handleDelete = async (sale) => {
    if (!online) {
      toast({ title: "Sin conexión", description: "No podés eliminar ventas sin internet.", variant: "destructive" });
      return;
    }
    if (sale.__local) {
      toast({ title: "Venta pendiente", description: "Esta venta aún no se sincronizó.", variant: "destructive" });
      return;
    }
    if (!window.confirm("¿Estás seguro? Se restaurará el stock.")) return;
    try {
      for (const item of sale.sale_items) {
        if (item.product_id) {
          const { data: cp } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
          if (cp) await supabase.from('products').update({ stock: cp.stock + item.quantity }).eq('id', item.product_id);
        }
      }
      await supabase.from('sales').delete().eq('id', sale.id);
      toast({ title: "Venta eliminada" }); fetchSales();
    } catch (error) { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  const handleUpdate = async () => {
    if (!online || editingSale?.__local) {
      toast({ title: "No disponible", description: "Solo se puede editar cuando está sincronizada.", variant: "destructive" });
      return;
    }
    try {
      await supabase.from('sales').update({ customer_name: editForm.customer_name, payment_method: editForm.payment_method }).eq('id', editingSale.id);
      toast({ title: "Venta actualizada" }); fetchSales(); setIsEditDialogOpen(false);
    } catch (error) { toast({ title: "Error al actualizar", variant: "destructive" }); }
  };

  const generateSalePDF = (sale) => {
    const element = document.createElement('div');
    const items = sale.sale_items || sale.items || [];
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; background: white; width: 750px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 40px;">
          ${branchDetails.logo_url ? `<img src="${branchDetails.logo_url}" style="max-height: 120px; display: block; margin: 0 auto 15px auto;" />` : ''}
          <h1 style="font-size: 32px; font-weight: 900; margin: 0; text-transform: uppercase;">${branchDetails.name}</h1>
          <p style="font-size: 14px; color: #666; letter-spacing: 2px; margin-top: 10px; font-weight: bold;">COMPROBANTE DE VENTA</p>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 2px solid #f0f0f0; padding-bottom: 25px;">
          <div>
            <p style="margin: 5px 0;"><strong>CLIENTE:</strong> ${sale.customer_name || 'Cliente General'}</p>
            <p style="margin: 5px 0;"><strong>FECHA:</strong> ${formatDateTime(sale.created_at).split(',')[0]}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 5px 0;"><strong>DIRECCIÓN:</strong> ${branchDetails.address || 'No disponible'}</p>
            <p style="margin: 5px 0;"><strong>WHATSAPP:</strong> ${branchDetails.tel || 'No disponible'}</p>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">DESCRIPCIÓN</th>
              <th style="text-align: center; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">CANT.</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">P. UNITARIO</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => `
              <tr>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px;">${p.product_name || p.name}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: center;">${p.quantity}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right;">$${Number(p.unit_price || p.price).toLocaleString('es-AR')}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right; font-weight: bold;">$${((p.unit_price || p.price) * p.quantity).toLocaleString('es-AR')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; margin-top: 20px;">
          <div style="width: 250px; border-top: 4px solid #000; margin-top: 15px; padding-top: 15px; display: flex; justify-content: space-between; font-size: 20px; font-weight: 900; color: #000;">
            <span style="text-transform: uppercase;">TOTAL:</span> <span>$${Number(sale.total).toLocaleString('es-AR')}</span>
          </div>
        </div>
      </div>
    `;
    const opt = { margin: 0, filename: `Venta_${sale.id}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' } };
    const pdfWindow = window.open("", "_blank");
    window.html2pdf().from(element).set(opt).toPdf().get('pdf').then((pdf) => {
      const blob = pdf.output('blob');
      const fileURL = URL.createObjectURL(blob);
      if (pdfWindow) pdfWindow.location.href = fileURL;
      else window.open(fileURL, '_blank');
    });
  };

  if (roleLoading) return <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /><p>Verificando permisos.</p></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
            Historial de Ventas
            {!online && <CloudOff className="w-6 h-6 text-amber-500" />}
          </h1>
          <p className="text-sm text-gray-500 font-medium">Sucursal: {branchDetails.name}</p>
        </div>
        {isOwner && <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3"><Wallet className="w-5 h-5 text-indigo-600" /><div><div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total</div><div className="text-lg font-black text-gray-900">{formatCurrency(summaryData.total)}</div></div></div>}
      </div>

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
              {loading ? <tr><td colSpan="6" className="text-center p-10 text-lg text-gray-400 font-medium">Cargando ventas...</td></tr> : sales.length === 0 ? <tr><td colSpan="6" className="text-center p-12 text-gray-500 text-lg">No se encontraron ventas.</td></tr> : sales.map((sale) => {
                const canEditThis = canModifySales && online && !sale.__local;
                const items = sale.sale_items || sale.items || [];
                
                return (
                <tr key={sale.id} className="hover:bg-indigo-50/40 transition-colors">
                  <td className="px-6 py-6 whitespace-nowrap align-top">
                    <div className="text-base font-bold text-gray-900">{formatDateTime(sale.created_at).split(',')[0]}</div>
                    <div className="text-sm text-gray-500 font-medium">{formatDateTime(sale.created_at).split(',')[1]}</div>
                  </td>
                  <td className="px-6 py-6 text-base font-bold text-gray-900 align-top">
                    {sale.customer_name || "Cliente General"}
                    {sale.__local && (
                      <span className="ml-2 px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-100">
                        Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-6 align-top">
                    <div className="flex flex-col gap-2">{items.map((item, idx) => (
                      <span key={idx} className="text-sm text-gray-800 font-bold max-w-[350px] flex items-start gap-2">
                        <span className="text-indigo-600 font-black min-w-[25px]">{item.quantity}x</span><span className="flex-1">{item.product_name || item.name}</span><span className="text-gray-400 font-semibold text-xs whitespace-nowrap">({formatCurrency(item.unit_price || item.price)})</span>
                      </span>
                    ))}</div>
                  </td>
                  <td className="px-6 py-6 align-top"><span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">{sale.payment_method}</span></td>
                  <td className="px-6 py-6 text-right text-xl font-black text-gray-900 tracking-tighter align-top">{formatCurrency(sale.total)}</td>
                  <td className="px-6 py-6 align-top">
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-200 hover:bg-green-50" onClick={() => generateSalePDF(sale)}><FileText className="w-5 h-5 text-green-600" /></Button>
                      {canEditThis && (
                        <>
                          <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-200 hover:bg-indigo-50" onClick={() => { setEditingSale(sale); setEditForm({ customer_name: sale.customer_name, payment_method: sale.payment_method }); setIsEditDialogOpen(true); }}><Edit className="w-5 h-5 text-indigo-600" /></Button>
                          <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-200 hover:bg-red-50" onClick={() => handleDelete(sale)}><Trash2 className="w-5 h-5 text-red-500" /></Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" className="rounded-xl" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft className="w-4 h-4 mr-2" /> Anterior</Button>
        <div className="text-sm text-gray-500 font-bold">Página {page + 1}</div>
        <Button variant="outline" className="rounded-xl" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Siguiente <ChevronRight className="w-4 h-4 ml-2" /></Button>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar venta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-bold text-gray-500 uppercase">Cliente</label><input className="w-full border p-2 rounded-md text-sm" value={editForm.customer_name} onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })} /></div>
            <div><label className="text-xs font-bold text-gray-500 uppercase">Método de pago</label><select className="w-full border p-2 rounded-md text-sm bg-white" value={editForm.payment_method} onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })}>{paymentMethods.map((m, idx) => <option key={idx} value={m.name}>{m.name}</option>)}</select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button><Button onClick={handleUpdate}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default SalesHistoryPage;