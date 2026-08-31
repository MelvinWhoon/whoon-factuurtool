# whoon-factuurtool

Controleert inkoopfacturen (uit de gedeelde mailbox `invoice@whoon.com`) tegen
de inkooporder. Losstaand van [whoon-ordertool](https://github.com/MelvinWhoon/whoon-ordertool)
(eigen repo, eigen Vercel-deploy, eigen backend-container) zodat een probleem
hier de Ordervergelijker nooit kan platleggen — maar wel bereikbaar via
`order.whoon.com/facturen` (Vercel-rewrite in whoon-ordertool) en in dezelfde
Supabase-database (schema `whoon`).

Zie het plan in de sessie waarin dit is opgezet voor de volledige context:
datamodel (`purchase_invoices` + `purchase_invoice_lines`, met verzamelfacturen
vanaf dag 1), matching-aanpak (hergebruik van de exacte-code-eerst +
semantische matching-primitief uit `whoon-ordertool/pdf_parser/compare.py`),
en de leverancier-specifieke voorbeelden (Room108 verzamelfactuur, Light &
Living losse factuur).

## Ontwikkelen

```bash
npm install
cp .env.example .env   # vul VITE_SUPABASE_PUBLISHABLE_KEY in
npm run dev
```

Status: fase 1 (scaffold) — nog geen echte functionaliteit.
