#!/usr/bin/env node

// amalgamate.mjs
// Bundles the Vite project back into a single self-contained HTML file.
// Usage: node amalgamate.mjs [output-file]
// Output defaults to: dist-single/index.html

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath   = process.argv[2] ?? path.join(__dirname, 'dist-single', 'index.html');

// ─── Load files ──────────────────────────────────────────────────────────────

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const css = read('src/styles.css');

// Config — strip named exports since everything shares one scope
const config = read('src/config.js')
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ');

// Components and modals in dependency order (leaves first, App last)
// Note: main.jsx is intentionally excluded — mounting is handled explicitly below
const jsxFiles = [
  'src/components/MultiSelect.jsx',
  'src/components/Sidebar.jsx',
  'src/components/PropertyCard.jsx',
  'src/components/Dashboard.jsx',
  'src/components/PropertiesView.jsx',
  'src/components/ExpensesView.jsx',
  'src/components/IncomeView.jsx',
  'src/components/EventsView.jsx',
  'src/components/PropertyDetail.jsx',
  'src/modals/PropertyModal.jsx',
  'src/modals/ExpenseModal.jsx',
  'src/modals/IncomeModal.jsx',
  'src/App.jsx',
];

// Strip ES module syntax — not needed when everything is one shared scope
const stripModuleSyntax = (src) =>
  src
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]*['"];?\n?/g, '')  // remove imports (multi-line safe)
    .replace(/^export default function /gm, 'function ')           // export default function X
    .replace(/^export default class /gm, 'class ')                 // export default class X
    .replace(/^export default /gm, '')                             // export default <expression>
    .replace(/^export \{[^}]*\};?\s*$/gm, '')                      // export { X, Y }
    .replace(/^export const /gm, 'const ')                         // export const X
    .replace(/^export function /gm, 'function ');                   // export function X

const jsxSources = jsxFiles.map((file) => {
  const src = stripModuleSyntax(read(file));
  return `\n// ── ${file} ${'─'.repeat(Math.max(0, 60 - file.length))}\n${src}`;
});

// ─── Assemble ─────────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Real Estate Portfolio Manager</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/prop-types@15/prop-types.min.js"></script>
  <script src="https://unpkg.com/recharts@2.13.3/umd/Recharts.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
${css}
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">
    const { useState, useEffect, useMemo, useRef } = React;
    const { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
            XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = Recharts;

    // ── config.js ─────────────────────────────────────────────────────
${config}
${jsxSources.join('\n')}

    // ── mount ─────────────────────────────────────────────────────────
    ReactDOM.render(
      React.createElement(React.StrictMode, null, React.createElement(App)),
      document.getElementById('root')
    );
  </script>
</body>
</html>
`;

// ─── Write output ─────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✓ Amalgamated → ${outPath} (${kb} KB)`);
