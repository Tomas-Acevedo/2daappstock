// src/scan/ScanProvider.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const ScanCtx = createContext(null);

// ✅ branchId desde la URL (funciona aunque el Provider esté fuera del Router)
const getBranchIdFromPath = () => {
  try {
    const path = window.location.pathname || "";
    const m = path.match(/\/branch\/([^/]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

export default function ScanProvider({ children }) {
  const { user } = useAuth();

  // UI / modal
  const [isOpen, setIsOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Resultados
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);

  // 🛒 Carrito (si lo querés usar más adelante)
  const [cart, setCart] = useState([]);
  const [cartPayMethod, setCartPayMethod] = useState("efectivo");

  const cartCount = useMemo(
    () => cart.reduce((acc, it) => acc + Number(it.quantity || 0), 0),
    [cart]
  );

  const cartSubtotal = useMemo(
    () =>
      cart.reduce(
        (acc, it) => acc + Number(it.quantity || 0) * Number(it.price || 0),
        0
      ),
    [cart]
  );

  const addToCart = useCallback((product, qty = 1) => {
    if (!product?.id) return;
    setCart((prev) => {
      const i = prev.findIndex((p) => p.productId === product.id);
      if (i === -1) {
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: Number(product.price || 0),
            quantity: Number(qty || 1),
            isCustom: false,
          },
        ];
      } else {
        const arr = prev.slice();
        arr[i] = {
          ...arr[i],
          quantity: Number(arr[i].quantity || 0) + Number(qty || 1),
        };
        return arr;
      }
    });
  }, []);

  const updateCartQty = useCallback((productId, qty) => {
    setCart((prev) =>
      prev
        .map((it) =>
          it.productId === productId
            ? { ...it, quantity: Math.max(1, Number(qty || 1)) }
            : it
        )
        .filter((it) => it.quantity > 0)
    );
  }, []);

  const incCartQty = useCallback((productId, delta) => {
    setCart((prev) =>
      prev
        .map((it) =>
          it.productId === productId
            ? {
                ...it,
                quantity: Math.max(
                  1,
                  Number(it.quantity || 1) + Number(delta || 0)
                ),
              }
            : it
        )
        .filter((it) => it.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart((prev) => prev.filter((it) => it.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // buffer de tipeo (para abrir modal cuando está cerrado)
  const bufferRef = useRef("");
  const timeoutRef = useRef(null);

  const resetScan = () => {
    bufferRef.current = "";
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const close = useCallback(() => {
    setIsOpen(false);
    setBarcode("");
    setMatches([]);
    setSelected(null);
    setLoading(false);
    setError(null);
    clearCart();
  }, [clearCart]);

  const openWithCode = useCallback(
    async (code) => {
      if (!user?.id) return;

      setIsOpen(true);
      setBarcode(code);
      setLoading(true);
      setError(null);
      setMatches([]);
      setSelected(null);

      try {
        const branchId = getBranchIdFromPath();

        if (!branchId) {
          setError(
            "No se detectó sucursal (branchId). Abrí el escaneo dentro de una ruta tipo /branch/:branchId/..."
          );
          return;
        }

        const { data, error: qErr } = await supabase
          .from("products")
          .select("id,name,price,stock,category_id,barcode,branch_id,cost")
          .eq("branch_id", branchId)
          .eq("barcode", code);

        if (qErr) throw qErr;

        setMatches(data || []);
        setSelected(data?.length === 1 ? data[0] : null);
      } catch (e) {
        console.error(e);
        setError(e.message || "Error al buscar el producto");
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  // Listener teclado simple (si vos usás GlobalScanListener, esto igual no molesta)
  useEffect(() => {
    const onKeyDown = (ev) => {
      if (isOpen) return;

      const { key } = ev;

      if (/^\d$/.test(key)) {
        bufferRef.current += key;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(resetScan, 800);
      } else if (key === "Enter") {
        ev.preventDefault();
        const code = bufferRef.current;
        resetScan();
        if (code && code.length >= 3) openWithCode(code);
      } else if (key === "Escape") {
        resetScan();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      resetScan();
    };
  }, [isOpen, openWithCode]);

  const updateStockAbsolute = useCallback(async (productId, toValue) => {
    const branchId = getBranchIdFromPath();
    if (!branchId) throw new Error("No se detectó branchId para actualizar stock.");

    const { data, error: uErr } = await supabase
      .from("products")
      .update({ stock: toValue })
      .eq("id", productId)
      .eq("branch_id", branchId)
      .select("id,name,price,stock,category_id,barcode,branch_id,cost")
      .single();

    if (uErr) throw uErr;

    setSelected((prev) => (prev && prev.id === productId ? data : prev));
    setMatches((arr) => arr.map((p) => (p.id === productId ? data : p)));
    return data;
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      openWithCode,
      close,

      barcode,
      loading,
      error,
      matches,
      selected,
      setSelected,

      updateStockAbsolute,

      cart,
      cartCount,
      cartSubtotal,
      cartPayMethod,
      setCartPayMethod,
      addToCart,
      updateCartQty,
      incCartQty,
      removeFromCart,
      clearCart,
    }),
    [
      isOpen,
      openWithCode,
      close,
      barcode,
      loading,
      error,
      matches,
      selected,
      updateStockAbsolute,
      cart,
      cartCount,
      cartSubtotal,
      cartPayMethod,
      addToCart,
      updateCartQty,
      incCartQty,
      removeFromCart,
      clearCart,
      setCartPayMethod,
    ]
  );

  return <ScanCtx.Provider value={value}>{children}</ScanCtx.Provider>;
}

export const useScan = () => useContext(ScanCtx);
