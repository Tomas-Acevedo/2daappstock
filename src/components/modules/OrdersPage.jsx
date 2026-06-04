import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, FileText, Eye, Edit, Trash2, 
  Calendar, Package, Info, Loader2, StickyNote, ShieldCheck, Wrench
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { Card, CardContent } from "@/components/ui/card";

import { useOffline } from "@/contexts/OfflineContext";
import {
  cacheOrders,
  getOrdersOffline,
  computeOrdersSummaryOffline,
  upsertLocalOrder,
  deleteLocalOrder,
  enqueueAction,
  initOfflineDb,
} from "@/lib/offlineDb";

const CHECKLIST_ITEMS = [
  { id: 'proximity', label: 'Sensor de proximidad' },
  { id: 'charging', label: 'Carga' },
  { id: 'screen', label: 'Pantalla' },
  { id: 'speaker', label: 'Parlante' },
  { id: 'microphone', label: 'Micrófono' },
  { id: 'cameras', label: 'Cámaras' },
  { id: 'buttons', label: 'Botones (vol/power)' },
  { id: 'flashlight', label: 'Linterna' },
  { id: 'signal', label: 'Señal' },
  { id: 'biometrics', label: 'Huella / FaceID' }
];

const OrdersPage = () => {
  const { branchId } = useParams();
  const { online, syncing } = useOffline();

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
  const [branchDetails, setBranchDetails] = useState({ name: '', logo_url: '', address: '', tel: '' });

  const defaultChecklist = CHECKLIST_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: false }), {});

  const [orderForm, setOrderForm] = useState({
    client_name: '', products: [], custom_products: [], 
    currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '',
    metadata: {
      has_warranty: false,
      warranty_days: 30,       // ← NUEVO: días de garantía, default 30
      is_repair: false,
      checklist: defaultChecklist
    }
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

  const handleChecklistChange = (id) => {
    setOrderForm(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        checklist: {
          ...prev.metadata.checklist,
          [id]: !prev.metadata.checklist?.[id]
        }
      }
    }));
  };

  const handleWarrantyToggle = () => {
    setOrderForm(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        has_warranty: !prev.metadata?.has_warranty,
        // Al activar garantía, si no hay días seteados usar 30 por defecto
        warranty_days: prev.metadata?.warranty_days || 30
      }
    }));
  };

  // ← NUEVO: manejador para cambiar días de garantía
  const handleWarrantyDaysChange = (value) => {
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1) return;
    setOrderForm(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        warranty_days: days
      }
    }));
  };

  const handleRepairToggle = () => {
    setOrderForm(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        is_repair: !prev.metadata?.is_repair
      }
    }));
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      if (!online) {
        await initOfflineDb();
        const { rows, totalCount: count } = await getOrdersOffline({
          branchId,
          currentPage,
          itemsPerPage,
          searchTerm,
          dateFilter,
        });
        setOrders(rows || []);
        setTotalCount(count || 0);
        return;
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("orders")
        .select("*", { count: "exact" })
        .eq("branch_id", branchId)
        .order("order_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (searchTerm) query = query.or(`client_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
      if (dateFilter.start) query = query.gte("order_date", `${dateFilter.start}T00:00:00-03:00`);
      if (dateFilter.end) query = query.lte("order_date", `${dateFilter.end}T23:59:59-03:00`);

      const { data, count, error } = await query;
      if (!error) {
        setOrders(data || []);
        setTotalCount(count || 0);
        if (data) await cacheOrders(data);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, currentPage, itemsPerPage, searchTerm, dateFilter, online]);

  const fetchSummary = useCallback(async () => {
    try {
      if (!online) {
        const res = await computeOrdersSummaryOffline({ branchId, dateFilter });
        setSummary(res);
        return;
      }

      let query = supabase.from("orders").select("pending_amount, currency").eq("branch_id", branchId);
      if (dateFilter.start) query = query.gte("order_date", `${dateFilter.start}T00:00:00-03:00`);
      if (dateFilter.end) query = query.lte("order_date", `${dateFilter.end}T23:59:59-03:00`);

      const { data } = await query;
      if (data) {
        const ars = data.filter(o => o.currency === "ARS").reduce((acc, o) => acc + Number(o.pending_amount || 0), 0);
        const usd = data.filter(o => o.currency === "USD").reduce((acc, o) => acc + Number(o.pending_amount || 0), 0);
        setSummary({ pendingARS: ars, pendingUSD: usd });
      }
    } catch (e) {
      console.error(e);
    }
  }, [branchId, dateFilter, online]);

  useEffect(() => {
    const fetchBranchInfo = async () => {
      const { data } = await supabase.from('branches').select('name, logo_url, address, tel').eq('id', branchId).single();
      if (data) setBranchDetails(data);
    };
    if (branchId) fetchBranchInfo();
  }, [branchId]);

  useEffect(() => { if (branchId) { fetchOrders(); fetchSummary(); } }, [fetchOrders, fetchSummary]);

  useEffect(() => {
    if (!branchId || !online) return;
    const channel = supabase
      .channel(`realtime:orders:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, () => {
        fetchOrders(); fetchSummary();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, online, fetchOrders, fetchSummary]);

  useEffect(() => {
    const h = () => { fetchOrders(); fetchSummary(); };
    window.addEventListener("orders:refresh", h);
    return () => window.removeEventListener("orders:refresh", h);
  }, [fetchOrders, fetchSummary]);

  useEffect(() => {
    const getProds = async () => {
      const { data } = await supabase.from('products').select('*').eq('branch_id', branchId);
      if (data) setProducts(data);
    };
    if(branchId) getProds();
  }, [branchId]);

  const filteredInventoryProducts = useMemo(() => {
    return products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [products, productSearch]);

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
    if (!orderForm.client_name.trim()) {
      toast({ title: "Error", description: "Ingresa el nombre del cliente", variant: "destructive" });
      return;
    }

    // ← NUEVO: validación — si hay garantía, debe tener días
    if (orderForm.metadata?.has_warranty && (!orderForm.metadata?.warranty_days || orderForm.metadata.warranty_days < 1)) {
      toast({ title: "Error", description: "Ingresá la cantidad de días de garantía", variant: "destructive" });
      return;
    }

    const total = calculateTotal();
    const pending = total - Number(orderForm.paid_amount);
    const status = pending <= 0 ? "Pagado" : Number(orderForm.paid_amount) > 0 ? "Parcial" : "Pendiente";

    const payload = {
      client_name: orderForm.client_name.trim(),
      products: orderForm.products,
      custom_products: orderForm.custom_products,
      currency: orderForm.currency,
      paid_amount: Number(orderForm.paid_amount) || 0,
      notes: orderForm.notes ? orderForm.notes.trim() : '',
      metadata: {
        has_warranty: !!orderForm.metadata?.has_warranty,
        warranty_days: orderForm.metadata?.has_warranty ? (orderForm.metadata?.warranty_days || 30) : null, // ← NUEVO
        is_repair: !!orderForm.metadata?.is_repair,
        checklist: orderForm.metadata?.is_repair ? (orderForm.metadata?.checklist || defaultChecklist) : defaultChecklist
      },
      branch_id: branchId,
      total_amount: total,
      pending_amount: pending,
      order_date: `${orderForm.order_date}T12:00:00-03:00`,
      status,
    };

    try {
      if (online) {
        if (editingOrder) {
          await supabase.from("orders").update(payload).eq("id", editingOrder.id);
        } else {
          await supabase.from("orders").insert([payload]);
        }
        toast({ title: editingOrder ? "Pedido actualizado" : "Pedido creado" });
      } else {
        const localId = editingOrder?.id && String(editingOrder.id).startsWith("local-")
          ? editingOrder.id
          : editingOrder ? editingOrder.id : `local-${crypto.randomUUID()}`;

        const offlineOrder = {
          id: localId,
          ...payload,
          created_at: editingOrder?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await upsertLocalOrder(offlineOrder);

        if (editingOrder) {
          await enqueueAction({ type: "order:update", payload: { id: localId, patch: payload } });
          toast({ title: "Pedido actualizado (offline)" });
        } else {
          await enqueueAction({ type: "order:create", payload: { _local_id: localId, ...payload } });
          toast({ title: "Pedido creado (offline)" });
        }
      }

      setIsDialogOpen(false);
      resetForm();
      fetchOrders();
      fetchSummary();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setOrderForm({
      client_name: order.client_name,
      products: order.products || [],
      custom_products: order.custom_products || [] ,
      currency: order.currency || 'ARS',
      paid_amount: order.paid_amount || 0,
      notes: order.notes || '',
      order_date: order.order_date ? order.order_date.split('T')[0] : getArgentinaDate(),
      metadata: order.metadata ? {
        has_warranty: !!order.metadata.has_warranty,
        warranty_days: order.metadata.warranty_days || 30, // ← NUEVO
        is_repair: !!order.metadata.is_repair,
        checklist: order.metadata.checklist || defaultChecklist
      } : { has_warranty: false, warranty_days: 30, is_repair: false, checklist: defaultChecklist }
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingOrder(null); 
    setProductSearch('');
    setOrderForm({ 
      client_name: '', 
      products: [], 
      custom_products: [], 
      currency: 'ARS', 
      paid_amount: 0, 
      order_date: getArgentinaDate(), 
      notes: '',
      metadata: { has_warranty: false, warranty_days: 30, is_repair: false, checklist: defaultChecklist } // ← NUEVO
    });
  };

  const handleShowDetails = (order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const generatePDF = (order) => {
    if (!online) {
      toast({ title: "Offline", description: "Debes estar online para generar el PDF", variant: "destructive" });
      return;
    }

    const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
    const allProducts = [...(order.products || []), ...(order.custom_products || [])];
    const orderMetadata = order.metadata || {};
    const hasWarranty = !!orderMetadata.has_warranty;
    const isRepair = !!orderMetadata.is_repair;
    const orderChecklist = orderMetadata.checklist || {};
    // ← NUEVO: leer días de garantía del pedido, fallback a 30
    const warrantyDays = orderMetadata.warranty_days || 30;

    const half = Math.ceil(CHECKLIST_ITEMS.length / 2);
    const checklistLeft  = CHECKLIST_ITEMS.slice(0, half);
    const checklistRight = CHECKLIST_ITEMS.slice(half);
    const checklistRows = checklistLeft.map((itemL, i) => {
      const itemR    = checklistRight[i];
      const okL      = !!orderChecklist[itemL.id];
      const okR      = itemR ? !!orderChecklist[itemR.id] : null;
      const badge    = (ok) => `<span style="font-weight:900;font-size:10px;text-transform:uppercase;color:${ok ? '#16a34a' : '#dc2626'};">${ok ? '✓ FUNCIONA' : '✗ NO FUNCIONA'}</span>`;
      const td       = 'padding:5px 6px;border-bottom:1px dashed #e2e8f0;font-size:11px;';
      return `<tr>
        <td style="${td}color:#475569;font-weight:500;width:30%;">${itemL.label}</td>
        <td style="${td}width:20%;">${badge(okL)}</td>
        <td style="${td}color:#475569;font-weight:500;width:30%;padding-left:18px;">${itemR ? itemR.label : ''}</td>
        <td style="${td}width:20%;">${itemR ? badge(okR) : ''}</td>
      </tr>`;
    }).join('');

    const element = document.createElement('div');
    element.innerHTML = `
      <div id="pdf-container" style="font-family:Arial,sans-serif;padding:36px 44px 60px 44px;color:#333;background:white;width:750px;margin:0 auto;box-sizing:border-box;min-height:980px;display:flex;flex-direction:column;justify-content:navigator;">
        
        <div>
          <div style="text-align:center;margin-bottom:22px;">
            ${branchDetails.logo_url ? `<img src="${branchDetails.logo_url}" style="max-height:80px;display:block;margin:0 auto 10px auto;" />` : ''}
            <h1 style="font-size:26px;font-weight:900;margin:0;text-transform:uppercase;letter-spacing:1px;">${branchDetails.name || 'SUCURSAL'}</h1>
            <p style="font-size:12px;color:#666;letter-spacing:2px;margin:6px 0 0;font-weight:bold;text-transform:uppercase;">
              ${isRepair ? 'ORDEN DE PEDIDO Y SERVICIO TÉCNICO' : 'COMPROBANTE DE PEDIDO / VENTA'}
            </p>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:13px;padding-bottom:14px;margin-bottom:16px;border-bottom:2px solid #f0f0f0;">
            <tr>
              <td style="vertical-align:top;width:50%;padding-bottom:10px;">
                <p style="margin:3px 0;"><strong style="text-transform:uppercase;color:#555;">CLIENTE:</strong> ${order.client_name}</p>
                <p style="margin:3px 0;"><strong style="text-transform:uppercase;color:#555;">FECHA:</strong> ${formatDateTime(order.order_date).split(',')[0]}</p>
              </td>
              <td style="vertical-align:top;width:50%;text-align:right;padding-bottom:10px;">
                <p style="margin:3px 0;"><strong style="text-transform:uppercase;color:#555;">DIRECCIÓN:</strong> ${branchDetails.address || 'No disponible'}</p>
                <p style="margin:3px 0;"><strong style="text-transform:uppercase;color:#555;">WHATSAPP:</strong> ${branchDetails.tel || 'No disponible'}</p>
              </td>
            </tr>
          </table>

          ${order.notes && order.notes.trim() !== '' ? `
            <div style="margin-bottom:16px;padding:11px 13px;border:1px solid #eee;border-radius:8px;font-size:12px;background:#fafafa;">
              <strong style="color:#555;">NOTAS DE INGRESO:</strong>
              <span style="font-style:italic;color:#333;"> ${order.notes}</span>
            </div>
          ` : ''}

          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="text-align:left;padding:8px 6px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#888;text-transform:uppercase;font-weight:bold;">DESCRIPCIÓN</th>
                <th style="text-align:center;padding:8px 6px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#888;text-transform:uppercase;font-weight:bold;width:55px;">CANT.</th>
                <th style="text-align:right;padding:8px 6px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#888;text-transform:uppercase;font-weight:bold;width:110px;">P. UNITARIO</th>
                <th style="text-align:right;padding:8px 6px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#888;text-transform:uppercase;font-weight:bold;width:110px;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${allProducts.map(p => `
                <tr>
                  <td style="padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;">${p.name}</td>
                  <td style="padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:center;">${p.quantity}</td>
                  <td style="padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;">${currencySymbol}${Number(p.price).toLocaleString('es-AR')}</td>
                  <td style="padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;text-align:right;font-weight:bold;">${currencySymbol}${(p.price * p.quantity).toLocaleString('es-AR')}</td>
                </tr>`).join('')}
            </tbody>
          </table>

          ${isRepair ? `
            <div style="margin-bottom:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
              <p style="margin:0 0 10px 0;font-size:12px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">ESTADO DE COMPONENTES AL INGRESO</p>
              <table style="width:100%;border-collapse:collapse;">
                <tbody>${checklistRows}</tbody>
              </table>
            </div>
          ` : ''}

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border-top:1px solid #e2e8f0;padding-top:4px;">
            <tr>
              <td style="font-size:13px;color:#555;font-weight:bold;text-transform:uppercase;padding:6px 0;text-align:right;padding-right:12px;">ABONADO:</td>
              <td style="font-size:13px;font-weight:bold;color:#16a34a;text-align:right;padding:6px 0;width:130px;">${currencySymbol}${Number(order.paid_amount).toLocaleString('es-AR')}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#555;font-weight:bold;text-transform:uppercase;padding:6px 0;text-align:right;padding-right:12px;">PENDIENTE:</td>
              <td style="font-size:13px;font-weight:bold;color:#dc2626;text-align:right;padding:6px 0;">${currencySymbol}${Number(order.pending_amount).toLocaleString('es-AR')}</td>
            </tr>
            <tr>
              <td style="border-top:3px solid #1e293b;padding-top:6px;font-size:20px;font-weight:900;color:#000;text-transform:uppercase;text-align:right;padding-right:12px;">TOTAL:</td>
              <td style="border-top:3px solid #1e293b;padding-top:6px;font-size:20px;font-weight:900;color:#000;text-align:right;">${currencySymbol}${Number(order.total_amount).toLocaleString('es-AR')}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top:auto; padding-top:20px;">
          ${hasWarranty ? `
            <div style="border-left:4px solid #16a34a;background:#f0fdf4;padding:14px;border-radius:0 8px 8px 0;margin-bottom:12px;clear:both;">
              <p style="margin:0 0 6px 0;font-size:12px;font-weight:900;color:#16a34a;text-transform:uppercase;letter-spacing:0.3px;">✓ GARANTÍA INCLUIDA</p>
              <p style="margin:0;font-size:11px;color:#14532d;line-height:1.55;">Este servicio técnico cuenta con una cobertura de <strong>garantía de ${warrantyDays} días</strong> exclusivamente sobre la reparación efectuada. No cubre golpes, humedad o manipulación de terceros.</p>
            </div>
          ` : ''}
          
          ${isRepair ? `
            <div style="border-left:4px solid #94a3b8;background:#f8fafc;padding:14px;border-radius:0 8px 8px 0;clear:both;">
              <p style="margin:0;font-size:11px;color:#64748b;line-height:1.55;font-style:italic;">Todo equipo que ingrese apagado, sin encender o sin posibilidad de prueba, será recibido sin verificación funcional previa. CELUX no se responsabiliza por fallas preexistentes que puedan manifestarse luego de la reparación.</p>
            </div>
          ` : ''}
        </div>

      </div>
    `;

    const opt = {
      margin: [0.25, 0.25, 0.25, 0.25],
      filename: isRepair
        ? `Servicio_Tecnico_${order.client_name.replace(/\s+/g, '_')}.pdf`
        : `Nota_Venta_${order.client_name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' },
    };

    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) pdfWindow.document.write('<title>Generando...</title><body>Cargando...</body>');

    window.html2pdf().from(element).set(opt).toPdf().get('pdf').then((pdf) => {
      const blob = pdf.output('blob');
      const fileURL = URL.createObjectURL(blob);
      if (pdfWindow) pdfWindow.location.href = fileURL;
      else window.open(fileURL, '_blank');
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos</h1>
          <p className="text-gray-500 text-sm">Gestiona saldos, señas y notas.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button disabled={syncing} className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl h-12 px-6 font-bold shadow-lg uppercase text-xs tracking-widest">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Pedido
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl">
            <DialogHeader><DialogTitle className="text-2xl font-black">{editingOrder ? 'Editar Pedido' : 'Crear Nuevo Pedido'}</DialogTitle></DialogHeader>
            <div className="grid gap-6 py-4">
              
              {/* SECCIÓN SWITCHES CONFIGURACIÓN (GARANTÍA Y REPARACIÓN) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Switch Garantía */}
                <div className={`flex flex-col gap-3 p-4 bg-emerald-50/60 rounded-2xl border ${orderForm.metadata?.has_warranty ? 'border-emerald-300' : 'border-emerald-100'} transition-colors`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">Garantía</h4>
                        <p className="text-[10px] text-emerald-700">Bloque legal en el PDF.</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={handleWarrantyToggle}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${orderForm.metadata?.has_warranty ? 'bg-emerald-600' : 'bg-gray-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${orderForm.metadata?.has_warranty ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {/* ← NUEVO: Input de días, visible sólo cuando garantía está activa */}
                  <AnimatePresence>
                    {orderForm.metadata?.has_warranty && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 bg-white rounded-xl border border-emerald-200 px-3 py-2">
                          <label className="text-[10px] font-black uppercase text-emerald-700 whitespace-nowrap">Días de garantía</label>
                          <Input
                            type="number"
                            min="1"
                            value={orderForm.metadata?.warranty_days || 30}
                            onChange={e => handleWarrantyDaysChange(e.target.value)}
                            className="h-8 w-20 rounded-lg border-emerald-200 font-black text-emerald-800 text-center focus:ring-emerald-400"
                          />
                          <span className="text-[10px] text-emerald-600 font-bold">días</span>
                        </div>
                        <p className="text-[10px] text-emerald-600 mt-1.5 px-1 italic">
                          El PDF dirá: "garantía de <strong>{orderForm.metadata?.warranty_days || 30} días</strong>"
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Switch Reparación */}
                <div className="flex items-center justify-between p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-2.5">
                    <Wrench className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wide">Es Reparación</h4>
                      <p className="text-[10px] text-indigo-700">Habilita checklist de ingreso.</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={handleRepairToggle}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${orderForm.metadata?.is_repair ? 'bg-indigo-600' : 'bg-gray-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${orderForm.metadata?.is_repair ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Cliente *</label><Input value={orderForm.client_name} onChange={e => setOrderForm({...orderForm, client_name: e.target.value})} placeholder="Nombre completo" className="rounded-xl h-12" required /></div>
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Fecha</label><Input type="date" value={orderForm.order_date} onChange={e => setOrderForm({...orderForm, order_date: e.target.value})} className="rounded-xl h-12" /></div>
              </div>
              <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Notas</label><textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} placeholder="Detalles extra..." className="w-full min-h-[80px] rounded-xl border border-input p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" /></div>

              <AnimatePresence>
                {orderForm.metadata?.is_repair && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 border rounded-2xl p-5 bg-slate-50/50 border-slate-100 overflow-hidden"
                  >
                    <h3 className="font-bold text-xs flex items-center gap-2 text-slate-700 uppercase tracking-widest"><Wrench className="w-4 h-4" /> Diagnóstico Inicial Técnico</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {CHECKLIST_ITEMS.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 shadow-sm">
                          <span className="text-xs font-bold text-gray-600">{item.label}</span>
                          <button 
                            type="button"
                            onClick={() => handleChecklistChange(item.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${orderForm.metadata?.checklist?.[item.id] ? 'bg-indigo-600' : 'bg-gray-200'}`}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${orderForm.metadata?.checklist?.[item.id] ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Moneda</label><select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold" value={orderForm.currency} onChange={e => setOrderForm({...orderForm, currency: e.target.value})}><option value="ARS">ARS ($)</option><option value="USD">USD (US$)</option></select></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Abonado</label><Input type="number" value={orderForm.paid_amount} onFocus={e => e.target.select()} onChange={e => setOrderForm({...orderForm, paid_amount: e.target.value})} className="rounded-xl h-12 font-bold text-green-600" /></div>
              </div>
              <div className="flex justify-between items-center bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-100"><span className="font-bold uppercase text-xs tracking-widest">Total</span><span className="text-3xl font-black">{orderForm.currency === 'USD' ? 'US$' : '$'}{calculateTotal().toLocaleString('es-AR')}</span></div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancelar</Button><Button disabled={syncing} onClick={handleSubmitOrder} className="bg-indigo-600 rounded-xl h-12 px-8 font-black uppercase text-xs">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 justify-between items-end">
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Buscar</label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Cliente o nota..." className="pl-9 w-full md:w-64 rounded-xl border-gray-200" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Desde</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} /></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Hasta</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} /></div>
             <Button variant="outline" className="rounded-xl h-10 mt-auto font-bold uppercase text-[10px]" onClick={() => { setDateFilter({start:'', end:''}); setSearchTerm(''); }}>Limpiar</Button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
             <div className="px-4 py-3 bg-red-50/50 rounded-2xl border border-red-50 text-center"><p className="text-[9px] font-black uppercase text-red-400">Saldo ARS</p><p className="text-lg font-black text-red-600">${summary.pendingARS.toLocaleString('es-AR')}</p></div>
             <div className="px-4 py-3 bg-indigo-50/50 rounded-2xl border border-indigo-50 text-center"><p className="text-[9px] font-black uppercase text-indigo-400">Saldo USD</p><p className="text-lg font-black text-indigo-600">US${summary.pendingUSD.toLocaleString('es-AR')}</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-indigo-500"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p className="font-bold uppercase text-[10px]">Cargando...</p></div>
        ) : orders.length === 0 ? (
          <div className="text-center p-20 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-400 flex flex-col items-center"><Package className="w-12 h-12 mb-4 opacity-20" /><p className="font-medium italic">Sin registros.</p></div>
        ) : (
          orders.map((order) => {
            const symbol = order.currency === 'USD' ? 'US$' : '$';
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-indigo-100 transition-all group">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{order.client_name}</h3>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(order.status)}`}>{order.status}</span>
                      {order.metadata?.is_repair && (
                        <span className="bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1"><Wrench className="w-3 h-3" /> Reparación</span>
                      )}
                      {order.metadata?.has_warranty && (
                        <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Garantía {order.metadata?.warranty_days || 30}d {/* ← NUEVO: muestra días */}
                        </span>
                      )}
                    </div>
                    {order.notes && (<div className="flex items-start gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100"><StickyNote className="w-3.5 h-3.5 text-amber-500 mt-1 shrink-0" /><p className="text-xs text-gray-600 line-clamp-2 italic">{order.notes}</p></div>)}
                    
                    <div className="flex flex-col gap-1.5 mt-1 border-l-2 border-indigo-50 pl-3">
                      {([...(order.products || []), ...(order.custom_products || [])]).map((p, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-gray-700 text-[13px] font-medium leading-tight">
                          <span className="font-black text-indigo-400">{p.quantity}x</span>
                          <span className="truncate max-w-[300px]">{p.name}</span>
                          <span className="text-gray-400 font-normal text-[11px]">({formatCurrency(p.price)})</span>
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
                      <Button size="sm" variant="ghost" className="rounded-xl hover:bg-green-50 font-bold" onClick={() => generatePDF(order)} disabled={!online}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
                      <Button size="sm" variant="ghost" className="rounded-xl hover:bg-indigo-50 font-bold" onClick={() => handleShowDetails(order)}><Eye className="w-4 h-4 mr-2" /> Detalle</Button>
                      <Button size="sm" variant="ghost" className="rounded-xl hover:bg-yellow-50 font-bold" onClick={() => handleEditOrder(order)}><Edit className="w-4 h-4 mr-2" /> Editar</Button>
                      <Button size="sm" variant="ghost" className="rounded-xl hover:bg-red-50 text-red-600 font-bold" 
                        onClick={async () => { 
                          if (!confirm("¿Eliminar pedido?")) return;
                          try {
                            if (!online) {
                              await deleteLocalOrder(order.id);
                              if (!String(order.id).startsWith("local-")) await enqueueAction({ type: "order:delete", payload: { id: order.id } });
                            } else {
                              const { error } = await supabase.from('orders').delete().eq('id', order.id);
                              if (error) throw error;
                            }
                            toast({ title: "Pedido eliminado" }); fetchOrders(); fetchSummary();
                          } catch (e) { toast({ title: "Error", variant: "destructive" }); }
                        }}><Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6">
          <DialogHeader><DialogTitle className="text-2xl font-black">Detalle Pedido</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-2xl flex justify-between border border-gray-100">
                <div><p className="text-[10px] text-gray-400 font-black uppercase">Cliente</p><p className="font-black text-lg">{selectedOrder.client_name}</p></div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-black uppercase">Estado</p>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(selectedOrder.status)}`}>{selectedOrder.status}</span>
                  {/* ← NUEVO: muestra días en el panel de detalle */}
                  {selectedOrder.metadata?.has_warranty && (
                    <p className="text-[10px] text-emerald-600 font-black mt-1 flex items-center gap-1 justify-end">
                      <ShieldCheck className="w-3 h-3" /> Garantía {selectedOrder.metadata?.warranty_days || 30} días
                    </p>
                  )}
                </div>
              </div>
              
              {selectedOrder.metadata?.is_repair && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Estado Técnico Seleccionado:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CHECKLIST_ITEMS.map(item => {
                      const active = !!selectedOrder.metadata?.checklist?.[item.id];
                      return (
                        <span key={item.id} className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${active ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-gray-100 text-gray-400'}`}>
                          {item.label}: {active ? '✓' : '✗'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

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
          <DialogFooter><Button className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl h-12 font-bold shadow-md" onClick={() => generatePDF(selectedOrder)} disabled={!online}><FileText className="w-4 h-4 mr-2" /> {online ? 'Abrir PDF' : 'Modo Offline'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;