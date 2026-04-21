import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { COLUMN_DEFS } from '../config.js';
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

  // Keep records scoped to the currently visible properties (group filtering)
  const propIdSet   = useMemo(() => new Set(properties.map(p => p.id)), [properties]);
  const propNameMap = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p.name])), [properties]);

  // Group-scoped records — used to derive filter options (types, categories)
  const groupRecords = useMemo(() =>
    records.filter(r => propIdSet.has(r.property_id)),
    [records, propIdSet]
  );

  const allTypes = useMemo(() =>
    mergeOptions(seedTypeOptions, groupRecords.map(r => r[typeField])), [groupRecords, seedTypeOptions, typeField]);

  const allCategories = useMemo(() =>
    categoryField ? mergeOptions(seedCategoryOptions, groupRecords.map(r => r[categoryField])) : [],
  [groupRecords, categoryField, seedCategoryOptions]);

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
  }, [allCategories, categoryField]);

  const load = async () => {
    await wrapLoad(async () => {
      // Single request for all records (no property_id filter) — avoids N+1.
      // Store ALL records unfiltered so group changes can re-scope without re-fetching.
      // property_name is resolved dynamically in baseRecords (see below).
      const all = await apiFetch(null).catch(() => []);
      setRecords(all);
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

  const baseRecords = useMemo(() => {
    const scoped = groupRecords
      .map(r => ({ ...r, property_name: propNameMap[r.property_id] ?? '' }));
    return filterProperty === 'all'
      ? scoped
      : scoped.filter(r => r.property_id === parseInt(filterProperty));
  }, [groupRecords, filterProperty, propNameMap]);

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
  }, [baseRecords, filterTypes, filterCategories, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder, categoryField, dateField, typeField]);

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
