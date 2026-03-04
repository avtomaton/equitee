# Real Estate Portfolio Manager - Enhanced Edition

A comprehensive, professional real estate management system with full CRUD operations for properties, expenses, and income tracking.

## 🎯 New Features

### ✅ Implemented
- **Left Sidebar Navigation** - Easy navigation between Dashboard, Properties, Income, and Expenses
- **Dashboard View** - Portfolio overview with statistics and charts
- **Properties View** - Browse all properties with search and filtering
- **Property Detail View** - Click any property to see detailed statistics and charts
- **Expenses Management** - Full CRUD for expenses with filtering, sorting, and grouping
- **Income Management** - Full CRUD for income entries with filtering and sorting
- **Responsive Modals** - Add/edit properties, expenses, and income from anywhere
- **Beautiful Charts** - Visual analytics using Recharts
- **Professional Design** - Modern dark theme with smooth animations

## 📋 Features Breakdown

### 1. Navigation
- Fixed left sidebar with sections:
  - **Overview**: Dashboard, Properties
  - **Financials**: Income, Expenses
- Active state highlighting
- Smooth transitions

### 2. Dashboard
- Portfolio statistics cards:
  - Total Properties
  - Portfolio Value
  - Total Income
  - Total Expenses
  - Net Profit
- Interactive bar chart showing income vs expenses by property
- Recent properties grid with click-to-view details

### 3. Properties View
- Grid display of all properties
- Search by property name or city
- Filter by status (Active/Pending)
- Click any property card to view details
- Add new property button

### 4. Property Detail View
- Complete property information
- Financial statistics:
  - Purchase Price
  - Market Value
  - Loan Amount
  - Monthly Rent
  - Total Income
  - Total Expenses
  - Net Income
  - ROI calculation
- Financial overview chart
- Quick actions: Add Expense, Add Income
- Back button to return to properties list

### 5. Expenses View
- Complete table of all expenses across all properties
- Filter by:
  - Property
  - Category (Maintenance, Utilities, Insurance, etc.)
- Sort by:
  - Date (ascending/descending)
  - Amount (ascending/descending)
- Summary statistics:
  - Total Expenses
  - Total Transactions
- Add new expense button
- Expenses grouped and displayed in clean table format

### 6. Income View
- Complete table of all income across all properties
- Filter by:
  - Property
  - Type (Rent, Security Deposit, Late Fee, etc.)
- Sort by:
  - Date (ascending/descending)
  - Amount (ascending/descending)
- Summary statistics:
  - Total Income
  - Total Transactions
- Add new income button
- Clean table display with color-coded amounts

### 7. Modals
All modals feature:
- Clean, modern design
- Form validation
- Proper error handling
- Smooth animations

**Property Modal:**
- All property fields (name, address, city, province, postal code, parking)
- Financial fields (purchase price, market price, loan amount, monthly rent)
- Possession date
- Status dropdown

**Expense Modal:**
- Property selector
- Date picker
- Amount input
- Category dropdown (Maintenance, Utilities, Insurance, Property Tax, Mortgage, Other)
- Type input
- Description textarea
- Can be opened from Expenses view or Property Detail view

**Income Modal:**
- Property selector
- Date picker
- Amount input
- Type dropdown (Rent, Security Deposit, Late Fee, Other)
- Description textarea
- Can be opened from Income view or Property Detail view

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- pip

### Installation

1. **Install dependencies:**
```bash
pip install Flask flask-cors
```

2. **Run the backend:**
```bash
python app-enhanced.py
```

Server will start on `http://localhost:5000`

3. **Open the frontend:**
Simply open `frontend-enhanced.html` in your web browser.

The app will automatically connect to the backend.

## 📁 File Structure

```
real-estate-manager/
├── app-enhanced.py           # Flask backend with all API endpoints
├── frontend-enhanced.html    # Complete frontend application
└── real_estate.db           # SQLite database (auto-created)
```

## 🔧 API Endpoints

### Properties
- `GET /api/properties` - Get all properties
- `GET /api/properties/<id>` - Get single property with totals
- `POST /api/properties` - Create new property
- `PUT /api/properties/<id>` - Update property
- `DELETE /api/properties/<id>` - Delete property

### Expenses
- `GET /api/expenses` - Get all expenses (optional: `?property_id=X`)
- `POST /api/expenses` - Create new expense
- `PUT /api/expenses/<id>` - Update expense
- `DELETE /api/expenses/<id>` - Delete expense

### Income
- `GET /api/income` - Get all income (optional: `?property_id=X`)
- `POST /api/income` - Create new income
- `PUT /api/income/<id>` - Update income
- `DELETE /api/income/<id>` - Delete income

### Other
- `GET /api/statistics` - Get portfolio statistics
- `GET /api/export` - Export all data as JSON
- `POST /api/import` - Import data from JSON
- `GET /api/health` - Health check

## 💾 Database Schema

