import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { COLUMN_DEFS } from '../config';
import { getExpenses, getIncome, deleteExpense, deleteIncome } from '../api';
import { useSilentLoading } from './useSilentLoading';
import { parseLocalDate, mergeOptions, getDateRanges, isDateInRange } from '../utils';
import { useColumnVisibility } from './useColumnVisibility';
import type { TransactionRecord } from '../types';

interface TransactionViewParams {
  viewName: string;
  endpoint: 'expenses' | 'income';
  dateField: string;
  defaultSortBy: string;
  properties: { id: number; name: string }[];
  initialPropertyId?: number | null;
  seedTypeOptions: string[];
  typeField: string;
  seedCategoryOptions?: string[];
  categoryField?: string;
}

const API_FNS = {
  expenses: { fetch: (propertyId: number | null | undefined) => getExpenses(propertyId ?? undefined), remove: deleteExpense },
  income:   { fetch: (propertyId: number | null | undefined) => getIncome(propertyId ?? undefined),   remove: deleteIncome  },
};

export default function useTransactionView({
  viewName, endpoint, dateField, defaultSortBy,
  properties, initialPropertyId = null,
  seedTypeOptions, typeField,
  seedCategoryOptions, categoryField,
}: TransactionViewParams) {
  const { fetch: apiFetch, remove: apiRemove } = API_FNS[endpoint];

  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const { loading, wrapLoad, hasLoadedRef } = useSilentLoading();

  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterProperty, setFilterProperty] = useState(initialPropertyId ? String(initialPropertyId) : 'all');
  const [dateFilter, setDateFilter] = useState('currentYear');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>(seedTypeOptions);
  const [filterCategories, setFilterCategories] = useState<string[]>(seedCategoryOptions ?? []);

  const seenTypesRef = useRef(new Set(seedTypeOptions));
  const seenCategoriesRef = useRef(new Set(seedCategoryOptions ?? []));

  const colVis = useColumnVisibility(viewName);
  const allColKeys = COLUMN_DEFS[viewName as keyof typeof COLUMN_DEFS]?.map((d: { key: string }) => d.key) ?? [];
  const allColLabels = Object.fromEntries(
    (COLUMN_DEFS[viewName as keyof typeof COLUMN_DEFS] ?? []).map((d: { key: string; label: string }) => [d.key, d.label])
  );

  useEffect(() => {
    if (initialPropertyId) setFilterProperty(String(initialPropertyId));
  }, [initialPropertyId]);

  const propIdSet = useMemo(() => new Set(properties.map(p => p.id)), [properties]);
  const propNameMap = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p.name])), [properties]);

  const groupRecords = useMemo(() =>
    records.filter(r => propIdSet.has(r.property_id)),
    [records, propIdSet]
  );

  const allTypes = useMemo(() =>
    mergeOptions(seedTypeOptions, groupRecords.map(r => (r as Record<string, unknown>)[typeField] as string).filter(Boolean)),
    [groupRecords, seedTypeOptions, typeField]);

  const allCategories = useMemo(() =>
    categoryField
      ? mergeOptions(seedCategoryOptions ?? [], groupRecords.map(r => (r as Record<string, unknown>)[categoryField] as string).filter(Boolean))
      : [],
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
      const all = await apiFetch(null).catch(() => []);
      setRecords(all as TransactionRecord[]);
    });
  };

  const loadRef = useRef(load);
  loadRef.current = load;
  const stableLoad = useCallback(() => loadRef.current(), []);

  useEffect(() => {
    if (properties.length > 0 && !hasLoadedRef.current) load();
  }, [properties]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    if (!confirm(`Delete this ${viewName.replace(/s$/, '')} record?`)) return;
    try { await apiRemove(id); await stableLoad(); } catch (err) { console.error(err); }
  };

  const baseRecords = useMemo(() => {
    const scoped = groupRecords.map(r => ({ ...r, property_name: propNameMap[r.property_id] ?? '' }));
    return filterProperty === 'all'
      ? scoped
      : scoped.filter(r => r.property_id === parseInt(filterProperty));
  }, [groupRecords, filterProperty, propNameMap]);

  const filtered = useMemo(() => {
    let list = baseRecords.filter(r => {
      if (!filterTypes.includes((r as Record<string, unknown>)[typeField] as string)) return false;
      if (categoryField && !filterCategories.includes((r as Record<string, unknown>)[categoryField] as string)) return false;
      if (dateFilter !== 'all' && dateFilter !== 'custom') {
        const range = getDateRanges()[dateFilter as keyof ReturnType<typeof getDateRanges>];
        if (range && !isDateInRange((r as Record<string, unknown>)[dateField] as string, range.start, range.end)) return false;
      }
      if (dateFilter === 'custom' && customDateStart && customDateEnd) {
        const start = parseLocalDate(customDateStart);
        const end = parseLocalDate(customDateEnd);
        if (start && end && !isDateInRange((r as Record<string, unknown>)[dateField] as string, start, end)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === dateField) return dir * (new Date((a as Record<string, unknown>)[dateField] as string).getTime() - new Date((b as Record<string, unknown>)[dateField] as string).getTime());
      if (sortBy === 'amount') return dir * (a.amount - b.amount);
      return 0;
    });
    return list;
  }, [baseRecords, filterTypes, filterCategories, dateFilter, customDateStart, customDateEnd, sortBy, sortOrder, categoryField, dateField, typeField]);

  const baseTotal = baseRecords.reduce((s, r) => s + r.amount, 0);
  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);
  const isFiltered = filteredTotal !== baseTotal;
  const pct = baseTotal > 0 ? ((filteredTotal / baseTotal) * 100).toFixed(1) : '100';
  const propName = filterProperty !== 'all'
    ? properties.find(p => String(p.id) === filterProperty)?.name ?? null
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
