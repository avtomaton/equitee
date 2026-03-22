import { useState, useEffect, useMemo } from 'react';
import { INITIAL_OPTIONS, COLUMN_DEFS } from '../config.js';
import { getExpenses, getIncome, deleteExpense, deleteIncome } from '../api.js';
import { mergeOptions, getDateRanges, isDateInRange } from '../utils.js';
import { useColumnVisibility } from './useColumnVisibility.js';

// Map the endpoint string to typed api.js functions so call sites don't change.
const API_FNS = {
  expenses: { fetch: (propertyId) => getExpenses(propertyId), remove: deleteExpense },
  income:   { fetch: (propertyId) => getIncome(propertyId),   remove: deleteIncome  },
};

/**
 * useTransactionView — shared state and logic for ExpensesView and IncomeView.
 *
 * @param {string}   viewName         – 'expenses' | 'income'  (matches COLUMN_DEFS keys)
 * @param {string}   endpoint         – 'expenses' | 'income'  (selects typed api functions)
 * @param {string}   dateField        – record field used for date filtering, e.g. 'expense_date'
 * @param {string}   defaultSortBy    – initial sortBy value
 * @param {object[]} properties       – property records from App state
 * @param {number|null} initialPropertyId
 * @param {string[]} seedTypeOptions  – INITIAL_OPTIONS slice for the main type filter
 * @param {string}   typeField        – record field for the type filter, e.g. 'expense_type'
 * @param {string[]} [seedCategoryOptions] – optional second filter seed (expenses only)
 * @param {string}   [categoryField]       – optional second filter field (expenses only)
 */
export default function useTransactionView({
  viewName, endpoint, dateField, defaultSortBy,
  properties, initialPropertyId,
  seedTypeOptions, typeField,
  seedCategoryOptions, categoryField,
}) {
  const { fetch: apiFetch, remove: apiRemove } = API_FNS[endpoint];

  const [records,          setRecords]          = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [sortBy,           setSortBy]           = useState(defaultSortBy);
  const [sortOrder,        setSortOrder]        = useState('desc');
  const [filterProperty,   setFilterProperty]   = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter,       setDateFilter]       = useState('all');
  const [customDateStart,  setCustomDateStart]  = useState('');
  const [customDateEnd,    setCustomDateEnd]    = useState('');
  const [filterTypes,      setFilterTypes]      = useState(seedTypeOptions);
  const [filterCategories, setFilterCategories] = useState(seedCategoryOptions ?? []);

  const colVis       = useColumnVisibility(viewName);
  const allColKeys   = COLUMN_DEFS[viewName].map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS[viewName].map(d => [d.key, d.label]));

  // Sync jump property
  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  // Derived option lists (merge seeded values with any new ones found in data)
  const allTypes = useMemo(() =>
    mergeOptions(seedTypeOptions, records.map(r => r[typeField])), [records]);

  const allCategories = useMemo(() =>
    categoryField ? mergeOptions(seedCategoryOptions, records.map(r => r[categoryField])) : [],
  [records]);

  useEffect(() => { setFilterTypes(t => mergeOptions(t, allTypes)); }, [allTypes]);
  useEffect(() => {
    if (categoryField) setFilterCategories(c => mergeOptions(c, allCategories));
  }, [allCategories]);

  // Load all records for every property, tagging each with property_name
  useEffect(() => { if (properties.length > 0) load(); }, [properties]);

  const load = async () => {
    try {
      setLoading(true);
      const responses = await Promise.all(
        properties.map(p =>
          apiFetch(p.id)
            .then(data => data.map(rec => ({ ...rec, property_name: p.name })))
            .catch(() => [])
        )
      );
      setRecords(responses.flat());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm(`Delete this ${viewName.replace(/s$/, '')} record?`)) return;
    try { await apiRemove(id); load(); } catch (err) { console.error(err); }
  };

  // Base: property filter only (unfiltered reference for stat cards)
  const baseRecords = useMemo(() =>
    filterProperty === 'all'
      ? records
      : records.filter(r => r.property_id === parseInt(filterProperty)),
  [records, filterProperty]);

  const filtered = useMemo(() => {
    let list = baseRecords.filter(r => {
      if (!filterTypes.includes(r[typeField])) return false;
      if (categoryField && !filterCategories.includes(r[categoryField])) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter];
        if (range && !isDateInRange(r[dateField], range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        if (!isDateInRange(r[dateField], new Date(customDateStart), new Date(customDateEnd))) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === dateField) return dir * (new Date(a[dateField]) - new Date(b[dateField]));
      if (sortBy === 'amount')  return dir * (a.amount - b.amount);
      return 0;
    });
    return list;
  }, [baseRecords, filterTypes, filterCategories, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder]);

  const baseTotal     = baseRecords.reduce((s, r) => s + r.amount, 0);
  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);
  const isFiltered    = filteredTotal !== baseTotal;
  const pct           = baseTotal > 0 ? ((filteredTotal / baseTotal) * 100).toFixed(1) : '100';
  const propName      = filterProperty !== 'all'
    ? properties.find(p => String(p.id) === filterProperty)?.name
    : null;

  return {
    // data
    records, loading, filtered, baseRecords,
    baseTotal, filteredTotal, isFiltered, pct, propName,
    // sort
    sortBy, setSortBy, sortOrder, setSortOrder,
    // filters
    filterProperty, setFilterProperty,
    dateFilter, setDateFilter,
    customDateStart, setCustomDateStart,
    customDateEnd, setCustomDateEnd,
    filterTypes, setFilterTypes, allTypes,
    filterCategories, setFilterCategories, allCategories,
    // column visibility
    colVis, allColKeys, allColLabels,
    // actions
    load, handleDelete,
  };
}
