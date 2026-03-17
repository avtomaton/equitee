# Equitee

A self-hosted real estate portfolio management and analytics application. Track properties, income, expenses, and tenants; analyse portfolio-level financial health; and plan renovations — all from a single local web app backed by a lightweight SQLite database.

---

## Live Demo

A self-contained demo with sample data is included — no server required.

```bash
open frontend/dist-single/index.html
# or: python -m http.server 8080 --directory frontend/dist-single
```

The demo ships with three sample properties (Skyline Condo, Parkview House, Downtown Loft) covering a mix of condo and house types across Alberta and BC, with full income, expense, tenant, and event histories. All views and tools are fully interactive — edits are accepted but not persisted between page loads.

To regenerate after code changes:

```bash
cd frontend && node amalgamate.mjs
```

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

## License

MIT
