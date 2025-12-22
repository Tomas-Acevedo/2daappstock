import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { registerSW } from 'virtual:pwa-register'; // ✅ Importar el registro

// ✅ Esto registra el Service Worker y permite que la app funcione offline e instalable
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);