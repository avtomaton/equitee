/**
 * PortfolioDataContext — single source of truth for all portfolio data.
 *
 * Loads properties, income, expenses, and events once and shares them
 * across all views.  Eliminates the redundant fetches that occurred when
 * App, usePropertyTransactions, and PropertyDetail each fetched independently.
 *
 * Mutation helpers update state optimistically (no full re-fetch),
 * rolling back on API failure.
 *
 * Usage:
 *   <PortfolioDataProvider>    ← wraps the app (inside ToastProvider)
 *     ... children that call usePortfolioData() ...
 *   </PortfolioDataProvider>
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getProperties, getIncome, getExpenses, getEvents, getGroups, getDefaultGroup,
  createProperty, updateProperty, archiveProperty, restoreProperty,
  createIncome, updateIncome, deleteIncome,
  createExpense, updateExpense, deleteExpense,
  createGroup, updateGroup, deleteGroup,
} from '../api';
import type { Property, Income, Expense, Event, Group } from '../types.ts';

interface PortfolioDataContextType {
  properties: Property[];
  allIncome: Income[];
  allExpenses: Expense[];
  allEvents: Record<number, Event[]>;
  groups: Group[];
  defaultGroup: Group | null;
  defaultGroupProperties: Property[];
  loading: boolean;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  // Optimistic mutation helpers
  addProperty: (data: Omit<Property, 'id'>) => Promise<Property>;
  editProperty: (id: number, data: Partial<Property>) => Promise<Property>;
  removeProperty: (id: number) => Promise<void>;
  unarchiveProperty: (id: number) => Promise<Property>;
  addIncome: (data: Omit<Income, 'id'>) => Promise<Income>;
  editIncome: (id: number, data: Partial<Income>) => Promise<Income>;
  removeIncome: (id: number) => Promise<void>;
  addExpense: (data: Omit<Expense, 'id'>) => Promise<Expense>;
  editExpense: (id: number, data: Partial<Expense>) => Promise<Expense>;
  removeExpense: (id: number) => Promise<void>;
  addGroup: (data: Omit<Group, 'id'>) => Promise<Group>;
  editGroup: (id: number, data: Partial<Group>) => Promise<Group>;
  removeGroup: (id: number) => Promise<void>;
}

const PortfolioDataContext = createContext<PortfolioDataContextType | null>(null);

/**
 * Hook to access shared portfolio data + mutation helpers.
 */
