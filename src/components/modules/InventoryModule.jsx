import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Package, Plus, Search, Trash2, Edit, Tag, 
  ShieldCheck, Loader2, Barcode 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; 
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const InventoryModule = () => {
  const { branchId } = useParams();
  const { user } = useAuth();
  
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branchConfig, setBranchConfig] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [productForm, setProductForm] = useState({ 
    name: '', category_id: '', cost: 0, price: 0, stock: 0, barcode: '' 
  });

  useEffect(() => {
    if (branchId) fetchData();
  }, [branchId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Obtenemos configuración de permisos, categorías y productos
      const [configRes, catsRes, prodsRes] = await Promise.all([
        supabase.from('branches').select('allow_stock_edit').eq('id', branchId).single(),
        supabase.from('categories').select('*').eq('branch_id', branchId),
        supabase.from('products').select('*').eq('branch_id', branchId).order('name')
      ]);
      
      setBranchConfig(configRes.data);
      setCategories(catsRes.data || []);
      setProducts(prodsRes.data || []);
    } catch (e) {
      console.error("Error cargando inventario:", e);
    } finally {
      setLoading(false);
    }
  };

  // Validación de permisos: Propietario siempre puede, sucursal depende del switch
  const isOwner = user?.profile?.role === 'owner';
  const canEdit = isOwner || (branchConfig?.allow_stock_edit === true);

  const handleSaveProduct = async () => {
    if (!canEdit) return;
    if (!productForm.name || !productForm.category_id) {
      toast({ title: "Faltan datos", description: "Nombre y Categoría son obligatorios", variant: "destructive" });
      return;
    }
    
    try {
      const payload = { ...productForm, branch_id: branchId };
      if (editingItem) {
        await supabase.from('products').update(payload).eq('id', editingItem.id);
      } else {
        await supabase.from('products').insert([payload]);
      }
      toast({ title: "Inventario actualizado" });
      fetchData();
      setIsProductDialogOpen(false);
    } catch (err) { 
      toast({ title: "Error al guardar", variant: "destructive" }); 
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!canEdit || !window.confirm("¿Seguro que deseas eliminar este producto?")) return;
    try {
      await supabase.from('products').delete().eq('id', id);
      toast({ title: "Producto eliminado" });
      fetchData();
    } catch (e) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const openProductDialog = (product = null) => {
    if (product) {
      setEditingItem(product);
      setProductForm({ 
        name: product.name, 
        category_id: product.category_id, 
        cost: product.cost, 
        price: product.price, 
        stock: product.stock,
        barcode: product.barcode || ''
      });
    } else {
      setEditingItem(null);
      setProductForm({ name: '', category_id: categories[0]?.id || '', cost: 0, price: 0, stock: 0, barcode: '' });
    }
    setIsProductDialogOpen(true);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Stock</h1>
          {!canEdit && !loading && (
            <p className="text-amber-600 text-sm font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
              <ShieldCheck className="w-4 h-4"/> Modo Lectura: El propietario ha bloqueado la edición de inventario.
            </p>
          )}
        </div>
        
        {canEdit && (
          <div className="flex gap-2 w-full md:w-auto">
            <Button onClick={() => openProductDialog()} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Producto
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center gap-3 shadow-sm">
        <Search className="w-5 h-5 text-gray-400" />
        <input 
          placeholder="Buscar por nombre o código de barras..." 
          className="bg-transparent border-none outline-none text-gray-900 w-full placeholder:text-gray-400" 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)} 
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm tabular-nums">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Código / SKU</th>
                <th className="px-6 py-4">Costo</th>
                <th className="px-6 py-4 text-indigo-600">Precio</th>
                <th className="px-6 py-4">Stock</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="6" className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-indigo-600 w-8 h-8" /></td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan="6" className="p-10 text-center text-gray-400">Sin productos registrados.</td></tr>
              ) : filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{product.name}</td>
                  <td className="px-6 py-4">
                    {product.barcode ? (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Barcode className="w-3 h-3" />
                        <span className="text-xs font-mono">{product.barcode}</span>
                      </div>
                    ) : <span className="text-[10px] text-gray-300 italic">Sin código</span>}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{formatCurrency(product.cost)}</td>
                  <td className="px-6 py-4 text-indigo-600 font-extrabold">{formatCurrency(product.price)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${product.stock < 10 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {product.stock} Unidades
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button onClick={() => openProductDialog(product)} size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><Edit className="w-4 h-4" /></Button>
                        <Button onClick={() => handleDeleteProduct(product.id)} size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-300 font-bold uppercase tracking-tighter italic select-none">Bloqueado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario Modal de Producto */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader><DialogTitle className="text-xl font-bold">{editingItem ? 'Editar' : 'Nuevo'} Producto</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-500">Código de Barras (Opcional)</label>
              <Input 
                value={productForm.barcode} 
                onChange={e => setProductForm({...productForm, barcode: e.target.value})} 
                placeholder="Escanea o escribe el código"
                className="bg-gray-50 border-indigo-100 focus:ring-indigo-500"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-500">Nombre del Producto</label>
              <Input value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Ej: Tablet Samsung Galaxy" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-500">Categoría</label>
              <select 
                className="w-full p-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500"
                value={productForm.category_id}
                onChange={e => setProductForm({...productForm, category_id: e.target.value})}
              >
                <option value="">Seleccionar...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase">Costo</label><Input type="number" value={productForm.cost} onChange={e => setProductForm({...productForm, cost: Number(e.target.value)})} /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-indigo-400 uppercase">Venta</label><Input type="number" value={productForm.price} onChange={e => setProductForm({...productForm, price: Number(e.target.value)})} className="border-indigo-100 bg-indigo-50/30 font-bold text-indigo-700" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-bold text-gray-400 uppercase">Stock</label><Input type="number" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})} /></div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsProductDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleSaveProduct} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto">Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default InventoryModule;