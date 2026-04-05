def init_db(conn):
    cursor = conn.cursor()

    # Properties
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            province TEXT NOT NULL,
            city TEXT NOT NULL,
            address TEXT NOT NULL,
            postal_code TEXT NOT NULL,
            parking TEXT,
            purchase_price REAL NOT NULL,
            market_price REAL NOT NULL,
            loan_amount REAL NOT NULL,
            monthly_rent REAL NOT NULL,
            poss_date TEXT NOT NULL,
            status TEXT NOT NULL,
            expected_condo_fees REAL DEFAULT 0,
            expected_insurance REAL DEFAULT 0,
            expected_utilities REAL DEFAULT 0,
            expected_misc_expenses REAL DEFAULT 0,
            expected_appreciation_pct REAL DEFAULT 0,
            annual_property_tax REAL DEFAULT 0,
            mortgage_rate REAL DEFAULT 0,
            mortgage_payment REAL DEFAULT 0,
            mortgage_frequency TEXT DEFAULT 'monthly',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_archived INTEGER DEFAULT 0
        )
    ''')

    # Expenses
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            expense_date TEXT NOT NULL,
            amount REAL NOT NULL,
            expense_type TEXT NOT NULL,
            expense_category TEXT NOT NULL,
            notes TEXT,
            tax_deductible INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Income
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS income (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            income_date TEXT NOT NULL,
            amount REAL NOT NULL,
            income_type TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Events
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            column_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Tenants
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            notes TEXT,
            lease_start TEXT NOT NULL,
            lease_end TEXT,
            deposit REAL DEFAULT 0,
            rent_amount REAL DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
        )
    ''')

    # Create indexes (better performance)
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_expenses_property ON expenses(property_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_income_property ON income(property_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_events_property ON events(property_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_income_date ON income(income_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_properties_archived ON properties(is_archived)')

    conn.commit()
    print("✅ Database initialized successfully!")
