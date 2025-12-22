import { useEffect, useRef } from "react";
import { useScan } from "./ScanProvider";

export default function GlobalScanListener() {
  const { openWithCode } = useScan(); // ✅

  const bufferRef = useRef([]);
  const timesRef = useRef([]);
  const lastTsRef = useRef(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key;

      const now = performance.now();
      if (now - lastTsRef.current > 300) {
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

        if (!chars) return;

        const MIN_LEN = 6;
        if (chars.length < MIN_LEN) return;

        let avg = 1000;
        if (times.length >= 2) {
          const total = times[times.length - 1] - times[0];
          avg = total / (times.length - 1);
        }

        if (avg <= 60) {
          e.preventDefault();
          e.stopPropagation();
          openWithCode(chars); // ✅ abre modal
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openWithCode]);

  return null;
}
