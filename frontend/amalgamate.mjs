#!/usr/bin/env node

// amalgamate.mjs — updated for Equitee
// Bundles all source files into a single self-contained demo HTML.
// Usage: node amalgamate.mjs [output-file]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath   = process.argv[2] ?? path.join(__dirname, 'dist-single', 'index.html');
const read      = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const strip = (src) => src
  .replace(/import\s+[\s\S]*?from\s+['"][^'"]*['"];?\n?/g, '')
  .replace(/^export\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export default function /gm, 'function ')
  .replace(/^export default class /gm, 'class ')
  .replace(/^export default /gm, 'const _default = ')
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ');

const config = read('src/config.js')
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ');

const css = read('src/styles.css');

const files = [
  'src/utils.js',
  'src/metrics.js',
  'src/hooks/useTooltipPortal.jsx',
  'src/components/StatCard.jsx',
  'src/components/MetricCard.jsx',
  'src/components/KPICard.jsx',
  'src/components/uiHelpers.jsx',
  'src/hooks.js',
  'src/hooks/usePortfolioMetrics.js',
  'src/hooks/useTransactionView.js',
  'src/metricDefs.jsx',
  'src/components/Tooltip.jsx',
  'src/components/MultiSelect.jsx',
  'src/components/Collapsible.jsx',
  'src/components/StarRating.jsx',
  'src/components/ResetColumnsButton.jsx',
  'src/components/DateRangeFilter.jsx',
  'src/components/FinancialPeriodSection.jsx',
  'src/components/IncomeExpensesSection.jsx',
  'src/components/YtdSection.jsx',
  'src/components/PropertyCard.jsx',
  'src/components/Sidebar.jsx',
  'src/components/Analytics.jsx',
  'src/components/Dashboard.jsx',
  'src/components/PropertiesView.jsx',
  'src/components/PropertyDetail.jsx',
  'src/components/ExpensesView.jsx',
  'src/components/IncomeView.jsx',
  'src/components/TenantsView.jsx',
  'src/components/EventsView.jsx',
  'src/components/EvaluatorView.jsx',
  'src/components/RenovationView.jsx',
  'src/modals/ModalBase.jsx',
  'src/modals/PropertyModal.jsx',
  'src/modals/ExpenseModal.jsx',
  'src/modals/IncomeModal.jsx',
  'src/modals/TenantModal.jsx',
  'src/App.jsx',
];

const sources = files.map(f => {
  const label = f.padEnd(55, '\u2500');
  return `\n// \u2500\u2500 ${label}\n${strip(read(f))}`;
});