export function usePortfolioData() {
  const ctx = useContext(PortfolioDataContext);
  if (!ctx) throw new Error('usePortfolioData must be used within <PortfolioDataProvider>');
  return ctx;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** Build a { id → name } lookup from a properties list. */
const buildNameMap = (props: Property[]): Record<number, string> => 
  Object.fromEntries(props.map(p => [p.id, p.name]));

/** Tag transaction records with property_name given a name lookup. */
const tagWithNames = <T extends { property_id: number }>(records: T[], nameMap: Record<number, string>): (T & { property_name: string })[] =>
  records.map(r => ({ ...r, property_name: nameMap[r.property_id] ?? '' }));

/** Build an events map { propertyId: [events] } from a flat events array. */
const buildEventMap = (properties: Property[], events: Event[]): Record<number, Event[]> => {
  const map: Record<number, Event[]> = {};
  properties.forEach(p => { map[p.id] = []; });
  events.forEach(e => {
    if (map[e.property_id]) map[e.property_id].push(e);
  });
  return map;
};

export function PortfolioDataProvider({ children }: { children: React.ReactNode }) {
  const [properties,  setProperties]  = useState<Property[]>([]);
  const [allIncome,   setAllIncome]   = useState<Income[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [allEvents,   setAllEvents]   = useState<Record<number, Event[]>>({});
  const [groups,      setGroups]      = useState<Group[]>([]);
  const [defaultGroup, setDefaultGroup] = useState<Group | null>(null);
  const [loading,     setLoading]     = useState<boolean>(true);

  // Refs to latest state for use inside mutation callbacks without stale closure
  const propsRef = useRef<Property[]>(properties);
  const incomeRef = useRef<Income[]>(allIncome);
  const expensesRef = useRef<Expense[]>(allExpenses);
  const groupsRef = useRef<Group[]>(groups);
  const defaultGroupRef = useRef<Group | null>(defaultGroup);

  // Keep refs in sync with state
  useEffect(() => {
    propsRef.current = properties;
  }, [properties]);
  
  useEffect(() => {
    incomeRef.current = allIncome;
  }, [allIncome]);
  
  useEffect(() => {
    expensesRef.current = allExpenses;
  }, [allExpenses]);
  
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  
  useEffect(() => {
    defaultGroupRef.current = defaultGroup;
  }, [defaultGroup]);

  /* ── Full load ────────────────────────────────────────────────────── */

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const [props, income, expenses] = await Promise.all([
        getProperties(), getIncome(), getExpenses(),
      ]);

      const nameMap = buildNameMap(props);

      setProperties(props);
      setAllIncome(tagWithNames(income, nameMap));
      setAllExpenses(tagWithNames(expenses, nameMap));

      // Events (silently) — re-fetched only on explicit refresh
      const allEvs = await getEvents().catch(() => []);
      setAllEvents(buildEventMap(props, allEvs));

      // Groups
      const [grps, defGrp] = await Promise.all([
        getGroups().catch(() => []),
        getDefaultGroup().catch(() => null),
      ]);
      setGroups(grps);
      setDefaultGroup(defGrp);
    } catch (err) {
      console.error('Failed to load portfolio data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /* ── Silent events-only refresh ──────────────────────────────────── */

  const refreshEvents = useCallback(async () => {
    try {
      const allEvs = await getEvents().catch(() => []);
      setAllEvents(buildEventMap(propsRef.current, allEvs));
    } catch (err) {
      console.error('Failed to refresh events:', err);
    }
  }, []);

  // Initial load
  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Optimistic mutation helpers ─────────────────────────────────── */

  // ▶ Properties

  const addProperty = useCallback(async (data: Omit<Property, 'id'>) => {
    const previousState = propsRef.current;
    try {
      const created = await createProperty(data);
      const nameMap = buildNameMap([...propsRef.current, created]);
      nameMap[created.id] = created.name;
      setProperties(prev => [...prev, created]);
      // Re-tag existing income/expenses that reference this property (shouldn't exist yet, but safe)
      setAllIncome(prev => tagWithNames(prev, nameMap));
      setAllExpenses(prev => tagWithNames(prev, nameMap));
      return created;
    } catch (err) {
      // Rollback on failure
      setProperties(previousState);
      throw err;
    }
  }, []);

  const editProperty = useCallback(async (id: number, data: Partial<Property>) => {
    const previousState = propsRef.current;
    const oldName = previousState.find(p => p.id === id)?.name;
    // Optimistic: update immediately
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    try {
      const updated = await updateProperty(id, data);
      // Apply server response (includes computed fields like total_income)
      setProperties(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
      // Update name map if name changed
      if (updated.name !== oldName) {
        // Build name map from the updated property list
        setAllIncome(prev => tagWithNames(prev, buildNameMap([...previousState.filter(p => p.id !== id), updated])));
        setAllExpenses(prev => tagWithNames(prev, buildNameMap([...previousState.filter(p => p.id !== id), updated])));
      }
      refreshEvents();
      return updated;
    } catch (err) {
      // Rollback
      setProperties(previousState);
      throw err;
    }
  }, [refreshEvents]);

  const removeProperty = useCallback(async (id: number) => {
    const previousState = propsRef.current;
    setProperties(prev => prev.filter(p => p.id !== id));
    try {
      await archiveProperty(id);
      // Clean up events map
      setAllEvents(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setProperties(previousState);
      throw err;
    }
  }, []);

  const unarchiveProperty = useCallback(async (id: number) => {
    const previousState = propsRef.current;
    try {
      const restored = await restoreProperty(id) as Property;
      setProperties(prev => [...prev, restored]);
      return restored;
    } catch (err) {
      setProperties(previousState);
      throw err;
    }
  }, []);

  // ▶ Income

  const addIncome = useCallback(async (data: Omit<Income, 'id'>) => {
    const nameMap = buildNameMap(propsRef.current);
    // Optimistic: temporary negative ID
    const tempId = -Date.now();
    const temp = { id: tempId, ...data, property_name: nameMap[data.property_id as number] ?? '' } as Income;
    setAllIncome(prev => [...prev, temp]);
    try {
      const created = await createIncome(data);
      setAllIncome(prev => {
        const idx = prev.findIndex(i => i.id === tempId);
        const next = [...prev];
        next[idx] = { ...created, property_name: nameMap[created.property_id] ?? '' };
        return next;
      });
      // Refresh events in case income creation triggers them
      refreshEvents();
      return created;
    } catch (err) {
      setAllIncome(prev => prev.filter(i => i.id !== tempId));
      throw err;
    }
  }, [refreshEvents]);

  const editIncome = useCallback(async (id: number, data: Partial<Income>) => {
    const prev = propsRef.current;
    const old: Income | undefined = incomeRef.current.find(i => i.id === id);
    const nameMap = buildNameMap(prev);
    // Optimistic
    setAllIncome(prevInc => prevInc.map(i =>
      i.id === id ? { ...i, ...data, property_name: nameMap[(data.property_id ?? i.property_id) as number] ?? i.property_name } : i
    ));
    try {
      const updated = await updateIncome(id, data) as Income;
      setAllIncome(prevInc => prevInc.map(i =>
        i.id === id ? { ...updated, property_name: nameMap[updated.property_id as number] ?? '' } : i
      ));
      refreshEvents();
      return updated;
    } catch (err) {
      if (old) setAllIncome(prevInc => prevInc.map(i => i.id === id ? old : i));
      throw err;
    }
  }, [refreshEvents]);

  const removeIncome = useCallback(async (id: number) => {
    const old: Income | undefined = incomeRef.current.find(i => i.id === id);
    setAllIncome(prevInc => prevInc.filter(i => i.id !== id));
    try {
      await deleteIncome(id);
      refreshEvents();
    } catch (err) {
      if (old) setAllIncome(prev => [...prev, old]);
      throw err;
    }
  }, [refreshEvents]);

  // ▶ Expenses

  const addExpense = useCallback(async (data: Omit<Expense, 'id'>) => {
    const nameMap = buildNameMap(propsRef.current);
    const tempId = -Date.now();
    const temp = { id: tempId, ...data, property_name: nameMap[data.property_id as number] ?? '' } as Expense;
    setAllExpenses(prev => [...prev, temp]);
    try {
      const created = await createExpense(data);
      setAllExpenses(prev => {
        const idx = prev.findIndex(e => e.id === tempId);
        const next = [...prev];
        next[idx] = { ...created, property_name: nameMap[created.property_id] ?? '' };
        return next;
      });
      refreshEvents();
      return created;
    } catch (err) {
      setAllExpenses(prev => prev.filter(e => e.id !== tempId));
      throw err;
    }
  }, [refreshEvents]);

  const editExpense = useCallback(async (id: number, data: Partial<Expense>) => {
    const old = expensesRef.current.find(e => e.id === id);
    const nameMap = buildNameMap(propsRef.current);
    setAllExpenses(prev => prev.map(e =>
      e.id === id ? { ...e, ...data, property_name: nameMap[data.property_id ?? e.property_id] ?? e.property_name } : e
    ));
    try {
      const updated = await updateExpense(id, data);
      setAllExpenses(prev => prev.map(e =>
        e.id === id ? { ...updated, property_name: nameMap[updated.property_id] ?? '' } : e
      ));
      // If the expense is/was a loan payment (Mortgage or Principal), the property's loan_amount may have changed
      if (old) {
        const newCategory = data.expense_category ?? old.expense_category;
        const targetPropertyId = data.property_id ?? old.property_id;
        if (old.expense_category === 'Mortgage' || old.expense_category === 'Principal' ||
            newCategory === 'Mortgage' || newCategory === 'Principal') {
          setProperties(prev => prev.map(p =>
            p.id === targetPropertyId ? { ...p, loan_amount: updated.loan_amount ?? p.loan_amount } : p
          ));
        }
      }
      refreshEvents();
      return updated;
    } catch (err) {
      if (old) setAllExpenses(prev => prev.map(e => e.id === id ? old : e));
      throw err;
    }
  }, [refreshEvents]);

  const removeExpense = useCallback(async (id: number) => {
    const old: Expense | undefined = expensesRef.current.find(e => e.id === id);
    setAllExpenses(prevExp => prevExp.filter(e => e.id !== id));
    try {
      await deleteExpense(id);
      refreshEvents();
    } catch (err) {
      if (old) setAllExpenses(prev => [...prev, old]);
      throw err;
    }
  }, [refreshEvents]);

  // ▶ Groups

  const addGroup = useCallback(async (data: Omit<Group, 'id'>) => {
    const previousState = groupsRef.current;
    try {
      const created = await createGroup(data);
      setGroups(prev => [...prev, created]);
      refreshEvents();
      return created;
    } catch (err) {
      // Rollback on failure
      setGroups(previousState);
      throw err;
    }
  }, [refreshEvents]);

  const editGroup = useCallback(async (id: number, data: Partial<Group>) => {
    const prev = groupsRef.current;
    const prevDefaultGroup = defaultGroupRef.current;
    const wasDefault = prevDefaultGroup?.id === id;
    const willBeDefault = data.is_default === true;
    
    // Optimistically update the group being edited
    const updatedGroups = (prevG: Group[]) => prevG.map((g: Group) => {
      if (g.id === id) {
        return { ...g, ...data };
      }
      // If we're making this group default and there was a different default group, unset it
      if (willBeDefault && !wasDefault && g.is_default && g.id !== id) {
        return { ...g, is_default: false };
      }
      return g;
    });
    
    setGroups(updatedGroups);
    // Update defaultGroup state if needed
    if (wasDefault && !willBeDefault) {
      setDefaultGroup(null);
    } else if (!wasDefault && willBeDefault) {
      setDefaultGroup(prev.find(g => g.id === id) || null);
    }
    
    try {
      const updated = await updateGroup(id, data);
      // Update groups with server response, making sure only one group is default
       const finalGroups = (prevG: Group[]) => prevG.map((g: Group) => {
        if (g.id === id) {
          return updated;
        }
        // If the updated group is default, make sure no other group is default
        if (updated.is_default && g.is_default && g.id !== id) {
          return { ...g, is_default: false };
        }
        return g;
      });
      setGroups(finalGroups);
      // Update defaultGroup state based on server response
      if (updated.is_default) {
        setDefaultGroup(updated);
      } else if (prevDefaultGroup?.id === id) {
        setDefaultGroup(null);
      }
      refreshEvents();
      return updated;
    } catch (err) {
      // Rollback
      setGroups(prev);
      setDefaultGroup(prevDefaultGroup);
      throw err;
    }
  }, [refreshEvents]);

  const removeGroup = useCallback(async (id: number) => {
    const prev = groupsRef.current;
    const prevDefaultGroup = defaultGroupRef.current;
    const wasDefault = prevDefaultGroup?.id === id;
    setGroups(prevG => prevG.filter(g => g.id !== id));
    // Also clear default group if we're deleting it
    if (wasDefault) setDefaultGroup(null);
    try {
      await deleteGroup(id);
      refreshEvents();
    } catch (err) {
      setGroups(prev);
      if (wasDefault) setDefaultGroup(prevDefaultGroup);
      throw err;
    }
  }, [refreshEvents]);

  /* ── Derived values ──────────────────────────────────────────────── */

  const allPropertiesGroup = useMemo(() => ({
    id: -1,
    name: 'All Properties',
    is_default: defaultGroup === null,
    is_builtin: true,
    property_ids: properties.map(p => p.id),
  }), [properties, defaultGroup]);

  const allGroups = useMemo(() => [allPropertiesGroup, ...groups], [allPropertiesGroup, groups]);

  const defaultGroupProperties = useMemo(() => {
    if (!defaultGroup || !defaultGroup.property_ids?.length) return properties;
    const groupIds = new Set(defaultGroup.property_ids);
    return properties.filter(p => groupIds.has(p.id));
  }, [properties, defaultGroup]);

  const value = useMemo(() => ({
    properties,
    allIncome,
    allExpenses,
    allEvents,
    groups: allGroups,
    defaultGroup,
    defaultGroupProperties,
    loading,
    refresh: loadAll,
    // Optimistic mutation helpers
    addProperty, editProperty, removeProperty, unarchiveProperty,
    addIncome, editIncome, removeIncome,
    addExpense, editExpense, removeExpense,
    addGroup, editGroup, removeGroup,
  }), [
    properties, allIncome, allExpenses, allEvents,
    allGroups, defaultGroup, defaultGroupProperties, loading, loadAll,
    addProperty, editProperty, removeProperty, unarchiveProperty,
    addIncome, editIncome, removeIncome,
    addExpense, editExpense, removeExpense,
    addGroup, editGroup, removeGroup,
  ]);

  return (
    <PortfolioDataContext.Provider value={value}>
      {children}
    </PortfolioDataContext.Provider>
  );
}