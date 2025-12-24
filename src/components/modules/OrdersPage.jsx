import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, Search, FileText, Eye, Edit, Trash2, 
  Calendar, Package, Info, ChevronLeft, ChevronRight, Loader2, StickyNote 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { Card, CardContent } from "@/components/ui/card";

const OrdersPage = () => {
  const { branchId } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [products, setProducts] = useState([]);
  
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ pendingARS: 0, pendingUSD: 0 });
  const itemsPerPage = 15;

  const [productSearch, setProductSearch] = useState('');
  const [branchDetails, setBranchDetails] = useState({ name: '', logo_url: '' });

  const [orderForm, setOrderForm] = useState({
    client_name: '', products: [], custom_products: [], 
    currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '' 
  });

  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: '', quantity: 1 });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pagado': return 'bg-green-100 text-green-700';
      case 'Parcial': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-red-100 text-red-700';
    }
  };

  useEffect(() => {
    const fetchBranchInfo = async () => {
      const { data } = await supabase.from('branches').select('name, logo_url').eq('id', branchId).single();
      if (data) setBranchDetails(data);
    };
    if (branchId) fetchBranchInfo();
  }, [branchId]);

  const filteredInventoryProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [products, productSearch]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    let query = supabase.from('orders').select('*', { count: 'exact' }).eq('branch_id', branchId).order('order_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to);
    if (searchTerm) query = query.or(`client_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);
    const { data, count, error } = await query;
    if (!error) { setOrders(data || []); setTotalCount(count || 0); }
    setLoading(false);
  }, [branchId, currentPage, searchTerm, dateFilter]);

  const fetchSummary = useCallback(async () => {
    let query = supabase.from('orders').select('pending_amount, currency').eq('branch_id', branchId);
    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);
    const { data } = await query;
    if (data) {
      const ars = data.filter(o => o.currency === 'ARS').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      const usd = data.filter(o => o.currency === 'USD').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      setSummary({ pendingARS: ars, pendingUSD: usd });
    }
  }, [branchId, dateFilter]);

  useEffect(() => { if (branchId) { fetchOrders(); fetchSummary(); } }, [fetchOrders, fetchSummary]);

  useEffect(() => {
    const getProds = async () => {
      const { data } = await supabase.from('products').select('*').eq('branch_id', branchId);
      if (data) setProducts(data);
    };
    if(branchId) getProds();
  }, [branchId]);

  const calculateTotal = () => {
    const stockTotal = orderForm.products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    const customTotal = orderForm.custom_products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    return stockTotal + customTotal;
  };

  const handleAddStockProduct = () => {
    if (!selectedProduct) return;
    const prod = products.find(p => p.id === selectedProduct);
    if (prod) {
      setOrderForm(prev => ({ ...prev, products: [...prev.products, { id: prod.id, name: prod.name, price: prod.price, quantity: Number(selectedQty), type: 'stock' }] }));
      setSelectedProduct(''); setSelectedQty(1); setProductSearch('');
    }
  };

  const handleAddCustomProduct = () => {
    if (!customProductForm.name || !customProductForm.price || customProductForm.price <= 0) return;
    setOrderForm(prev => ({ ...prev, custom_products: [...prev.custom_products, { ...customProductForm, type: 'custom' }] }));
    setCustomProductForm({ name: '', price: '', quantity: 1 });
  };

  const removeProductFromForm = (index, type) => {
    if (type === 'stock') setOrderForm(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
    else setOrderForm(prev => ({ ...prev, custom_products: prev.custom_products.filter((_, i) => i !== index) }));
  };

  const handleSubmitOrder = async () => {
    if (!orderForm.client_name.trim()) { toast({ title: "Error", description: "Ingresa el nombre del cliente", variant: "destructive" }); return; }
    const total = calculateTotal();
    const pending = total - Number(orderForm.paid_amount);
    let status = pending <= 0 ? 'Pagado' : Number(orderForm.paid_amount) > 0 ? 'Parcial' : 'Pendiente';
    const payload = { ...orderForm, branch_id: branchId, total_amount: total, pending_amount: pending, order_date: `${orderForm.order_date}T12:00:00-03:00`, status: status };
    try {
      if (editingOrder) await supabase.from('orders').update(payload).eq('id', editingOrder.id);
      else await supabase.from('orders').insert([payload]);
      setIsDialogOpen(false); resetForm(); fetchOrders(); fetchSummary();
      toast({ title: editingOrder ? "Pedido actualizado" : "Pedido creado" });
    } catch (error) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setOrderForm({
      ...order,
      order_date: order.order_date.split('T')[0],
      products: order.products || [],
      custom_products: order.custom_products || []
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingOrder(null); setProductSearch('');
    setOrderForm({ client_name: '', products: [], custom_products: [], currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '' });
  };

  const handleShowDetails = (order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  // ✅ GENERACIÓN DE PDF: Solo abrir en pestaña nueva (Sin descarga automática)
  const generatePDF = (order) => {
    const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
    const allProducts = [...(order.products || []), ...(order.custom_products || [])];
    const element = document.createElement('div');
    
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; background: white; width: 750px; margin: 0 auto;">
        
        <div style="text-align: center; margin-bottom: 40px;">
          ${branchDetails.logo_url ? `<img src="${branchDetails.logo_url}" style="max-height: 120px; display: block; margin: 0 auto 15px auto;" />` : ''}
          <h1 style="font-size: 32px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 1px;">${branchDetails.name || 'SUCURSAL'}</h1>
          <p style="font-size: 14px; color: #666; letter-spacing: 2px; margin-top: 10px; font-weight: bold; text-transform: uppercase;">ORDEN DE PEDIDO</p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 2px solid #f0f0f0; padding-bottom: 25px;">
          <div>
            <p style="margin: 5px 0;"><strong style="text-transform: uppercase; color: #555;">CLIENTE:</strong> ${order.client_name}</p>
            <p style="margin: 5px 0;"><strong style="text-transform: uppercase; color: #555;">FECHA:</strong> ${formatDateTime(order.order_date).split(',')[0]}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 5px 0;"><strong style="text-transform: uppercase; color: #555;">ESTADO:</strong> ${order.status.toUpperCase()}</p>
            <p style="margin: 5px 0;"><strong style="text-transform: uppercase; color: #555;">ID:</strong> #${order.id.slice(0,8).toUpperCase()}</p>
          </div>
        </div>

        ${order.notes ? `
          <div style="margin-bottom: 30px; padding: 15px; border: 1px solid #eee; border-radius: 6px; font-size: 13px;">
            <strong style="color: #555;">NOTAS:</strong> <span style="font-style: italic; color: #555;">${order.notes}</span>
          </div>
        ` : ''}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase; font-weight: bold;">DESCRIPCIÓN</th>
              <th style="text-align: center; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase; font-weight: bold;">CANT.</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase; font-weight: bold;">P. UNITARIO</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase; font-weight: bold;">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${allProducts.map(p => `
              <tr>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px;">${p.name}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: center;">${p.quantity}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right;">${currencySymbol}${Number(p.price).toLocaleString('es-AR')}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right; font-weight: bold;">${currencySymbol}${(p.price * p.quantity).toLocaleString('es-AR')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; margin-top: 20px;">
          <div style="width: 250px; font-size: 14px; color: #555; display: flex; justify-content: space-between;">
            <span style="text-transform: uppercase;">ABONADO:</span> <span>${currencySymbol}${Number(order.paid_amount).toLocaleString('es-AR')}</span>
          </div>
          <div style="width: 250px; font-size: 14px; color: #555; display: flex; justify-content: space-between;">
            <span style="text-transform: uppercase;">PENDIENTE:</span> <span>${currencySymbol}${Number(order.pending_amount).toLocaleString('es-AR')}</span>
          </div>
          <div style="width: 280px; border-top: 4px solid #000; margin-top: 15px; padding-top: 15px; display: flex; justify-content: space-between; font-size: 32px; font-weight: 900; color: #000;">
            <span style="text-transform: uppercase;">TOTAL:</span> <span>${currencySymbol}${Number(order.total_amount).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div style="margin-top: 80px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #f0f0f0; padding-top: 20px;">
          Generado digitalmente por sistema de gestión - ${new Date().toLocaleDateString('es-AR')}
        </div>
      </div>
    `;

    const opt = {
      margin: 0,
      filename: `Pedido_${order.client_name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    // ✅ Lógica corregida para SOLO abrir (Sin .save())
    window.html2pdf().from(element).set(opt).output('bloburl').then((url) => {
      window.open(url, '_blank');
    });
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos</h1>
          <p className="text-gray-500 text-sm">Gestiona saldos, señas y notas.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl h-12 px-6 font-bold shadow-lg uppercase text-xs tracking-widest"><Plus className="w-4 h-4 mr-2" /> Nuevo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl">
            <DialogHeader><DialogTitle className="text-2xl font-black">{editingOrder ? 'Editar Pedido' : 'Crear Nuevo Pedido'}</DialogTitle></DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Cliente *</label><Input value={orderForm.client_name} onChange={e => setOrderForm({...orderForm, client_name: e.target.value})} placeholder="Nombre completo" className="rounded-xl h-12" required /></div>
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Fecha</label><Input type="date" value={orderForm.order_date} onChange={e => setOrderForm({...orderForm, order_date: e.target.value})} className="rounded-xl h-12" /></div>
              </div>
              <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Notas</label><textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} placeholder="Detalles extra..." className="w-full min-h-[80px] rounded-xl border border-input p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" /></div>

              <div className="space-y-4 border rounded-2xl p-5 bg-gray-50/50 border-gray-100">
                <h3 className="font-bold text-xs flex items-center gap-2 text-indigo-600 uppercase tracking-widest"><Package className="w-4 h-4" /> Desde Inventario</h3>
                <div className="space-y-3">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Buscar producto..." className="pl-9 rounded-xl h-10 border-gray-200 bg-white" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {filteredInventoryProducts.map(p => <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price)}</option>)}
                    </select>
                    <Input type="number" className="w-24 h-12 rounded-xl font-bold" min="1" value={selectedQty} onChange={e => setSelectedQty(e.target.value)} />
                    <Button onClick={handleAddStockProduct} type="button" variant="secondary" className="h-12 rounded-xl px-6 font-bold">Sumar</Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border rounded-2xl p-5 bg-gray-50/50 border-gray-100">
                <h3 className="font-bold text-xs flex items-center gap-2 text-blue-600 uppercase tracking-widest"><Edit className="w-4 h-4" /> Personalizado</h3>
                <div className="grid grid-cols-12 gap-2">
                  <Input placeholder="Nombre" className="col-span-5 rounded-xl h-12" value={customProductForm.name} onChange={e => setCustomProductForm({...customProductForm, name: e.target.value})} />
                  <Input type="number" placeholder="Precio" className="col-span-3 rounded-xl h-12" value={customProductForm.price} onChange={e => setCustomProductForm({...customProductForm, price: e.target.value})} />
                  <Input type="number" placeholder="Cant" className="col-span-2 rounded-xl h-12" value={customProductForm.quantity} onChange={e => setCustomProductForm({...customProductForm, quantity: e.target.value})} />
                  <Button onClick={handleAddCustomProduct} type="button" variant="secondary" className="col-span-2 h-12 rounded-xl font-bold">Sumar</Button>
                </div>
              </div>

              {(orderForm.products.length > 0 || orderForm.custom_products.length > 0) && (
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">Precio</th><th className="p-3"></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {orderForm.products.map((p, i) => (<tr key={i}><td className="p-3 font-medium">{p.name}</td><td className="p-3 text-center font-bold">{p.quantity}</td><td className="p-3 text-right font-black">{formatCurrency(p.price)}</td><td className="p-3 text-center"><button onClick={() => removeProductFromForm(i, 'stock')} className="text-red-400"><Trash2 className="w-4 h-4" /></button></td></tr>))}
                      {orderForm.custom_products.map((p, i) => (<tr key={i}><td className="p-3 font-medium text-blue-600">{p.name}</td><td className="p-3 text-center font-bold">{p.quantity}</td><td className="p-3 text-right font-black">{formatCurrency(p.price)}</td><td className="p-3 text-center"><button onClick={() => removeProductFromForm(i, 'custom')} className="text-red-400"><Trash2 className="w-4 h-4" /></button></td></tr>))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 bg-indigo-50/30 p-5 rounded-2xl">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Moneda</label><select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500" value={orderForm.currency} onChange={e => setOrderForm({...orderForm, currency: e.target.value})}><option value="ARS">Peso Argentino ($)</option><option value="USD">Dólar (US$)</option></select></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Abonado (Seña)</label><Input type="number" value={orderForm.paid_amount} onFocus={e => e.target.select()} onChange={e => setOrderForm({...orderForm, paid_amount: e.target.value})} className="rounded-xl h-12 bg-white font-bold text-green-600 focus:ring-2 focus:ring-green-500" /></div>
              </div>
              <div className="flex justify-between items-center bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-100"><span className="font-bold opacity-80 uppercase text-xs tracking-widest">Total del Pedido</span><span className="text-3xl font-black">{orderForm.currency === 'USD' ? 'US$' : '$'}{calculateTotal().toLocaleString('es-AR')}</span></div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="font-bold rounded-xl">Cancelar</Button><Button onClick={handleSubmitOrder} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-12 px-8 font-black uppercase text-xs tracking-wider">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 justify-between items-end">
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Buscar</label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Cliente o nota..." className="pl-9 w-full md:w-64 rounded-xl border-gray-200" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Desde</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} /></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Hasta</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} /></div>
             <Button variant="outline" className="rounded-xl h-10 mt-auto font-bold border-gray-200 text-gray-500 uppercase text-[10px]" onClick={() => { setDateFilter({start:'', end:''}); setSearchTerm(''); }}>Limpiar filtros</Button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
             <div className="px-4 py-3 bg-red-50/50 rounded-2xl border border-red-50 text-center"><p className="text-[9px] font-black uppercase text-red-400 tracking-widest">Pendiente ARS</p><p className="text-lg font-black text-red-600">${summary.pendingARS.toLocaleString('es-AR')}</p></div>
             <div className="px-4 py-3 bg-indigo-50/50 rounded-2xl border border-indigo-50 text-center"><p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Pendiente USD</p><p className="text-lg font-black text-indigo-600">US${summary.pendingUSD.toLocaleString('es-AR')}</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-indigo-500"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p className="font-bold uppercase text-[10px] tracking-widest">Cargando...</p></div>
        ) : orders.length === 0 ? (
          <div className="text-center p-20 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-400 flex flex-col items-center"><Package className="w-12 h-12 mb-4 opacity-20" /><p className="font-medium italic">Sin registros.</p></div>
        ) : (
          <>
            {orders.map((order) => {
              const symbol = order.currency === 'USD' ? 'US$' : '$';
              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-indigo-100 transition-all group">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3"><h3 className="text-xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{order.client_name}</h3><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(order.status)}`}>{order.status}</span></div>
                      {order.notes && (<div className="flex items-start gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100 max-md"><StickyNote className="w-3.5 h-3.5 text-amber-500 mt-1 shrink-0" /><p className="text-xs text-gray-600 line-clamp-2 italic">{order.notes}</p></div>)}
                      
                      <div className="flex flex-col gap-1.5 mt-1 border-l-2 border-indigo-50 pl-3">
                        {([...(order.products || []), ...(order.custom_products || [])]).map((p, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-gray-700 text-[13px] font-medium leading-tight">
                            <span className="font-black text-indigo-400">{p.quantity}x</span>
                            <span className="truncate max-w-[300px]">{p.name}</span>
                            <span className="text-gray-400 font-normal text-[11px] whitespace-nowrap">({formatCurrency(p.price)})</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest"><Calendar className="w-3.5 h-3.5" />{formatDateTime(order.order_date).split(',')[0]}</div>
                    </div>
                    
                    <div className="flex flex-col md:items-end justify-between gap-4">
                      <div className="text-right space-y-1">
                        <div className="flex flex-col items-end leading-tight mb-2"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">TOTAL</span><span className="text-4xl font-black text-gray-900 tracking-tighter">{symbol}{Number(order.total_amount).toLocaleString('es-AR')}</span></div>
                        <div className="flex gap-4 justify-end items-center text-[11px] font-bold uppercase tracking-widest">
                           <div className="flex gap-1.5 items-center"><span className="text-green-600 opacity-60">ABONADO</span><span className="text-green-600 text-sm font-black">{symbol}{Number(order.paid_amount).toLocaleString('es-AR')}</span></div>
                           <div className="flex gap-1.5 items-center"><span className="text-red-600 opacity-60">SALDO</span><span className="text-red-600 text-sm font-black">{symbol}{Number(order.pending_amount).toLocaleString('es-AR')}</span></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {/* Botón de la lista también abre sin descargar */}
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-green-50 font-bold" onClick={() => generatePDF(order)}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-indigo-50 font-bold" onClick={() => handleShowDetails(order)}><Eye className="w-4 h-4 mr-2" /> Detalle</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-yellow-50 font-bold" onClick={() => handleEditOrder(order)}><Edit className="w-4 h-4 mr-2" /> Editar</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-red-50 text-red-600 font-bold" onClick={() => { if(confirm("¿Eliminar?")) supabase.from('orders').delete().eq('id', order.id).then(() => fetchOrders()); }}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6">
          <DialogHeader><DialogTitle className="text-2xl font-black">Detalle Pedido</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-2xl flex justify-between border border-gray-100">
                <div><p className="text-[10px] text-gray-400 font-black uppercase">Cliente</p><p className="font-black text-lg">{selectedOrder.client_name}</p></div>
                <div className="text-right"><p className="text-[10px] text-gray-400 font-black uppercase">Estado</p><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(selectedOrder.status)}`}>{selectedOrder.status}</span></div>
              </div>
              <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 font-black text-[10px] uppercase text-gray-400"><tr><th className="p-4 text-left">Ítem</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">{[...(selectedOrder.products || []), ...(selectedOrder.custom_products || [])].map((p, i) => (
                    <tr key={i}><td className="p-4 font-bold text-gray-700">{p.name}</td><td className="p-4 text-center font-bold text-gray-600">{p.quantity}</td><td className="p-4 text-right font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{(p.price * p.quantity).toLocaleString('es-AR')}</td></tr>))}</tbody>
                </table>
              </div>
              <div className="bg-indigo-600 p-6 rounded-2xl text-white flex justify-between items-center shadow-lg">
                <span className="font-bold opacity-80 uppercase text-xs">Saldo a cobrar:</span>
                <span className="text-3xl font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(selectedOrder.pending_amount).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
          <DialogFooter><Button className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl h-12 font-bold shadow-md" onClick={() => generatePDF(selectedOrder)}><FileText className="w-4 h-4 mr-2" /> Abrir PDF</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;