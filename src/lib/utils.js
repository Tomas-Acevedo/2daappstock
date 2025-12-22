import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const TIMEZONE = 'America/Argentina/Buenos_Aires';

export const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

export const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
};

// ✅ Corregido para que siempre devuelva la fecha de Argentina sin importar la hora UTC
export const getArgentinaDate = () => {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now); // Retorna "YYYY-MM-DD"
};