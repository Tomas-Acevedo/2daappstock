// src/scan/ScanDialog.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useScan } from "./ScanProvider";
import { supabase } from "@/lib/customSupabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { Search, Plus, Minus, Package, Loader2, CheckCircle2, Barcode, ShoppingCart, Trash2, Banknote, AlertTriangle, Edit3 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from "@/contexts/AuthContext";

const getBranchIdFromPath = () => {
  try {
    const path = window.location.pathname || "";
    const m = path.match(/\/branch\/([^/]+)/i);
    return m?.[1] || null;
  } catch { return null; }
};

export default function ScanDialog() {
  const { user } = useAuth();
  const { 
    isOpen, close, barcode, loading, matches, openWithCode, 
    updateProductFields, cart, addToCart, removeFromCart, clearCart, updateCartQty 
  } = useScan();
  const branchId = getBranchIdFromPath();

  const [activeTab, setActiveTab] = useState("sale"); 
  const [viewProduct, setViewProduct] = useState(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [editPrice, setEditPrice] = useState(0);
  const [editStock, setEditStock] = useState(0);
  const [saleQty, setSaleQty] = useState(1);
  const [amountReceived, setAmountReceived] = useState(0);

  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState(0);
  const [newStock, setNewStock] = useState(0);
  const [newCategoryId, setNewCategoryId] = useState("");

  const filteredProducts = useMemo(() => {
    const s = (search || "").toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(s) || p.barcode?.includes(s));
  }, [products, search]);

  useEffect(() => {
    if (!isOpen) return;
    if (matches?.length === 1) {
      const p = matches[0];
      setViewProduct(p);
      setEditPrice(p.price);
      setEditStock(p.stock);
      setSaleQty(1);
      setAmountReceived(0);
      setActiveTab("sale");
    } else {
      setViewProduct(null);
    }
  }, [isOpen, matches]);

  useEffect(() => {
    if (isOpen && branchId) fetchInitialData();
  }, [isOpen, branchId]);

  const fetchInitialData = async () => {
    setLoadingData(true);
    try {
      const [prodsRes, catsRes, payRes] = await Promise.all([
        supabase.from("products").select("*").eq("branch_id", branchId).order("name"),
        supabase.from("categories").select("*").eq("branch_id", branchId).order("name"),
        supabase.from('payment_methods').select('*').eq('branch_id', branchId).eq('is_active', true).order('name', { ascending: true })
      ]);
      setProducts(prodsRes.data || []);
      setCategories(catsRes.data || []);
      setPaymentMethods(payRes.data || []);
      if (payRes.data?.length > 0) setSelectedPaymentMethod(payRes.data[0]);
    } finally { setLoadingData(false); }
  };

  const handleClose = () => { 
    close(); 
    setSaleQty(1); 
    setAmountReceived(0); 
    setActiveTab("sale"); 
    setViewProduct(null);
    setCustomName("");
    setCustomPrice("");
  };

  const subtotal = useMemo(() => cart.reduce((acc, it) => acc + (it.price * it.quantity), 0), [cart]);
  const discountPercent = selectedPaymentMethod ? Number(selectedPaymentMethod.discount_percentage || 0) : 0;
  const discountAmount = (subtotal * discountPercent) / 100;
  const cartTotal = subtotal - discountAmount;
  const changeAmount = useMemo(() => (amountReceived > 0 ? Math.max(0, amountReceived - cartTotal) : 0), [amountReceived, cartTotal]);

  const addCustomToCart = () => {
    if (!customName.trim() || !customPrice || Number(customPrice) <= 0) {
      toast({ title: "Faltan datos", description: "Ingresa nombre y precio válido", variant: "destructive" });
      return;
    }
    const customItem = {
      id: `custom-${Date.now()}`,
      name: customName,
      price: Number(customPrice),
      is_custom: true,
      stock: 999999 
    };
    addToCart(customItem, 1);
    setCustomName('');
    setCustomPrice('');
  };

  const handleFinalizeSale = async () => {
    if (cart.length === 0 || !selectedPaymentMethod) return;
    setIsProcessing(true);
    try {
      for (const item of cart) {
        if (!item.is_custom) {
          const { data: currentProd } = await supabase.from('products').select('stock, name').eq('id', item.id).single();
          if (!currentProd || currentProd.stock < item.quantity) {
            toast({ title: "Stock insuficiente", description: `Producto: ${currentProd?.name}`, variant: "destructive" });
            setIsProcessing(false); return;
          }
        }
      }

      const { data: sale, error: saleError } = await supabase.from('sales').insert([{
        branch_id: branchId, customer_name: 'Cliente General', total: cartTotal, payment_method: selectedPaymentMethod.name, receipt_generated: false
      }]).select().single();

      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({
        sale_id: sale.id, 
        product_id: item.is_custom ? null : item.id, 
        product_name: item.name, 
        quantity: item.quantity, 
        unit_price: item.price, 
        is_custom: !!item.is_custom
      }));

      await supabase.from('sale_items').insert(saleItems);

      for (const item of cart) {
        if (!item.is_custom) {
          const { data: p } = await supabase.from('products').select('stock').eq('id', item.id).single();
          await supabase.from('products').update({ stock: p.stock - item.quantity }).eq('id', item.id);
        }
      }

      toast({ title: "¡Venta completada!" });
      window.dispatchEvent(new Event('inventory:refresh'));
      clearCart();
      handleClose();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); } 
    finally { setIsProcessing(false); }
  };

  const createProductWithBarcode = async () => {
    if (!newName || !newCategoryId) return;
    const { error } = await supabase.from("products").insert([{ name: newName, price: newPrice, stock: newStock, barcode, branch_id: branchId, category_id: newCategoryId }]);
    if (!error) { window.dispatchEvent(new Event('inventory:refresh')); openWithCode(barcode); }
  };

  const associateBarcode = async (p) => {
    const { error } = await supabase.from("products").update({ barcode }).eq("id", p.id);
    if (!error) openWithCode(barcode); 
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-5xl bg-white p-0 overflow-hidden shadow-2xl border-none flex flex-col max-h-[95vh] w-[95vw]">
        <DialogHeader className="hidden"><DialogTitle>Escaneo</DialogTitle></DialogHeader>
        
        <div className="p-4 md:p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-md"><Barcode className="w-5 h-5 md:w-6 md:h-6 text-white" /></div>
            <div>
              <h2 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-0.5">Torre de Control</h2>
              <p className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">ESCANEADO: <span className="text-indigo-600 font-mono">{barcode}</span></p>
            </div>
          </div>
          {cart.length > 0 && <div className="hidden md:flex items-center gap-2 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 mr-10"><ShoppingCart className="w-4 h-4 text-amber-600" /><span className="font-black text-amber-600 uppercase text-[10px]">{cart.length} productos</span></div>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white custom-scrollbar">
          {loading || loadingData ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4"><Loader2 className="w-12 h-12 animate-spin text-indigo-600" /></div>
          ) : viewProduct || activeTab === "cart" ? (
            <div className="space-y-6">
              
              {/* BLOQUE DE NAVEGACIÓN CORREGIDO: SE QUEDA EN SU LUGAR Y SUBE CON EL SCROLL */}
              <div className="flex justify-center pb-4">
                <div className="flex justify-center gap-1 md:gap-2 bg-gray-100 p-1 rounded-2xl w-fit shadow-sm border border-gray-200/50">
                  <button onClick={() => setActiveTab("sale")} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all ${activeTab === "sale" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>VENDER</button>
                  <button onClick={() => setActiveTab("edit")} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all ${activeTab === "edit" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>EDITAR INFO</button>
                  <button onClick={() => setActiveTab("cart")} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all ${activeTab === "cart" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"}`}>CARRITO ({cart.length})</button>
                </div>
              </div>

              {activeTab === "sale" && viewProduct && (
                <div className="text-center max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-200">
                  <h3 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">{viewProduct.name}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-2xl border ${viewProduct.stock <= 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}><p className="text-[10px] font-black text-gray-400 uppercase">Stock</p><p className={`text-xl font-bold ${viewProduct.stock <= 0 ? 'text-red-600' : 'text-gray-900'}`}>{viewProduct.stock} U.</p></div>
                    <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100"><p className="text-[10px] font-black text-indigo-400 uppercase">Precio</p><p className="text-xl font-bold text-indigo-600">{formatCurrency(viewProduct.price)}</p></div>
                  </div>
                  {viewProduct.stock > 0 ? (
                    <><div className="space-y-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cantidad</label><Input type="number" className="text-4xl h-20 text-center font-black rounded-3xl" value={saleQty} onChange={e => setSaleQty(Number(e.target.value))} onFocus={e => e.target.select()} /></div><Button onClick={() => { if(saleQty > viewProduct.stock) { toast({title:"Sin stock", variant:"destructive"}); return; } addToCart(viewProduct, saleQty); setActiveTab("cart"); }} className="w-full py-8 rounded-3xl bg-indigo-600 text-lg font-black shadow-xl">AÑADIR AL CARRITO</Button></>
                  ) : <div className="text-red-600 bg-red-50 p-4 rounded-2xl font-bold border border-red-100">Sin stock disponible.</div>}
                </div>
              )}

              {activeTab === "edit" && viewProduct && (
                <div className="max-w-2xl mx-auto grid grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><p className="text-[10px] font-black text-gray-400 uppercase">Stock Físico</p><Input type="number" className="text-3xl font-bold h-16 text-center" value={editStock} onFocus={e => e.target.select()} onChange={e => setEditStock(Number(e.target.value))} /></div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><p className="text-[10px] font-black text-indigo-400 uppercase">Precio Venta</p><Input type="number" className="text-3xl font-bold h-16 text-center text-indigo-600" value={editPrice} onFocus={e => e.target.select()} onChange={e => setEditPrice(Number(e.target.value))} /></div>
                  <Button onClick={async () => { await updateProductFields(viewProduct.id, { price: editPrice, stock: editStock }); toast({ title: "Guardado" }); window.dispatchEvent(new Event('inventory:refresh')); }} className="col-span-2 py-7 bg-emerald-600 text-white font-black rounded-3xl">GUARDAR CAMBIOS</Button>
                </div>
              )}

              {activeTab === "cart" && (
                <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
                  <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[10px] font-black text-indigo-600 uppercase ml-1">Producto Personalizado</label>
                      <Input placeholder="Nombre del ítem..." className="bg-white" value={customName} onChange={e => setCustomName(e.target.value)} />
                    </div>
                    <div className="w-full md:w-32 space-y-1">
                      <label className="text-[10px] font-black text-indigo-600 uppercase ml-1">Precio</label>
                      <Input type="number" placeholder="0.00" className="bg-white" value={customPrice} onChange={e => setCustomPrice(e.target.value)} />
                    </div>
                    <Button onClick={addCustomToCart} className="bg-indigo-600 h-10 w-full md:w-auto px-6 font-black rounded-xl"><Plus className="w-4 h-4 mr-2"/> AÑADIR</Button>
                  </div>

                  <div className="border rounded-2xl overflow-hidden shadow-sm bg-white">
                    <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 font-black text-[10px] uppercase text-gray-400 sticky top-0 z-10">
                          <tr><th className="p-4 text-left">Producto</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Subtotal</th><th className="p-4"></th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cart.length === 0 ? (
                            <tr><td colSpan="4" className="p-10 text-center text-gray-400 font-bold">El carrito está vacío</td></tr>
                          ) : cart.map(item => (
                            <tr key={item.id} className={item.is_custom ? "bg-amber-50/30" : ""}>
                              <td className="p-4 font-bold max-w-[200px] truncate">
                                <div className="flex items-center gap-2">
                                  {item.name}
                                  {item.is_custom && <span className="text-[8px] bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full font-black uppercase">Personalizado</span>}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center justify-center gap-2 bg-gray-100 rounded-lg p-1 w-fit mx-auto">
                                  <button onClick={() => updateCartQty(item.id, item.quantity - 1)} className="p-1.5 hover:bg-white rounded transition-all" disabled={item.quantity <= 1}><Minus className="w-3 h-3 text-gray-500"/></button>
                                  <span className="font-black text-sm w-6 text-center">{item.quantity}</span>
                                  <button onClick={() => { 
                                    if(!item.is_custom && item.quantity >= item.stock) { toast({title:"Stock máximo", variant:"destructive"}); return; } 
                                    updateCartQty(item.id, item.quantity + 1); 
                                  }} className="p-1.5 hover:bg-white rounded transition-all"><Plus className="w-3 h-3 text-gray-500"/></button>
                                </div>
                              </td>
                              <td className="p-4 text-right font-black">{formatCurrency(item.price * item.quantity)}</td>
                              <td className="p-4 text-right"><Button variant="ghost" size="icon" onClick={() => removeFromCart(item.id)}><Trash2 className="w-4 h-4 text-red-400"/></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-4 bg-gray-50 p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-gray-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400">Método de Pago</label>
                        <div className="grid grid-cols-2 gap-2">
                          {paymentMethods.map(method => (
                            <Button key={method.id} variant={selectedPaymentMethod?.id === method.id ? "default" : "outline"} onClick={() => setSelectedPaymentMethod(method)} className={`h-auto py-2.5 px-3 flex justify-between items-center rounded-xl border-2 transition-all ${selectedPaymentMethod?.id === method.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100'}`}>
                              <span className="font-bold text-[10px] truncate mr-1">{method.name}</span>
                              {method.discount_percentage > 0 && <span className={`text-[8px] px-1 py-0.5 rounded-full font-black ${selectedPaymentMethod?.id === method.id ? 'bg-white text-indigo-600' : 'bg-green-100 text-green-600'}`}>-{method.discount_percentage}%</span>}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-gray-400">Calculadora de Vuelto</label>
                        <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3 shadow-sm">
                          <div className="relative">
                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input type="number" placeholder="Paga con..." className="pl-9 bg-gray-50 border-none font-bold" value={amountReceived || ''} onFocus={e => e.target.select()} onChange={e => setAmountReceived(Number(e.target.value))} />
                          </div>
                          {amountReceived > 0 && (
                            <div className="flex justify-between items-center pt-2 border-t border-dashed">
                              <span className="text-[10px] font-black text-gray-400 uppercase">Vuelto:</span>
                              <span className="text-lg font-black text-green-600">{formatCurrency(changeAmount)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 px-2">
                      <div className="text-center sm:text-left">
                        <p className="text-[10px] font-black uppercase text-gray-400">Total Venta</p>
                        <p className="text-4xl md:text-5xl font-black text-indigo-700">{formatCurrency(cartTotal)}</p>
                      </div>
                      <Button onClick={handleFinalizeSale} disabled={isProcessing || cart.length === 0} className="w-full sm:w-auto px-12 py-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-lg font-black shadow-lg transition-all active:scale-95">
                        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : "FINALIZAR VENTA"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 flex flex-col h-[520px]"><div className="flex items-center gap-3 mb-6"><Package className="text-emerald-600 w-5 h-5" /><h3 className="text-lg font-bold">Vincular</h3></div><Input className="bg-white mb-4 shadow-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} /><div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">{filteredProducts.map(p => (<div key={p.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 transition-all shadow-sm"><p className="font-bold text-sm text-gray-800 truncate">{p.name}</p><Button size="sm" className="bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-[10px] font-black" onClick={() => associateBarcode(p)}>VINCULAR</Button></div>))}</div></div>
              <div className="bg-gray-50/50 p-6 rounded-[24px] border border-gray-100 space-y-5"><div className="flex items-center gap-3 mb-6"><Plus className="text-blue-600 w-5 h-5" /><h3 className="text-lg font-bold">Nuevo Producto</h3></div><div className="space-y-1.5"><label className="text-[10px] font-black text-gray-400 uppercase">Nombre</label><Input className="bg-white rounded-xl" value={newName} onChange={e => setNewName(e.target.value)} /></div><div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-black text-gray-400 uppercase">Precio</label><Input type="number" className="bg-white rounded-xl" value={newPrice} onFocus={e => e.target.select()} onChange={e => setNewPrice(Number(e.target.value))} /></div><div><label className="text-[10px] font-black text-gray-400 uppercase">Stock</label><Input type="number" className="bg-white rounded-xl" value={newStock} onFocus={e => e.target.select()} onChange={e => setNewStock(Number(e.target.value))} /></div></div><div className="space-y-1.5"><label className="text-[10px] font-black text-gray-400 uppercase">Categoría</label><select className="w-full h-12 px-4 bg-white border border-gray-200 rounded-xl text-sm outline-none" value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}><option value="">Elegir...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><Button onClick={createProductWithBarcode} className="w-full bg-indigo-600 text-white py-8 text-lg font-black rounded-2xl shadow-lg">CREAR Y VINCULAR</Button></div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}