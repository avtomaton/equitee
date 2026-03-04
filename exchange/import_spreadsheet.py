#!/usr/bin/env python3
"""
Import Google Spreadsheet (exported as CSV) to SQLite Database

Usage:
    1. Export your Google Spreadsheet as CSV (File → Download → CSV)
    2. Save it as 'data.csv' in the same folder as this script
    3. Run: python import_spreadsheet.py
"""

import sqlite3
import csv
import os
import sys

class SpreadsheetImporter:
    def __init__(self, csv_file='data.csv', db_path='database.db', table_name='transactions'):
        self.csv_file = csv_file
        self.db_path = db_path
        self.table_name = table_name
        
    def clean_amount(self, amount_str):
        """Clean currency values (removes $, commas, etc.)"""
        if not amount_str:
            return 0.0
        
        # Remove common currency symbols and formatting
        cleaned = str(amount_str).replace('$', '').replace('€', '').replace('£', '')
        cleaned = cleaned.replace(',', '').strip()
        
        try:
            return float(cleaned)
        except ValueError:
            print(f"  Warning: Could not parse amount '{amount_str}', using 0.0")
            return 0.0
    
    def validate_csv(self):
        """Check if CSV file exists and has correct columns"""
        if not os.path.exists(self.csv_file):
            print(f"✗ Error: File '{self.csv_file}' not found!")
            print(f"\nPlease:")
            print(f"  1. Export your Google Spreadsheet as CSV")
            print(f"  2. Save it as '{self.csv_file}' in this folder")
            return False
        
        # Check columns
        with open(self.csv_file, 'r', encoding='utf-8-sig') as file:
            reader = csv.DictReader(file)
            headers = reader.fieldnames

            # date,item_ref,amount,description,type,category
            # date,item_ref,amount,description
            if self.table_name == 'expenses':
                required = ['date', 'item_ref', 'amount', 'description', 'type', 'category']
            elif self.table_name == 'income':
                required = ['date', 'item_ref', 'amount', 'description']
            else:
                print(f"Wrong table name: {self.table_name}")
                return False

            missing = [col for col in required if col not in headers]
            
            if missing:
                print(f"✗ Error: Missing columns in CSV: {missing}")
                print(f"Found columns: {headers}")
                return False
                
        print(f"✓ CSV file validated: {self.csv_file}")
        return True
    
    def import_data(self):
        """Import CSV data into SQLite"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        imported = 0
        errors = 0
        
        print(f"\nImporting data...")
        
        with open(self.csv_file, 'r', encoding='utf-8-sig') as file:
            csv_reader = csv.DictReader(file)
            
            for i, row in enumerate(csv_reader, start=2):  # start=2 (row 1 is header)
                try:
                    if self.table_name == 'expenses':
                        cursor.execute(f'''
                            INSERT INTO {self.table_name} 
                            (expense_date, property_id, amount,
                            description, expense_type, expense_category)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (
                            row.get('date', '').strip(),
                            row.get('item_ref', '').strip(),
                            self.clean_amount(row.get('amount', 0)),
                            row.get('description', '').strip(),
                            row.get('type', '').strip(),
                            row.get('category', '').strip()
                        ))
                    else:
                        cursor.execute(f'''
                            INSERT INTO {self.table_name} 
                            (income_date, income_type, property_id, amount)
                            VALUES (?, ?, ?, ?)
                        ''', (
                            row.get('date', '').strip(),
                            row.get('description', '').strip(),
                            row.get('item_ref', '').strip(),
                            self.clean_amount(row.get('amount', 0)),

                        ))
                    imported += 1
                    
                    # Progress indicator
                    if imported % 100 == 0:
                        print(f"  Imported {imported} rows...")
                        
                except Exception as e:
                    print(f"✗ Error on row {i}: {e}")
                    print(f"  Data: {row}")
                    errors += 1
        
        conn.commit()
        conn.close()
        
        # Summary
        print(f"\n{'='*60}")
        print(f"Import Summary:")
        print(f"  ✓ Successfully imported: {imported} rows")
        if errors > 0:
            print(f"  ✗ Errors: {errors} rows")
        print(f"  → Database: {self.db_path}")
        print(f"  → Table: {self.table_name}")
        print(f"{'='*60}")
        
        return imported, errors
        
    def verify(self):
        """Verify and display import results"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get statistics
        cursor.execute(f'SELECT COUNT(*) FROM {self.table_name}')
        count = cursor.fetchone()[0]
        
        cursor.execute(f'SELECT SUM(amount) FROM {self.table_name}')
        total = cursor.fetchone()[0] or 0

        if self.table_name == 'expenses':
            cursor.execute(f'SELECT MIN(expense_date), MAX(expense_date) FROM {self.table_name}')
        else:
            cursor.execute(f'SELECT MIN(income_date), MAX(income_date) FROM {self.table_name}')
        date_range = cursor.fetchone()
        
        # Display statistics
        print(f"\n{'='*60}")
        print(f"Database Statistics:")
        print(f"  Total records: {count}")
        print(f"  Total amount: ${total:,.2f}")
        if date_range[0] and date_range[1]:
            print(f"  Date range: {date_range[0]} to {date_range[1]}")
        print(f"{'='*60}")
        
        # Show sample data
        cursor.execute(f'SELECT * FROM {self.table_name} LIMIT 5')
        rows = cursor.fetchall()
        
        if rows:
            print(f"\nSample data (first 5 rows):")
            if self.table_name == 'expenses':
                print(f"  {'ID':<5} {'Date':<12} {'Ref':<12} {'Amount':<12} {'Type':<15} {'Category':<15}")
                print(f"  {'-'*5} {'-'*12} {'-'*12} {'-'*12} {'-'*15} {'-'*15}")
                for row in rows:
                    print(f"  {row[0]:<5} {row[2]:<12} {str(row[1])[:10]:<12} ${row[3]:<11.2f} {str(row[4])[:13]:<15} {str(row[5])[:13]:<15}")
            else:
                print(f"  {'ID':<5} {'Date':<12} {'Ref':<12} {'Amount':<12} {'Type':<15}")
                print(f"  {'-' * 5} {'-' * 12} {'-' * 12} {'-' * 12} {'-' * 15}")
                for row in rows:
                    print(
                        f"  {row[0]:<5} {row[2]:<12} {str(row[1])[:10]:<12} ${row[3]:<11.2f} {str(row[4])[:13]:<15} {str(row[6])[:13]:<15}")
        
        conn.close()
    
    def run(self):
        """Run the complete import process"""
        print("="*60)
        print("Google Spreadsheet → SQLite Import Tool")
        print("="*60)
        
        # Validate CSV
        if not self.validate_csv():
            sys.exit(1)
        
        # Ask for confirmation if table exists
        if os.path.exists(self.db_path):
            response = input(f"\nDatabase '{self.db_path}' already exists. Continue? (y/n): ")
            if response.lower() != 'y':
                print("Import cancelled.")
                sys.exit(0)
        
        # Import data
        imported, errors = self.import_data()
        
        # Verify
        if imported > 0:
            self.verify()
        
        print(f"\n✓ Import complete!")
        print(f"\nYou can now query your data:")
        print(f"  sqlite3 {self.db_path}")
        print(f"  SELECT * FROM {self.table_name} LIMIT 10;")

def main():
    """Main entry point"""
    # You can customize these parameters
    csv_file = 'data.csv'
    db_path = 'database.db'
    table_name = 'transactions'
    
    # Check for command line arguments
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    if len(sys.argv) > 2:
        db_path = sys.argv[2]
    if len(sys.argv) > 3:
        table_name = sys.argv[3]
    
    # Run import
    importer = SpreadsheetImporter(csv_file, db_path, table_name)
    
    try:
        importer.run()
    except KeyboardInterrupt:
        print("\n\nImport cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
