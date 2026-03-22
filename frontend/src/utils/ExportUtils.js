/**
 * ExportUtils — utilities for exporting data and printing reports
 */

/**
 * Export data array to CSV file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Output filename (without .csv)
 */
export function exportToCSV(data, filename = 'export') {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get all unique keys from all objects
  const allKeys = [...new Set(data.flatMap(obj => Object.keys(obj)))];

  // Create CSV header
  const header = allKeys.map(key => `"${String(key).replace(/"/g, '""')}"`).join(',');

  // Create CSV rows
  const rows = data.map(obj =>
    allKeys
      .map(key => {
        const value = obj[key];
        if (value === null || value === undefined) {
          return '';
        }
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      })
      .join(',')
  );

  // Combine header and rows
  const csv = [header, ...rows].join('\n');

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Print current page or specific content
 * @param {string} content - HTML content to print (optional)
 * @param {string} title - Document title for print
 */
export function printReport(content, title = 'Report') {
  const printWindow = window.open('', '', 'width=1000,height=800');

  const htmlContent = content || document.querySelector('.main-content')?.innerHTML || document.body.innerHTML;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Work Sans', sans-serif;
            color: #1a1a1a;
            background: white;
            line-height: 1.6;
          }
          h1, h2, h3 {
            margin: 1.5rem 0 0.5rem;
            page-break-after: avoid;
          }
          h1 { font-size: 2rem; }
          h2 { font-size: 1.5rem; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
            page-break-inside: avoid;
          }
          th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background: #f5f5f5;
            font-weight: 600;
          }
          .no-print {
            display: none;
          }
          .page-break {
            page-break-after: always;
          }
          @media print {
            .no-print { display: none !important; }
            a { text-decoration: none; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        ${htmlContent}
      </body>
    </html>
  `);

  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

/**
 * Generate CSV for financial metrics
 * @param {Object} property - Property object
 * @param {Object} metrics - Calculated metrics
 */
export function exportPropertyMetrics(property, metrics) {
  const data = {
    'Property Name': property.name,
    'Address': `${property.address}, ${property.city}, ${property.province}`,
    'Type': property.type,
    'Status': property.status,
    'Purchase Price': property.purchase_price,
    'Market Price': property.market_price,
    'Monthly Rent': property.monthly_rent,
    'Cap Rate': metrics.capRate?.toFixed(2) + '%',
    'DSCR': metrics.dscr?.toFixed(2),
    'ROI': metrics.roi?.toFixed(2) + '%',
    'Cash on Cash': metrics.cashOnCash?.toFixed(2) + '%',
    'Total Income': metrics.totalIncome?.toFixed(2),
    'Total Expenses': metrics.totalExpenses?.toFixed(2),
    'Net Profit': metrics.netProfit?.toFixed(2),
    'Equity': metrics.equity?.toFixed(2),
    'Generated': new Date().toLocaleString(),
  };

  exportToCSV([data], `${property.name}_metrics`);
}

/**
 * Export multiple properties to CSV
 */
export function exportPropertiesToCSV(properties) {
  const data = properties.map(p => ({
    'Name': p.name,
    'Type': p.type,
    'Location': `${p.city}, ${p.province}`,
    'Status': p.status,
    'Market Value': p.market_price,
    'Rent/mo': p.monthly_rent,
    'Total Income': p.total_income,
    'Total Expenses': p.total_expenses,
    'Loan Amount': p.loan_amount,
  }));

  exportToCSV(data, 'properties_export');
}