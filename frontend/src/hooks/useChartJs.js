import { useState, useEffect } from 'react';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';

let promise = null;
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.onload  = () => resolve(window.Chart);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return promise;
}

/**
 * useChartJs — returns { Chart, ready } where ready is true once the Chart.js
 * library has been loaded from CDN (singleton, loads only once globally).
 */
export function useChartJs() {
  const [ready, setReady] = useState(!!window.Chart);
  useEffect(() => {
    if (ready) return;
    loadChartJs().then(() => setReady(true)).catch(console.error);
  }, [ready]);
  return { Chart: window.Chart, ready };
}
