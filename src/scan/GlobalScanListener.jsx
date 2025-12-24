// src/scan/GlobalScanListener.jsx
import { useEffect, useRef } from "react";
import { useScan } from "./ScanProvider";

// Función auxiliar para detectar si estamos dentro de una sucursal
const getBranchIdFromPath = () => {
  try {
    const path = window.location.pathname || "";
    // Busca el patrón /branch/ seguido del ID
    const m = path.match(/\/branch\/([^/]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

export default function GlobalScanListener() {
  const { openWithCode } = useScan();
  const bufferRef = useRef([]);
  const timesRef = useRef([]);
  const lastTsRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      // ✅ RESTRICCIÓN: Solo funciona si hay un branchId en la URL
      const currentBranchId = getBranchIdFromPath();
      if (!currentBranchId) return;

      const key = e.key;
      const now = performance.now();

      if (now - lastTsRef.current > 200) {
        bufferRef.current = [];
        timesRef.current = [];
      }
      lastTsRef.current = now;

      const isChar = key.length === 1 && /[A-Za-z0-9._-]/.test(key);
      if (isChar) {
        bufferRef.current.push(key);
        timesRef.current.push(now);
        return;
      }

      if (key === "Enter") {
        const chars = bufferRef.current.join("").trim();
        const times = timesRef.current.slice();
        bufferRef.current = [];
        timesRef.current = [];

        if (!chars || chars.length < 3) return;

        let avg = 1000;
        if (times.length >= 2) avg = (times[times.length - 1] - times[0]) / (times.length - 1);

        if (avg <= 120) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation(); 
          openWithCode(chars); 
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openWithCode]);

  return null;
}