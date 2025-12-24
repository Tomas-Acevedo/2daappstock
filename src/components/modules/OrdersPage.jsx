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

  // ✅ Función para colores de estados (Restaurada para fijar el error)
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
    let query = supabase.from('orders').select('pending_amount, currency, client_name, notes, order_date').eq('branch_id', branchId);
    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);
    if (searchTerm) query = query.or(`client_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
    const { data } = await query;
    if (data) {
      const ars = data.filter(o => o.currency === 'ARS').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      const usd = data.filter(o => o.currency === 'USD').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      setSummary({ pendingARS: ars, pendingUSD: usd });
    }
  }, [branchId, dateFilter, searchTerm]);

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
      toast({ title: "Guardado exitoso" });
    } catch (error) { toast({ title: "Error", variant: "destructive" }); }
  };

  const resetForm = () => {
    setEditingOrder(null); setProductSearch('');
    setOrderForm({ client_name: '', products: [], custom_products: [], currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '' });
  };

  const handleShowDetails = (order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  // ✅ GENERACIÓN DE PDF REAL (DESCARGABLE)
  const generatePDF = (order) => {
    const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
    const allProducts = [...(order.products || []), ...(order.custom_products || [])];
    const element = document.createElement('div');
    
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; background: white; width: 700px;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f0f0f0; padding-bottom: 20px;">
          ${branchDetails.logo_url ? `<img src="${branchDetails.logo_url}" style="max-height: 80px; margin-bottom: 15px;" />` : ''}
          <h1 style="font-size: 24px; font-weight: 900; margin: 0; text-transform: uppercase;">${branchDetails.name || 'Sucursal'}</h1>
          <p style="font-size: 12px; color: #666; letter-spacing: 2px; margin-top: 5px; font-weight: bold;">ORDEN DE PEDIDO</p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 13px;">
          <div>
            <p style="margin: 4px 0;"><strong>CLIENTE:</strong> ${order.client_name}</p>
            <p style="margin: 4px 0;"><strong>FECHA:</strong> ${formatDateTime(order.order_date).split(',')[0]}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 4px 0;"><strong>ESTADO:</strong> ${order.status.toUpperCase()}</p>
            <p style="margin: 4px 0;"><strong>ID PEDIDO:</strong> #${order.id.slice(0,8).toUpperCase()}</p>
          </div>
        </div>

        ${order.notes ? `<div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border: 1px solid #eee; border-radius: 8px; font-size: 12px; font-style: italic;"><strong>NOTAS:</strong> ${order.notes}</div>` : ''}

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b;">DESCRIPCIÓN</th>
              <th style="text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b;">CANT.</th>
              <th style="text-align: right; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b;">UNITARIO</th>
              <th style="text-align: right; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 11px; color: #64748b;">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${allProducts.map(p => `
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px;">${p.name}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: center;">${p.quantity}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: right;">${currencySymbol}${Number(p.price).toLocaleString('es-AR')}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: right; font-weight: bold;">${currencySymbol}${(p.price * p.quantity).toLocaleString('es-AR')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
          <div style="width: 250px; font-size: 14px; color: #16a34a; display: flex; justify-content: space-between;">
            <span>Abonado:</span> <span>${currencySymbol}${Number(order.paid_amount).toLocaleString('es-AR')}</span>
          </div>
          <div style="width: 250px; font-size: 14px; color: #dc2626; display: flex; justify-content: space-between; font-weight: bold;">
            <span>Pendiente:</span> <span>${currencySymbol}${Number(order.pending_amount).toLocaleString('es-AR')}</span>
          </div>
          <div style="width: 250px; border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; display: flex; justify-content: space-between; font-size: 24px; font-weight: 900;">
            <span>TOTAL:</span> <span>${currencySymbol}${Number(order.total_amount).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div style="margin-top: 60px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          Generado por Sistema de Gestión - ${branchDetails.name} - ${new Date().toLocaleDateString('es-AR')}
        </div>
      </div>
    `;

    const opt = {
      margin: 0,
      filename: `Pedido_${order.client_name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    window.html2pdf().from(element).set(opt).save();
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos</h1>
          <p className="text-gray-500 text-sm">Gestiona saldos y notas.</p>
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
              <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Notas</label><textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} placeholder="Detalles extra..." className="w-full min-h-[80px] rounded-xl border border-input p-3 text-sm outline-none" /></div>

              <div className="space-y-4 border rounded-2xl p-5 bg-gray-50/50 border-gray-100">
                <h3 className="font-bold text-xs flex items-center gap-2 text-indigo-600 uppercase tracking-widest"><Package className="w-4 h-4" /> Desde Inventario</h3>
                <div className="space-y-3">
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Buscar producto..." className="pl-9 rounded-xl h-10 border-gray-200 bg-white" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></div>
                  <div className="flex gap-2">
                    <select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 text-sm font-bold" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
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
                <select className="h-12 w-full rounded-xl border bg-white px-3 font-bold" value={orderForm.currency} onChange={e => setOrderForm({...orderForm, currency: e.target.value})}><option value="ARS">Peso ($)</option><option value="USD">Dólar (US$)</option></select>
                <Input type="number" value={orderForm.paid_amount} onChange={e => setOrderForm({...orderForm, paid_amount: e.target.value})} className="rounded-xl h-12 bg-white font-bold" />
              </div>
              <div className="flex justify-between items-center bg-indigo-600 p-6 rounded-2xl text-white shadow-xl"><span className="font-bold opacity-80 uppercase text-xs">Total</span><span className="text-3xl font-black">{orderForm.currency === 'USD' ? 'US$' : '$'}{calculateTotal().toLocaleString('es-AR')}</span></div>
            </div>
            <DialogFooter><Button onClick={handleSubmitOrder} className="bg-indigo-600 rounded-xl h-12 px-8 font-black uppercase text-xs">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-gray-100 rounded-3xl overflow-hidden">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 justify-between items-end">
          <div className="flex flex-wrap gap-4">
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Buscar</label><Input placeholder="Cliente..." className="w-64 rounded-xl" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Desde</label><Input type="date" className="w-44 rounded-xl" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} /></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Hasta</label><Input type="date" className="w-44 rounded-xl" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} /></div>
          </div>
          <div className="flex gap-3">
             <div className="px-4 py-3 bg-red-50/50 rounded-2xl text-center"><p className="text-[9px] font-black uppercase text-red-400">Pendiente ARS</p><p className="text-lg font-black text-red-600">${summary.pendingARS.toLocaleString('es-AR')}</p></div>
             <div className="px-4 py-3 bg-indigo-50/50 rounded-2xl text-center"><p className="text-[9px] font-black uppercase text-indigo-400">Pendiente USD</p><p className="text-lg font-black text-indigo-600">US${summary.pendingUSD.toLocaleString('es-AR')}</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-indigo-500"><Loader2 className="w-10 h-10 animate-spin" /></div>
        ) : orders.map((order) => {
          const symbol = order.currency === 'USD' ? 'US$' : '$';
          return (
            <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-sm border hover:border-indigo-100 transition-all">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3"><h3 className="text-xl font-black text-gray-900">{order.client_name}</h3><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(order.status)}`}>{order.status}</span></div>
                  {order.notes && (<div className="flex gap-2 bg-gray-50 p-2 rounded-lg border italic text-xs text-gray-600"><StickyNote className="w-3.5 h-3.5" />{order.notes}</div>)}
                  <div className="flex flex-col gap-1 border-l-2 border-indigo-50 pl-3">
                    {([...(order.products || []), ...(order.custom_products || [])]).map((p, idx) => (
                      <div key={idx} className="text-[13px] font-medium"><span className="font-black text-indigo-400">{p.quantity}x</span> {p.name}</div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col md:items-end justify-between gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Total</p>
                    <p className="text-3xl font-black text-gray-900">{symbol}{Number(order.total_amount).toLocaleString('es-AR')}</p>
                    <div className="text-[11px] font-black flex gap-3 mt-1">
                      <span className="text-green-600">Abonado: {symbol}{Number(order.paid_amount).toLocaleString('es-AR')}</span>
                      <span className="text-red-600">Saldo: {symbol}{Number(order.pending_amount).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="rounded-xl hover:bg-green-50 font-bold" onClick={() => generatePDF(order)}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
                    <Button size="sm" variant="ghost" className="rounded-xl hover:bg-indigo-50 font-bold" onClick={() => handleShowDetails(order)}><Eye className="w-4 h-4 mr-2" /> Detalle</Button>
                    <Button size="sm" variant="ghost" className="rounded-xl hover:bg-red-50 text-red-600 font-bold" onClick={() => { if(confirm("¿Eliminar?")) supabase.from('orders').delete().eq('id', order.id).then(() => fetchOrders()); }}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 pt-6 pb-10">
            <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-xl h-10 w-10 p-0"><ChevronLeft className="w-5 h-5" /></Button>
            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">Pág. {currentPage} / {totalPages}</span>
            <Button variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="rounded-xl h-10 w-10 p-0"><ChevronRight className="w-5 h-5" /></Button>
          </div>
        )}
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6">
          <DialogHeader><DialogTitle className="text-2xl font-black">Detalle Pedido</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-2xl flex justify-between">
                <div><p className="text-[10px] text-gray-400 font-black uppercase">Cliente</p><p className="font-black text-lg">{selectedOrder.client_name}</p></div>
                <div className="text-right"><p className="text-[10px] text-gray-400 font-black uppercase">Estado</p><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(selectedOrder.status)}`}>{selectedOrder.status}</span></div>
              </div>
              <div className="border rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 font-black text-[10px] uppercase text-gray-400"><tr><th className="p-4 text-left">Ítem</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y">{[...(selectedOrder.products || []), ...(selectedOrder.custom_products || [])].map((p, i) => (
                    <tr key={i}><td className="p-4 font-bold">{p.name}</td><td className="p-4 text-center">{p.quantity}</td><td className="p-4 text-right font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{(p.price * p.quantity).toLocaleString('es-AR')}</td></tr>))}</tbody>
                </table>
              </div>
              <div className="bg-indigo-600 p-6 rounded-2xl text-white flex justify-between items-center">
                <span className="font-bold opacity-80 uppercase text-xs">A cobrar:</span>
                <span className="text-3xl font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(selectedOrder.pending_amount).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
          <DialogFooter><Button className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl font-bold" onClick={() => generatePDF(selectedOrder)}><FileText className="w-4 h-4 mr-2" /> Descargar PDF</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;