### Properties Table
```sql
- id (INTEGER PRIMARY KEY)
- name (TEXT)
- province (TEXT)
- city (TEXT)
- address (TEXT)
- postal_code (TEXT)
- parking (TEXT)
- purchase_price (REAL)
- market_price (REAL)
- loan_amount (REAL)
- monthly_rent (REAL)
- poss_date (TEXT)
- status (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Expenses Table
```sql
- id (INTEGER PRIMARY KEY)
- property_id (INTEGER FOREIGN KEY)
- expense_date (TEXT)
- amount (REAL)
- expense_type (TEXT)
- expense_category (TEXT)
- description (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Income Table
```sql
- id (INTEGER PRIMARY KEY)
- property_id (INTEGER FOREIGN KEY)
- income_date (TEXT)
- amount (REAL)
- income_type (TEXT)
- description (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

## 🎨 Design Features

### Color Scheme
- **Primary Background**: Deep navy (#0f1419)
- **Secondary Background**: Slate (#1a1f2e)
- **Accent**: Blue (#3b82f6)
- **Success**: Green (#10b981)
- **Danger**: Red (#ef4444)
- **Warning**: Orange (#f59e0b)

### Typography
- **Headings**: Cormorant Garamond (serif) - elegant, professional
- **Body**: Work Sans (sans-serif) - clean, readable

### Animations
- Smooth page transitions
- Hover effects on cards
- Modal slide-up entrance
- Button hover states
- Sidebar active indicators

## 🔍 Usage Tips

### Adding a Property
1. Click "Properties" in sidebar
2. Click "+ Add Property" button
3. Fill in all required fields
4. Click "Add Property"

### Viewing Property Details
1. From Dashboard or Properties view
2. Click on any property card
3. View detailed statistics and charts
4. Add expenses or income directly from this view

### Managing Expenses
1. Click "Expenses" in sidebar
2. Filter by property or category
3. Sort by date or amount
4. Click "+ Add Expense" to add new
5. Select property, enter details, save

### Managing Income
1. Click "Income" in sidebar
2. Filter by property or type
3. Sort by date or amount
4. Click "+ Add Income" to add new
5. Select property, enter details, save

### Quick Workflow
1. **Add properties** first
2. **Add income** entries (rent payments, deposits)
3. **Add expenses** (maintenance, utilities, taxes)
4. **View Dashboard** to see portfolio performance
5. **Click properties** to see individual property analytics

## 📊 Analytics

### Dashboard Metrics
- **Property Count**: Total number of properties
- **Portfolio Value**: Sum of all market prices
- **Total Income**: All income across all properties
- **Total Expenses**: All expenses across all properties
- **Net Profit**: Income - Expenses

### Property Metrics
- **ROI**: (Net Income / Market Price) × 100%
- **Net Income**: Total Income - Total Expenses
- Calculated in real-time based on actual transactions

### Charts
- Bar chart comparing income vs expenses by property
- Property detail financial overview
- Color-coded for easy reading

## 🐛 Troubleshooting

### Frontend Can't Connect to Backend
1. Verify backend is running: `python app-enhanced.py`
2. Check console for errors (F12 in browser)
3. Ensure port 5000 is not blocked
4. Check that API_URL in frontend matches backend

### Data Not Showing
1. Check browser console for errors
2. Verify database file exists (`real_estate.db`)
3. Check API responses in Network tab (F12)
4. Try refreshing the page

### Modal Not Opening
1. Check browser console for JavaScript errors
2. Ensure React libraries are loaded
3. Try hard refresh (Ctrl+Shift+R)

## 🚀 Future Enhancements

### Suggested Features
- [ ] Tenant management
- [ ] Document uploads
- [ ] Property photos
- [ ] Payment reminders
- [ ] Lease tracking
- [ ] Maintenance scheduling
- [ ] Export to PDF reports
- [ ] Email notifications
- [ ] Multi-user authentication
- [ ] Mobile app version
- [ ] Property comparison tool
- [ ] Cash flow forecasting
- [ ] Tax reporting
- [ ] Bulk import from CSV

## 📝 Notes

### Data Relationships
- Expenses and Income are linked to Properties via `property_id`
- When a property is deleted, all associated expenses and income are automatically deleted (CASCADE)
- Totals are calculated dynamically via SQL queries

### Performance
- Efficient SQL queries with proper indexing
- Client-side filtering and sorting for instant responses
- Lazy loading of property details
- Optimized chart rendering

### Security Considerations
For production use, consider:
- Add authentication (JWT tokens)
- Implement rate limiting
- Use HTTPS
- Validate all inputs server-side
- Add CSRF protection
- Implement role-based access control

## 📄 License

This is a custom-built real estate management system. Use and modify as needed for your portfolio management needs.

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify API endpoints are responding
4. Check database schema matches expected structure

## 🎉 Acknowledgments

Built with:
- **Flask** - Python web framework
- **React** - UI library
- **Recharts** - Charting library
- **SQLite** - Database
- **Work Sans & Cormorant Garamond** - Typography
