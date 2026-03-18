# Equitee

A self-hosted real estate portfolio management and analytics application. Track properties, income, expenses, and tenants; analyse portfolio-level financial health, dig into details, create properties groups; receive property-wise, group-wise and portfolio-wise insights and recommendations; evaluate prospective property profitability before making a purchase decision; and plan renovations — all from a user-friendly customizable web application.

What started as a spreadsheet quickly overgrew spreadsheet limitations, and now the project contains main real estate performance metrics, some charts, multiple views and filters, and gives a pretty good picture of a real estate portfolio from a financial perspective. But live demo is better than a thousand words, so check it out and make your own conclusions. I will really uppreciate if you reach out to me with any feedback.

---

## Live Demo

Live demo with sample data is available here: [Equitee](https://avtomaton.github.io/equitee "Real Estate Portfolio Analysis")

## Self-Hosted Demo

Just open the demo html - it will work out-of-the box with sample data; you won't be able to save anything though.

```bash
open demo/index.html
# or: python -m http.server 8080 --directory frontend/dist-single
```

The demo ships with three sample properties (Skyline Condo, Parkview House, Downtown Loft) covering a mix of condo and house types across Alberta and BC, with full income, expense, tenant, and event histories. All views and tools are fully interactive — edits are accepted but not persisted between page loads.

## Build It, Own It

Self-contained demo with sample data is included — no server required, but when you feel you need your own app please jump to the "Getting Started" section. The entire app and data can be hosted locally with minimum effort, or easily launched on a VPS/VDS. This requires a bit of tech skills, but I consider if you're using github you already have them. If you liked the app but don't have time, and need a SaaS version, please contact me - the app is not mature enough for widespread sales, these requests are considered on a case-by-case basis.

---

## Features

### Portfolio Management
- **Properties** — full CRUD with soft-archive, possession dates, mortgage details, and budgeted operating costs
- **Income & Expenses** — per-property ledgers with category/type tagging, tax-deductibility tracking, and date-range filters
- **Tenants** — lease tracking with current/past/archived status, soft-delete with restore
- **Events Log** — automatic change history on every property field edit; editable notes; full audit trail

### Analytics & Metrics
- **Dashboard** — portfolio KPIs, appreciation, YTD income/expenses, monthly averages, key ratios, 3-chart overview
- **Properties view** — filterable table with per-property scores, ROI, equity, and loan columns; Analytics panel with 10+ charts
- **Property Detail** — 50+ metrics per property: cap rate, DSCR, ICR, OER, IRR, payback, break-even, economic vacancy, maintenance ratio, and more — all with budgeted (Exp) comparisons where applicable

### Financial Metrics Glossary
| Metric | What it measures |
|--------|-----------------|
| Cap Rate | Annual NOI ÷ market value — yield on the asset |
| DSCR | Monthly NOI ÷ monthly mortgage — can income service the debt? |
| ICR | Annual NOI ÷ annual interest — interest coverage with expected comparison |
| OER | Operating expenses ÷ gross income — cost efficiency |
| Cash-on-Cash | Annual cash flow ÷ equity — return on your invested capital |
| IRR | Internal rate of return — annualised return across all cash flows |
| Economic Vacancy | Lost rent from vacancy periods ÷ potential rent — event-based, rent-timeline-aware |
| Payback Period | Time for cumulative cash flow to recover total expenses |
| Break-even | Time for net position (market + income − expenses − loan) to reach zero |

### Planning Tools
- **Evaluator** — model a prospective property purchase: inputs, scenario sliders, 10-year projection, investment score
- **Renovation Planner** — enter current/planned price, rent lift, renovation cost and duration; get pure payback, appreciation-adjusted payback, full-gain payback, and reno ROI — with live sensitivity sliders

### Data Management
- **Import / Export** — full portfolio JSON export; bulk JSON import with schema validation
- **Column visibility** — per-view toggle with cookie persistence and reset
- **Hash-based routing** — bookmarkable views (`#dashboard`, `#properties`, etc.)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3, Flask 3, SQLite (via stdlib `sqlite3`) |
| Frontend | React 18, Vite 6 |
| Charts | Recharts 2 |
| Styling | Plain CSS with CSS variables (dark-mode ready) |
| State | React hooks only — no Redux or external state library |

No Docker required. No cloud services. No telemetry. All data lives in a single `real_estate.db` file next to `app.py`.

---

## Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Clone & install backend

```bash
git clone https://github.com/you/equitee.git
cd equitee
pip install -r requirements.txt
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Run in development

Open two terminals:

```bash
# Terminal 1 — Flask API (port 5000)
python app.py

# Terminal 2 — Vite dev server (port 5173)
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite dev server proxies `/api/*` requests to `http://localhost:5000`, so there is no CORS configuration needed during development.

### 4. Build for production

```bash
cd frontend
npm run build
```

The `dist/` output is a static site. Serve it from any web server (nginx, Caddy, etc.) and point it at the Flask API. A simple self-hosted setup runs both behind nginx with the API mounted at `/api`.

---

## Project Structure

```
equitee/
├── app.py                  # Flask API — all routes
├── requirements.txt
├── real_estate.db          # Created automatically on first run
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx             # Root component, routing, modal orchestration
        ├── config.js           # Constants: column defs, option lists, API URL
        ├── metrics.js          # Pure financial math (cap rate, IRR, vacancy…)
        ├── utils.js            # Pure helpers: dates, formatting, option merging
        ├── hooks.js            # useColumnVisibility, usePortfolioAggregates
        ├── components/
        │   ├── Dashboard.jsx       # Portfolio overview with charts
        │   ├── PropertiesView.jsx  # Filterable table + Analytics panel
        │   ├── PropertyDetail.jsx  # Single-property deep-dive (50+ metrics)
        │   ├── PropertyCard.jsx    # Summary card shown on Dashboard
        │   ├── Analytics.jsx       # Detailed charts + metric rows (inside Properties)
        │   ├── ExpensesView.jsx    # Expense ledger with filters
        │   ├── IncomeView.jsx      # Income ledger with filters
        │   ├── TenantsView.jsx     # Tenant management with archive
        │   ├── EventsView.jsx      # Audit log with inline note editing
        │   ├── EvaluatorView.jsx   # Prospective-purchase calculator
        │   ├── RenovationView.jsx  # Renovation ROI planner
        │   ├── uiHelpers.jsx       # Shared formatters, MetricCard shorthand, chart helpers
        │   └── ...                 # KPICard, MetricCard, StatCard, MultiSelect, etc.
        ├── hooks/
        │   ├── usePortfolioMetrics.js   # Derived portfolio ratios (shared by Dashboard & Analytics)
        │   ├── useTransactionView.js    # Shared state/logic for Expenses & Income views
        │   └── useTooltipPortal.js      # Portal-based tooltip for card components
        └── modals/
            ├── ModalBase.jsx       # Shared: ModalOverlay, DateInput, PropertyOptions, QUICK_BTN_STYLE
            ├── PropertyModal.jsx
            ├── ExpenseModal.jsx
            ├── IncomeModal.jsx
            └── TenantModal.jsx
```

---

## Demo Update

I don't really know why you might need it - from my opinion it takes almost the same effort as running an app, but there's an option to regenerate single-file demo html. It's mainly for my convenience and won't be properly maintained, so potentially will have bugs. Anyway, to regenerate after code changes:

```bash
cd frontend && node amalgamate.mjs
```

---

## API Reference

All endpoints return JSON. Errors return `{"error": "message"}` with an appropriate HTTP status.

### Properties
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/properties` | List all active properties (add `?archived=1` for archived) |
| `GET` | `/api/properties/:id` | Single property with computed totals |
| `POST` | `/api/properties` | Create property |
| `PUT` | `/api/properties/:id` | Update property (auto-writes change events) |
| `DELETE` | `/api/properties/:id` | Soft-archive |
| `POST` | `/api/properties/:id/restore` | Restore archived property |

### Expenses
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/expenses` | All expenses (add `?property_id=N` to filter) |
| `POST` | `/api/expenses` | Create expense |
| `PUT` | `/api/expenses/:id` | Update expense |
| `DELETE` | `/api/expenses/:id` | Delete expense |

### Income
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/income` | All income records (add `?property_id=N` to filter) |
| `POST` | `/api/income` | Create income record |
| `PUT` | `/api/income/:id` | Update income record |
| `DELETE` | `/api/income/:id` | Delete income record |

### Tenants
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tenants` | All active tenants (add `?archived=1` for all, `?property_id=N` to filter) |
| `POST` | `/api/tenants` | Create tenant |
| `PUT` | `/api/tenants/:id` | Update tenant |
| `DELETE` | `/api/tenants/:id` | Soft-archive tenant |
| `POST` | `/api/tenants/:id/restore` | Restore archived tenant |

### Events & Misc
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | Change history (add `?property_id=N` to filter) |
| `PUT` | `/api/events/:id` | Edit event description/notes |
| `DELETE` | `/api/events/:id` | Delete event |
| `GET` | `/api/statistics` | Aggregated portfolio statistics |
| `GET` | `/api/export` | Full portfolio JSON export |
| `POST` | `/api/import` | Bulk import (replaces all data) |
| `GET` | `/api/health` | Health check |

---

## Data Model

```
properties
  id, name, type, province, city, address, postal_code, parking
  purchase_price, market_price, loan_amount, mortgage_rate
  mortgage_payment, mortgage_frequency, poss_date, monthly_rent, status
  expected_condo_fees, expected_insurance, expected_utilities,
  expected_misc_expenses, expected_appreciation_pct, annual_property_tax
  notes, is_archived, created_at, updated_at

expenses
  id, property_id, expense_date, amount
  expense_type, expense_category, notes, tax_deductible
  created_at, updated_at

income
  id, property_id, income_date, amount, income_type, notes
  created_at, updated_at

tenants
  id, property_id, name, phone, email, notes
  lease_start, lease_end, deposit, rent_amount
  is_archived, created_at, updated_at

events          ← auto-written on property updates
  id, property_id, column_name, old_value, new_value, description
  created_at
```

**Expense categories:** Mortgage · Principal · Management · Maintenance · Insurance · Utilities · Tax · Capital · Other

**Income types:** Rent · Deposit · Parking · Laundry · Other

**Property statuses:** Rented · Vacant · Primary

---

## Economic Vacancy Calculation

Economic vacancy is computed from the **Events log**, not from income records. This makes it accurate even when payments are delayed or irregular.

1. **Rent timeline** — `monthly_rent` change events are assembled into a sorted timeline. The rent applicable at the *start* of each vacancy period is used for lost-rent calculation, so a period vacant at $2,000/mo is not penalised as if it were vacant at the current $2,400/mo.

2. **Vacancy periods** — `status` change events are scanned for `Vacant → Rented` transitions. If the property was vacant at purchase (no preceding `→ Vacant` event exists), the period start falls back to the possession date.

3. **Window** — both potential rent and lost rent are measured over the trailing 12 months and clipped to the possession date, so a property acquired 5 months ago is judged on 5 months of ownership, not a full year.

Formula: **lost rent ÷ potential rent × 100**

---

## Renovation Planner

The planner models three payback views:

| View | What it measures |
|------|-----------------|
| **Pure Payback** | Time to recover `renovation cost + missed rent during works` purely from the monthly rent lift |
| **With Appreciation** | Same cost, but the immediate market-value uplift is credited on day one — only the remainder needs cash-flow recovery |
| **Full-Gain Payback** | Best-case: cost recovered via `monthly NOI + monthly appreciation` combined |

Five scenario sliders (planned price, appreciation rate, new rent, renovation cost, renovation time) let you stress-test assumptions without changing the base inputs.

---

---

## Contributing

Contributions are welcome and highly appreciated. The codebase is intentionally structured to make isolated changes easy — most features touch one or two files rather than spreading across the whole tree, but nothing is perfect, so both refactoring and functionality requests are welcome.

### Getting started

```bash
git clone https://github.com/you/equitee.git
cd equitee
pip install -r requirements.txt
cd frontend && npm install
```

Run the dev stack (two terminals):

```bash
# Backend
python app.py

# Frontend
cd frontend && npm run dev
```

### Where things live

| What you want to change | Where to look |
|------------------------|---------------|
| Financial math (cap rate, ICR, vacancy…) | `frontend/src/metrics.js` |
| Shared UI helpers, formatters | `frontend/src/components/uiHelpers.jsx` |
| Portfolio-level metric derivations | `frontend/src/hooks/usePortfolioMetrics.js` |
| A view's state and data fetching | `frontend/src/hooks/useTransactionView.js` |
| API routes | `app.py` |
| Database schema | `app.py` → `init_db()` |
| Demo mock data | `frontend/amalgamate.mjs` → `MOCK_*` constants |

### Guidelines

**Backend** — new routes should use `@handle_errors`, `db_cursor()`, `validate_required()`, and `require_exists()`. See any existing route for the pattern. No raw `try/except` or manual `conn.close()`.

**Frontend** — pure financial logic belongs in `metrics.js`, not in components. Shared UI patterns belong in `uiHelpers.jsx`. If you're adding a metric that appears in more than one place, add it to `usePortfolioMetrics` so Dashboard and Analytics stay in sync.

**Amalgamate compatibility** — while it is not a strict requirement, at this point it might be a good idea to maintain it. I am thinking about ditching it in future if it takes too much effort, but at this point the project is not fat enough to get rid of it, and, moreover, it keeps the code a little cleaner. The standalone demo concatenates all source files into a single JS scope. When adding a new file, add it to the `files` array in `amalgamate.mjs` in dependency order. When adding a new top-level `const` or `function`, make sure the name is unique across all source files — run this to check:

```bash
cd frontend
for f in src/**/*.{js,jsx} src/*.{js,jsx}; do grep -hE "^(const|function|class) [A-Za-z]" "$f" 2>/dev/null; done \
  | grep -oE "^(const|function|class) [A-Za-z_]+" | sort | uniq -d
```

An empty result means no collisions.

### Submitting changes

1. Fork the repository and create a branch from `main`
2. Make your change with a focused commit message
3. Regenerate the demo (`node amalgamate.mjs`) and confirm it loads in a browser
4. Open a pull request describing what changed and why

---

## License

BSD 3-clause. Basically do whatever you want with it - play with it, use for your records, copy, fork, distribute. If you find it useful it's already a great reward for me. If you decide to contribute it's even better.

