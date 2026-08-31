import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Draait achter een Vercel-rewrite op order.whoon.com/facturen/* (zie
// vercel.json in whoon-ordertool). Zonder deze base zouden de gebouwde
// asset-paden (/assets/...) naar de root van het domein wijzen in plaats van
// naar deze zone, en dus 404's geven zodra ze via de proxy geladen worden.
export default defineConfig({
  base: '/facturen/',
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
