import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { INITIAL_OPTIONS, COLUMN_DEFS } from '../config.js';
import { getExpenses, getIncome, deleteExpense, deleteIncome } from '../api.js';
import { useSilentLoading } from './useSilentLoading.js';
import { parseLocalDate, mergeOptions, getDateRanges, isDateInRange } from '../utils.js';
import { useColumnVisibility } from './useColumnVisibility.js';

const API_FNS = {
  expenses: { fetch: (propertyId) => getExpenses(propertyId), remove: deleteExpense },
  income:   { fetch: (propertyId) => getIncome(propertyId),   remove: deleteIncome  },
};

export default function useTransactionView({
  viewName, endpoint, dateField, defaultSortBy,
  properties, initialPropertyId,
  seedTypeOptions, typeField,
  seedCategoryOptions, categoryField,
}) {
  const { fetch: apiFetch, remove: apiRemove } = API_FNS[endpoint];

  const [records, setRecords] = useState([]);
  const { loading, wrapLoad, hasLoadedRef } = useSilentLoading();

  const [sortBy,           setSortBy]           = useState(defaultSortBy);
  const [sortOrder,        setSortOrder]        = useState('desc');
  const [filterProperty,   setFilterProperty]   = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter,       setDateFilter]       = useState('currentYear');
  const [customDateStart,  setCustomDateStart]  = useState('');
  const [customDateEnd,    setCustomDateEnd]    = useState('');
  const [filterTypes,      setFilterTypes]      = useState(seedTypeOptions);
  const [filterCategories, setFilterCategories] = useState(seedCategoryOptions ?? []);

  const seenTypesRef      = useRef(new Set(seedTypeOptions));
  const seenCategoriesRef = useRef(new Set(seedCategoryOptions ?? []));

  const colVis       = useColumnVisibility(viewName);
  const allColKeys   = COLUMN_DEFS[viewName].map(d => d.key);
  const allColLabels = Object.fromEntries(COLUMN_DEFS[viewName].map(d => [d.key, d.label]));

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const allTypes = useMemo(() =>
    mergeOptions(seedTypeOptions, records.map(r => r[typeField])), [records]);

  const allCategories = useMemo(() =>
    categoryField ? mergeOptions(seedCategoryOptions, records.map(r => r[categoryField])) : [],
  [records]);

  useEffect(() => {
    const newOnes = allTypes.filter(v => v && !seenTypesRef.current.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenTypesRef.current.add(v));
      setFilterTypes(prev => [...prev, ...newOnes]);
    }
  }, [allTypes]);

  useEffect(() => {
    if (!categoryField) return;
    const newOnes = allCategories.filter(v => v && !seenCategoriesRef.current.has(v));
    if (newOnes.length) {
      newOnes.forEach(v => seenCategoriesRef.current.add(v));
      setFilterCategories(prev => [...prev, ...newOnes]);
    }
  }, [allCategories]);

  // propertiesRef: always current, lets load() be stable (no useCallback deps)
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;

  // Build a lookup from property_id → property_name for tagging fetched records
  const propNameMapRef = useRef({});
  useEffect(() => {
    propNameMapRef.current = Object.fromEntries(properties.map(p => [p.id, p.name]));
  }, [properties]);

  const load = async () => {
    await wrapLoad(async () => {
      // Single request for all records (no property_id filter) — avoids N+1.
      const all = await apiFetch(null).catch(() => []);
      const propIds = new Set(propertiesRef.current.map(p => p.id));
      const tagged  = all
        .filter(r => propIds.has(r.property_id))
        .map(r => ({ ...r, property_name: propNameMapRef.current[r.property_id] ?? '' }));
      setRecords(tagged);
    });
  };

  // Stable reference — always points to the latest load closure so callers
  // (App's viewReloadRef) never hold a stale version.
  const loadRef = useRef(load);
  loadRef.current = load;
  const stableLoad = useCallback(() => loadRef.current(), []);

  // Initial load — fires once when properties first become available.
  // Does NOT re-fire on subsequent properties changes (background refreshes),
  // so there is no spinner flash, page-height collapse, or scroll clamping.
  useEffect(() => {
    if (properties.length > 0 && !hasLoadedRef.current) load();
  }, [properties]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    if (!confirm(`Delete this ${viewName.replace(/s$/, '')} record?`)) return;
    try { await apiRemove(id); await stableLoad(); } catch (err) { console.error(err); }
  };

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
        if (!isDateInRange(r[dateField], parseLocalDate(customDateStart), parseLocalDate(customDateEnd))) return false;
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
    records, loading, filtered, baseRecords,
    baseTotal, filteredTotal, isFiltered, pct, propName,
    sortBy, setSortBy, sortOrder, setSortOrder,
    filterProperty, setFilterProperty,
    dateFilter, setDateFilter,
    customDateStart, setCustomDateStart,
    customDateEnd, setCustomDateEnd,
    filterTypes, setFilterTypes, allTypes,
    filterCategories, setFilterCategories, allCategories,
    colVis, allColKeys, allColLabels,
    load: stableLoad, handleDelete,
  };
}