const mockAPI = `
// ====================================================================
//  MOCK API  \u2014  replaces Flask backend for the standalone demo
// ====================================================================

const MOCK_PROPERTIES = [
  {
    id: 1, name: 'Skyline Condo', type: 'Condo', province: 'AB', city: 'Calgary',
    address: '1200 Burrard St', postal_code: 'T2P 1A1', parking: '1 stall',
    purchase_price: 385000, market_price: 440000, loan_amount: 308000,
    mortgage_rate: 5.1, monthly_rent: 2300, poss_date: '2021-06-01',
    status: 'Rented', notes: 'Corner unit, mountain views',
    expected_condo_fees: 520, expected_insurance: 90, expected_utilities: 0,
    expected_misc_expenses: 60, expected_appreciation_pct: 4,
    annual_property_tax: 2800, mortgage_payment: 1680, mortgage_frequency: 'monthly',
    total_income: 82800, total_expenses: 104200, is_archived: 0,
  },
  {
    id: 2, name: 'Parkview House', type: 'House', province: 'AB', city: 'Edmonton',
    address: '47 Elm Crescent', postal_code: 'T6G 0B2', parking: '2 stalls',
    purchase_price: 510000, market_price: 595000, loan_amount: 382500,
    mortgage_rate: 4.75, monthly_rent: 2850, poss_date: '2020-03-15',
    status: 'Rented', notes: 'Renovated 2023',
    expected_condo_fees: 0, expected_insurance: 140, expected_utilities: 120,
    expected_misc_expenses: 80, expected_appreciation_pct: 3.5,
    annual_property_tax: 4200, mortgage_payment: 2050, mortgage_frequency: 'monthly',
    total_income: 136800, total_expenses: 139500, is_archived: 0,
  },
  {
    id: 3, name: 'Downtown Loft', type: 'Condo', province: 'BC', city: 'Vancouver',
    address: '320 Granville St #801', postal_code: 'V6C 1S9', parking: 'None',
    purchase_price: 720000, market_price: 810000, loan_amount: 576000,
    mortgage_rate: 5.25, monthly_rent: 3400, poss_date: '2022-10-01',
    status: 'Vacant', notes: 'Currently between tenants',
    expected_condo_fees: 680, expected_insurance: 110, expected_utilities: 0,
    expected_misc_expenses: 75, expected_appreciation_pct: 5,
    annual_property_tax: 5100, mortgage_payment: 3180, mortgage_frequency: 'monthly',
    total_income: 61200, total_expenses: 89400, is_archived: 0,
  },
];

const _dAgo = (n) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
const _mAgo = (n, day=1) => { const d = new Date(); d.setMonth(d.getMonth()-n); d.setDate(day); return d.toISOString().split('T')[0]; };
const _mAgoISO = (n) => { const d = new Date(); d.setMonth(d.getMonth()-n); return d.toISOString(); };

const MOCK_EXPENSES = [
  ...Array.from({length:36},(_,i)=>({id:100+i,property_id:1,property_name:'Skyline Condo',expense_date:_mAgo(i,5),amount:1680,expense_type:'Recurrent',expense_category:'Mortgage',notes:'Monthly mortgage',tax_deductible:0})),
  ...Array.from({length:36},(_,i)=>({id:200+i,property_id:1,property_name:'Skyline Condo',expense_date:_mAgo(i,8),amount:520,expense_type:'Recurrent',expense_category:'Management',notes:'Condo fees',tax_deductible:1})),
  {id:301,property_id:1,property_name:'Skyline Condo',expense_date:_dAgo(45),amount:850,expense_type:'One-time',expense_category:'Maintenance',notes:'Dishwasher replacement',tax_deductible:1},
  {id:302,property_id:1,property_name:'Skyline Condo',expense_date:_dAgo(120),amount:2800,expense_type:'Recurrent',expense_category:'Tax',notes:'Annual property tax',tax_deductible:1},
  {id:303,property_id:1,property_name:'Skyline Condo',expense_date:_dAgo(1200),amount:77000,expense_type:'One-time',expense_category:'Principal',notes:'Down payment',tax_deductible:0},
  ...Array.from({length:48},(_,i)=>({id:400+i,property_id:2,property_name:'Parkview House',expense_date:_mAgo(i,3),amount:2050,expense_type:'Recurrent',expense_category:'Mortgage',notes:'Monthly mortgage',tax_deductible:0})),
  ...Array.from({length:48},(_,i)=>({id:500+i,property_id:2,property_name:'Parkview House',expense_date:_mAgo(i,12),amount:140,expense_type:'Recurrent',expense_category:'Insurance',notes:'Insurance',tax_deductible:1})),
  {id:601,property_id:2,property_name:'Parkview House',expense_date:_dAgo(30),amount:4200,expense_type:'Recurrent',expense_category:'Tax',notes:'Property tax 2025',tax_deductible:1},
  {id:602,property_id:2,property_name:'Parkview House',expense_date:_dAgo(90),amount:1200,expense_type:'One-time',expense_category:'Capital',notes:'New water heater',tax_deductible:1},
  {id:603,property_id:2,property_name:'Parkview House',expense_date:_dAgo(1600),amount:127500,expense_type:'One-time',expense_category:'Principal',notes:'Down payment',tax_deductible:0},
  ...Array.from({length:16},(_,i)=>({id:700+i,property_id:3,property_name:'Downtown Loft',expense_date:_mAgo(i,5),amount:3180,expense_type:'Recurrent',expense_category:'Mortgage',notes:'Monthly mortgage',tax_deductible:0})),
  ...Array.from({length:16},(_,i)=>({id:800+i,property_id:3,property_name:'Downtown Loft',expense_date:_mAgo(i,10),amount:680,expense_type:'Recurrent',expense_category:'Management',notes:'Strata fees',tax_deductible:1})),
  {id:901,property_id:3,property_name:'Downtown Loft',expense_date:_dAgo(60),amount:5100,expense_type:'Recurrent',expense_category:'Tax',notes:'Annual property tax',tax_deductible:1},
  {id:902,property_id:3,property_name:'Downtown Loft',expense_date:_dAgo(1800),amount:144000,expense_type:'One-time',expense_category:'Principal',notes:'Down payment',tax_deductible:0},
];

const MOCK_INCOME = [
  ...Array.from({length:36},(_,i)=>({id:100+i,property_id:1,property_name:'Skyline Condo',income_date:_mAgo(i,1),amount:2300,income_type:'Rent',notes:'Monthly rent'})),
  ...Array.from({length:48},(_,i)=>({id:200+i,property_id:2,property_name:'Parkview House',income_date:_mAgo(i,1),amount:2850,income_type:'Rent',notes:'Monthly rent'})),
  {id:299,property_id:2,property_name:'Parkview House',income_date:_dAgo(1600),amount:2000,income_type:'Deposit',notes:'Security deposit'},
  ...Array.from({length:12},(_,i)=>({id:300+i,property_id:3,property_name:'Downtown Loft',income_date:_mAgo(i+4,1),amount:3400,income_type:'Rent',notes:'Monthly rent'})),
];

const MOCK_TENANTS = [
  {id:1,property_id:1,property_name:'Skyline Condo',name:'Sarah Chen',phone:'403-555-0142',email:'sarah.chen@email.com',lease_start:'2022-07-01',lease_end:null,deposit:2300,rent_amount:2300,notes:'Excellent tenant',is_archived:0},
  {id:2,property_id:2,property_name:'Parkview House',name:'Marcus & Julie Webb',phone:'780-555-0287',email:'mwebb@email.com',lease_start:'2021-04-01',lease_end:null,deposit:2850,rent_amount:2850,notes:'Family, pets approved',is_archived:0},
  {id:3,property_id:3,property_name:'Downtown Loft',name:'Alex Tanaka',phone:'604-555-0391',email:'alex.t@email.com',lease_start:'2022-11-01',lease_end:_mAgo(4),deposit:3400,rent_amount:3400,notes:'Left in good standing',is_archived:0},
];

const MOCK_EVENTS = [
  {id:1,property_id:1,property_name:'Skyline Condo',column_name:'status',old_value:'Vacant',new_value:'Rented',description:'Sarah Chen move-in',created_at:'2022-07-01T10:00:00'},
  {id:2,property_id:1,property_name:'Skyline Condo',column_name:'monthly_rent',old_value:'2150',new_value:'2300',description:'Annual rent increase',created_at:'2023-07-01T09:00:00'},
  {id:3,property_id:1,property_name:'Skyline Condo',column_name:'market_price',old_value:'410000',new_value:'440000',description:'Market appraisal update',created_at:'2024-01-15T14:00:00'},
  {id:4,property_id:2,property_name:'Parkview House',column_name:'status',old_value:'Vacant',new_value:'Rented',description:'Webb family moved in',created_at:'2021-04-01T10:00:00'},
  {id:5,property_id:2,property_name:'Parkview House',column_name:'market_price',old_value:'540000',new_value:'595000',description:'Post-renovation appraisal',created_at:'2024-03-01T11:00:00'},
  {id:6,property_id:3,property_name:'Downtown Loft',column_name:'status',old_value:'Vacant',new_value:'Rented',description:'Alex Tanaka lease start',created_at:'2022-11-01T10:00:00'},
  {id:7,property_id:3,property_name:'Downtown Loft',column_name:'status',old_value:'Rented',new_value:'Vacant',description:'Tenant departure',created_at:_mAgoISO(4)},
  {id:8,property_id:3,property_name:'Downtown Loft',column_name:'market_price',old_value:'760000',new_value:'810000',description:'Market valuation update',created_at:'2024-06-01T10:00:00'},
];

const _realFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  const p = typeof url === 'string' ? url : url.toString();
  const method = (opts.method || 'GET').toUpperCase();
  const json = (data, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(data), { status, headers: {'Content-Type':'application/json'} }));

  if (method==='GET' && p.match(/^\\/api\\/properties$/))
    return json(MOCK_PROPERTIES.filter(x=>!x.is_archived));
  if (method==='GET' && p.match(/^\\/api\\/properties\\/\\d+$/))  {
    const id=parseInt(p.split('/').pop()); const prop=MOCK_PROPERTIES.find(x=>x.id===id);
    return prop ? json(prop) : json({error:'Not found'},404);
  }
  if (method==='GET' && p.startsWith('/api/expenses')) {
    const pid=new URL(p,'http://x').searchParams.get('property_id');
    return json(pid ? MOCK_EXPENSES.filter(e=>e.property_id===parseInt(pid)) : MOCK_EXPENSES);
  }
  if (method==='GET' && p.startsWith('/api/income')) {
    const pid=new URL(p,'http://x').searchParams.get('property_id');
    return json(pid ? MOCK_INCOME.filter(i=>i.property_id===parseInt(pid)) : MOCK_INCOME);
  }
  if (method==='GET' && p.startsWith('/api/tenants')) {
    const pid=new URL(p,'http://x').searchParams.get('property_id');
    const arch=new URL(p,'http://x').searchParams.get('archived');
    let data=arch ? MOCK_TENANTS : MOCK_TENANTS.filter(t=>!t.is_archived);
    if(pid) data=data.filter(t=>t.property_id===parseInt(pid));
    return json(data);
  }
  if (method==='GET' && p.startsWith('/api/events')) {
    const pid=new URL(p,'http://x').searchParams.get('property_id');
    const data=pid ? MOCK_EVENTS.filter(e=>e.property_id===parseInt(pid)) : MOCK_EVENTS;
    return json([...data].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
  }
  if (['POST','PUT','DELETE'].includes(method)) {
    let body={};try{body=JSON.parse(opts.body||'{}')}catch{}
    return json({...body,id:Math.floor(Math.random()*9000)+1000,_demo:true});
  }
  return json({error:'Not found'},404);
};
// ====================================================================
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Equitee \u2014 Real Estate Portfolio Manager</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/prop-types@15/prop-types.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/recharts@2.13.3/umd/Recharts.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
${css}
  .demo-banner{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:linear-gradient(90deg,#1e3a5f,#1a2e4a);border-top:1px solid #2d4a6e;padding:0.45rem 1.25rem;display:flex;align-items:center;justify-content:center;gap:0.75rem;font-size:0.78rem;color:#93c5fd;font-family:inherit;}
  .demo-banner strong{color:#dbeafe;}
  .demo-banner a{color:#60a5fa;text-decoration:underline;}
  </style>
</head>
<body>
  <div id="root"></div>
  <div class="demo-banner">
    <span>\uD83C\uDF9B\uFE0F</span>
    <strong>Demo mode</strong>
    <span>\u2014 sample data, no backend required. Edits are accepted but not persisted.</span>
    <span>\u00B7</span>
    <a href="https://github.com/you/equitee" target="_blank">github.com/you/equitee</a>
  </div>

  <script type="text/babel">
    const { useState, useEffect, useMemo, useRef, useCallback } = React;
    const { createPortal } = ReactDOM;
    const { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
            XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = Recharts;

    // \u2500\u2500 config.js \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
${config}

${mockAPI}
${sources.join('\n')}

    // \u2500\u2500 Mount \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    ReactDOM.createRoot(document.getElementById('root')).render(
      React.createElement(React.StrictMode, null, React.createElement(App))
    );
  </script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`\u2713 Equitee demo \u2192 ${outPath} (${kb} KB)`);
