import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Package, Plus, Search, Trash2, Edit, ShieldCheck,
  Loader2, Layers, ChevronLeft, ChevronRight, Filter, CloudOff, Barcode
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

// Offline Imports
import { useOffline } from "@/contexts/OfflineContext";
import {
  cacheProducts,
  cacheCategories,
  cacheBranches,
  getProductsByBranch,
  getCategoriesByBranch,
  getBranchById,
  enqueueAction,
  initOfflineDb
} from "@/lib/offlineDb";

const InventoryModule = () => {
  const { branchId } = useParams();
  const { user } = useAuth();
  const { online } = useOffline();

  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branchConfig, setBranchConfig] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 20;

  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [productForm, setProductForm] = useState({
    name: '', category_id: '', price: 0, stock: 0
  });
  
  const [productBarcodes, setProductBarcodes] = useState([]);
  const [tempBarcodes, setTempBarcodes] = useState([]);
  const [newBarcodeEntry, setNewBarcodeEntry] = useState('');

  const [categoryForm, setCategoryForm] = useState({ name: '' });

  const isOwner = user?.profile?.role === 'owner';
  const canEdit = isOwner || (branchConfig?.allow_stock_edit === true);

  const formatNumberWithDots = (num) => {
    if (num === undefined || num === null || num === '') return '';
    return num.toString().replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const parseNumberFromDots = (str) => {
    return Number((str || "").replace(/\./g, ""));
  };

  const fetchCategories = useCallback(async () => {
    if (!branchId) return;
    try {
      if (online) {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("branch_id", branchId)
          .order("name");

        if (error) throw error;
        setCategories(data || []);
        await cacheCategories(data || []);
      } else {
        const cached = await getCategoriesByBranch(branchId);
        setCategories(cached || []);
      }
    } catch (e) {
      const cached = await getCategoriesByBranch(branchId);
      setCategories(cached || []);
    }
  }, [branchId, online]);

  const fetchProducts = useCallback(async () => {
    if (!branchId || activeTab !== "products") return;
    setLoading(true);

    try {
      if (online) {
        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        let query = supabase
          .from("products")
          .select("*, product_barcodes(*)", { count: "exact" })
          .eq("branch_id", branchId)
          .order("name", { ascending: true })
          .range(from, to);

        if (filter) {
          const { data: matchingBarcodes } = await supabase
            .from("product_barcodes")
            .select("product_id")
            .ilike("barcode", `%${filter}%`);
          
          const matchedProductIds = (matchingBarcodes || []).map(b => b.product_id);

          if (matchedProductIds.length > 0) {
            query = query.or(`name.ilike.%${filter}%,id.in.(${matchedProductIds.join(',')})`);
          } else {
            query = query.ilike("name", `%${filter}%`);
          }
        }

        if (categoryFilter !== "all") query = query.eq("category_id", categoryFilter);
        if (stockFilter === "in-stock") query = query.gt("stock", 0);
        if (stockFilter === "no-stock") query = query.lte("stock", 0);

        const { data, count, error } = await query;
        if (error) throw error;

        setProducts(data || []);
        setTotalCount(count || 0);
        await cacheProducts(data || []);
      } else {
        let cached = await getProductsByBranch(branchId);

        if (filter) {
          const f = filter.toLowerCase();
          cached = cached.filter(p =>
            p.name.toLowerCase().includes(f) ||
            (p.product_barcodes || []).some(b => b.barcode.toLowerCase().includes(f))
          );
        }

        if (categoryFilter !== "all") cached = cached.filter(p => p.category_id === categoryFilter);
        if (stockFilter === "in-stock") cached = cached.filter(p => p.stock > 0);
        if (stockFilter === "no-stock") cached = cached.filter(p => p.stock <= 0);

        cached.sort((a, b) => a.name.localeCompare(b.name));

        const from = (currentPage - 1) * itemsPerPage;
        const pageItems = cached.slice(from, from + itemsPerPage);

        setProducts(pageItems);
        setTotalCount(cached.length);
      }
    } catch (e) {
      toast({ title: "Error cargando productos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [branchId, online, activeTab, currentPage, filter, categoryFilter, stockFilter]);

  const fetchProductBarcodes = async (productId) => {
    if (online && productId) {
      const { data } = await supabase.from("product_barcodes").select("*").eq("product_id", productId);
      const list = data || [];
      setProductBarcodes(list);
      setTempBarcodes(list);
    } else {
      setProductBarcodes([]);
      setTempBarcodes([]);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (online) {
          const { data, error } = await supabase
            .from("branches")
            .select("id, allow_stock_edit")
            .eq("id", branchId)
            .single();

          if (!error && data) {
            setBranchConfig(data);
            await cacheBranches([data]);
          }
        } else {
          const cached = await getBranchById(branchId);
          if (cached) setBranchConfig(cached);
        }
      } catch (e) {
        const cached = await getBranchById(branchId);
        if (cached) setBranchConfig(cached);
      }
      await fetchCategories();
    };

    if (branchId) loadInitialData();
  }, [branchId, fetchCategories, online]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Oyente optimizado y blindado para el evento global de actualización
  useEffect(() => {
    const handleRefresh = () => {
      fetchProducts();
      fetchCategories();
    };

    window.addEventListener("inventory:refresh", handleRefresh);
    return () => window.removeEventListener("inventory:refresh", handleRefresh);
  }, [fetchProducts, fetchCategories]);

  const openProductDialog = (product = null) => {
    setNewBarcodeEntry('');
    if (product) {
      setEditingItem(product);
      setProductForm({
        name: product.name,
        category_id: product.category_id,
        price: product.price,
        stock: product.stock
      });
      fetchProductBarcodes(product.id);
    } else {
      setEditingItem(null);
      setProductForm({
        name: '',
        category_id: categories[0]?.id || '',
        price: 0,
        stock: 0
      });
      setProductBarcodes([]);
      setTempBarcodes([]);
    }
    setIsProductDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!canEdit) return;
    if (!productForm.name || !productForm.category_id) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }

    const payload = { ...productForm, branch_id: branchId };

    if (!online) {
      const localId = editingItem?.id || `local-product-${Date.now()}`;
      const db = await initOfflineDb();
      await db.put("products", { id: localId, ...payload });

      await enqueueAction({
        type: editingItem ? "product:update" : "product:create",
        payload: { id: localId, ...payload }
      });

      toast({ title: "Producto guardado (offline)" });
      setIsProductDialogOpen(false);
      fetchProducts();
      return;
    }

    let productId = editingItem?.id;

    if (editingItem) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingItem.id);
      if (error) {
        toast({ title: "Error al actualizar", variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase.from("products").insert([payload]).select().single();
      if (error || !data) {
        toast({ title: "Error al crear", variant: "destructive" });
        return;
      }
      productId = data.id;
    }

    if (productId && online) {
      const currentIds = tempBarcodes.map(b => b.id).filter(Boolean);
      const toDelete = productBarcodes.filter(b => !currentIds.includes(b.id));

      for (const item of toDelete) {
        if (item.id) {
          await supabase.from("product_barcodes").delete().eq("id", item.id);
        }
      }

      const toInsert = tempBarcodes.filter(b => !b.id);
      for (const item of toInsert) {
        await supabase.from("product_barcodes").insert([{
          product_id: productId,
          barcode: item.barcode
        }]);
      }
    }

    toast({ title: "Inventario actualizado" });
    setIsProductDialogOpen(false);
    window.dispatchEvent(new Event('inventory:refresh'));
  };

  const handleDeleteProduct = async (id) => {
    if (!canEdit || !window.confirm("¿Eliminar producto?")) return;

    if (!online) {
      const db = await initOfflineDb();
      await db.delete("products", id);

      await enqueueAction({
        type: "product:delete",
        payload: { id }
      });

      toast({ title: "Producto eliminado (offline)" });
      fetchProducts();
      return;
    }

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
      return;
    }

    toast({ title: "Producto eliminado" });
    window.dispatchEvent(new Event('inventory:refresh'));
  };

  const handleAddTempBarcode = () => {
    if (!newBarcodeEntry.trim()) return;
    if (tempBarcodes.length >= 5) {
      toast({ title: "Límite alcanzado", description: "Máximo 5 códigos de barra por producto.", variant: "destructive" });
      return;
    }

    const exists = tempBarcodes.some(b => b.barcode === newBarcodeEntry.trim());
    if (exists) {
      toast({ title: "Duplicado", description: "Este código ya está en la lista.", variant: "destructive" });
      return;
    }

    setTempBarcodes(prev => [...prev, { barcode: newBarcodeEntry.trim() }]);
    setNewBarcodeEntry('');
  };

  const handleRemoveTempBarcode = (index) => {
    setTempBarcodes(prev => prev.filter((_, i) => i !== index));
  };

  const openCategoryDialog = (cat = null) => {
    if (cat) {
      setEditingItem(cat);
      setCategoryForm({ name: cat.name });
    } else {
      setEditingItem(null);
      setCategoryForm({ name: '' });
    }
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!canEdit) return;
    if (!categoryForm.name?.trim()) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }

    const payload = { name: categoryForm.name.trim(), branch_id: branchId };

    if (!online) {
      const localId = editingItem?.id || `local-category-${Date.now()}`;
      const db = await initOfflineDb();
      await db.put("categories", { id: localId, ...payload });

      await enqueueAction({
        type: editingItem ? "category:update" : "category:create",
        payload: { id: localId, ...payload },
      });

      toast({ title: "Categoría guardada (offline)" });
      setIsCategoryDialogOpen(false);
      fetchCategories();
      return;
    }

    const { error } = editingItem
      ? await supabase.from("categories").update(payload).eq("id", editingItem.id)
      : await supabase.from("categories").insert([payload]);

    if (error) {
      toast({ title: "Error al guardar", variant: "destructive" });
      return;
    }

    toast({ title: editingItem ? "Categoría actualizada" : "Categoría creada" });
    setIsCategoryDialogOpen(false);
    fetchCategories();
  };

  const handleDeleteCategory = async (id) => {
    if (!canEdit || !window.confirm("¿Eliminar categoría?")) return;

    if (!online) {
      const db = await initOfflineDb();
      await db.delete("categories", id);

      await enqueueAction({
        type: "category:delete",
        payload: { id },
      });

      toast({ title: "Categoría eliminada (offline)" });
      fetchCategories();
      return;
    }

    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
      return;
    }

    toast({ title: "Categoría eliminada" });
    fetchCategories();
  };

  const filteredCategories = (categories || [])
  .filter(c => c?.branch_id === branchId)
  .filter(c => {
    if (!filter?.trim()) return true;
    return c.name?.toLowerCase().includes(filter.toLowerCase());
  })
  .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            Gestión de Stock
            {!online && <CloudOff className="w-6 h-6 text-amber-500" />}
          </h1>
          {!canEdit && !loading && (
            <p className="text-amber-600 text-sm font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 mt-1">
              <ShieldCheck className="w-4 h-4" /> Modo Lectura
            </p>
          )}
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'products' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
          >
            <Package className="w-4 h-4" /> PRODUCTOS
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'categories' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
          >
            <Layers className="w-4 h-4" /> CATEGORÍAS
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 mb-6">
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-3 flex items-center gap-3 shadow-sm">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            placeholder={activeTab === 'products' ? "Buscar por nombre o código..." : "Filtrar categorías..."}
            className="bg-transparent border-none outline-none text-gray-900 w-full font-medium"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {activeTab === 'products' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-2xl border border-gray-200 shadow-sm">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="bg-transparent border-none text-xs font-bold outline-none text-gray-600 py-2 cursor-pointer"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Todas las Categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-2xl border border-gray-200 shadow-sm">
              <select
                className="bg-transparent border-none text-xs font-bold outline-none text-gray-600 py-2 cursor-pointer"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
              >
                <option value="all">Todo el Stock</option>
                <option value="in-stock">Con Stock</option>
                <option value="no-stock">Sin Stock (0)</option>
              </select>
            </div>
          </div>
        )}

        {canEdit && (
          <Button
            onClick={() => activeTab === 'products' ? openProductDialog() : openCategoryDialog()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-2xl px-8 shadow-lg shadow-indigo-100 uppercase text-xs tracking-widest"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo {activeTab === 'products' ? 'Producto' : 'Categoría'}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm tabular-nums">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-gray-500 uppercase text-[10px] font-black tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Nombre</th>
                {activeTab === 'products' && (
                  <>
                    <th className="px-6 py-4 text-center">Códigos</th>
                    <th className="px-6 py-4">Precio</th>
                    <th className="px-6 py-4 text-center">Stock</th>
                  </>
                )}
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-600 w-8 h-8" />
                  </td>
                </tr>
              ) : (activeTab === 'products' ? products : filteredCategories).map((item) => {
                const barcodesList = item.product_barcodes?.map(b => b.barcode).filter(Boolean) || [];
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                    {activeTab === 'products' && (
                      <>
                        <td className="px-6 py-4 text-center">
                          {barcodesList.length > 0 ? (
                            <div className="flex flex-wrap justify-center gap-1">
                              {barcodesList.map((code, idx) => (
                                <span key={idx} className="bg-gray-100 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-gray-600 border border-gray-200">
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-black text-indigo-600">{formatCurrency(item.price)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded text-[10px] font-black ${item.stock > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {item.stock} U.
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-right">
                      {canEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            onClick={() => activeTab === 'products' ? openProductDialog(item) : openCategoryDialog(item)}
                            size="icon"
                            variant="ghost"
                            className="hover:text-indigo-600"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => activeTab === 'products' ? handleDeleteProduct(item.id) : handleDeleteCategory(item.id)}
                            size="icon"
                            variant="ghost"
                            className="hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300 font-bold uppercase italic">Bloqueado</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && activeTab === 'products' && totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Total: {totalCount} productos</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="rounded-xl h-9 w-9 p-0">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl border">
                  PÁGINA {currentPage} DE {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="rounded-xl h-9 w-9 p-0">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Gestionar Producto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-400">Nombre</label>
              <Input value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} className="rounded-xl" />
            </div>
            
            {online && (
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-500">Códigos de Barra (Máx. 5):</label>
                <div className="flex flex-wrap gap-2">
                  {tempBarcodes.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border text-xs font-mono shadow-sm">
                      <span>{b.barcode}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTempBarcode(idx)} 
                        className="text-red-400 hover:text-red-600 font-bold px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {tempBarcodes.length === 0 && <span className="text-xs text-gray-400 italic">Sin códigos asociados</span>}
                </div>
                {tempBarcodes.length < 5 && (
                  <div className="flex gap-2 pt-1">
                    <Input 
                      placeholder="Nuevo código de barra..." 
                      className="bg-white text-xs h-9" 
                      value={newBarcodeEntry} 
                      onChange={e => setNewBarcodeEntry(e.target.value)} 
                    />
                    <Button size="sm" type="button" onClick={handleAddTempBarcode} className="bg-indigo-600 font-bold h-9">Añadir</Button>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-400">Categoría</label>
              <select className="w-full p-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500" value={productForm.category_id} onChange={e => setProductForm({ ...productForm, category_id: e.target.value })}>
                <option value="">Seleccionar...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-indigo-400 uppercase">Precio</label>
                <Input type="text" value={formatNumberWithDots(productForm.price)} onFocus={e => e.target.select()} onChange={e => setProductForm({ ...productForm, price: parseNumberFromDots(e.target.value) })} className="border-indigo-100 bg-indigo-50/30 font-bold text-indigo-700 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Stock</label>
                <Input type="number" value={productForm.stock} onFocus={e => e.target.select()} onChange={e => setProductForm({ ...productForm, stock: Number(e.target.value) })} className="rounded-xl" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveProduct} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-xl uppercase text-xs">Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="bg-white sm:max-w-sm rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{editingItem ? 'Editar' : 'Nueva'} Categoría</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Nombre</label>
            <Input value={categoryForm.name} onChange={e => setCategoryForm({ name: e.target.value })} placeholder="Ej: Accesorios" className="rounded-xl h-12" />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveCategory} className="w-full bg-indigo-600 text-white font-black py-6 rounded-xl shadow-lg uppercase text-xs">Actualizar Categoría</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default InventoryModule;