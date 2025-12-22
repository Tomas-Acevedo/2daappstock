// src/scan/ScanProvider.jsx
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/AuthContext";

const ScanCtx = createContext(null);

const getBranchIdFromPath = () => {
  try {
    const path = window.location.pathname || "";
    const m = path.match(/\/branch\/([^/]+)/i);
    return m?.[1] || null;
  } catch { return null; }
};

export default function ScanProvider({ children }) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [cart, setCart] = useState([]);

  const close = useCallback(() => {
    setIsOpen(false);
    setBarcode("");
    setMatches([]);
    setLoading(false);
    setCart([]); // Limpieza obligatoria al cerrar manual
  }, []);

  const openWithCode = useCallback(async (code) => {
    if (!user?.id) return;
    const cleanCode = String(code).trim();
    setLoading(true);
    setBarcode(cleanCode);
    setMatches([]); 
    setIsOpen(true);
    try {
      const branchId = getBranchIdFromPath();
      const { data } = await supabase.from("products").select("*").eq("branch_id", branchId).eq("barcode", cleanCode);
      setMatches(data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [user?.id]);

  const updateProductFields = useCallback(async (productId, updates) => {
    try {
      const { data, error } = await supabase.from("products").update(updates).eq("id", productId).select().single();
      if (error) throw error;
      setMatches(prev => prev.map(p => p.id === productId ? data : p));
      return { data, error: null };
    } catch (e) { return { data: null, error: e }; }
  }, []);

  const addToCart = useCallback((product, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + qty } : item);
      }
      return [...prev, { ...product, quantity: qty }];
    });
  }, []);

  // ✅ NUEVA FUNCIÓN: Actualizar cantidad directamente en el carrito
  const updateCartQty = useCallback((productId, newQty) => {
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity: Math.max(1, newQty) } : item
    ));
  }, []);

  const removeFromCart = useCallback((id) => setCart(prev => prev.filter(item => item.id !== id)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo(() => ({
    isOpen, openWithCode, close, barcode, loading, matches, updateProductFields,
    cart, addToCart, removeFromCart, clearCart, updateCartQty
  }), [isOpen, openWithCode, close, barcode, loading, matches, updateProductFields, cart, addToCart, removeFromCart, clearCart, updateCartQty]);

  return <ScanCtx.Provider value={value}>{children}</ScanCtx.Provider>;
}

export const useScan = () => useContext(ScanCtx);