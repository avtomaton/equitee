/**
 * PortfolioDataContext — single source of truth for all portfolio data.
 *
 * Loads properties, income, expenses, and events once and shares them
 * across all views.  Eliminates the redundant fetches that occurred when
 * App, usePropertyTransactions, and PropertyDetail each fetched independently.
 *
 * Usage:
 *   <PortfolioDataProvider>    ← wraps the app (inside ToastProvider)
 *     ... children that call usePortfolioData() ...
 *   </PortfolioDataProvider>
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getProperties, getIncome, getExpenses, getEvents, getGroups, getDefaultGroup } from '../api.js';

const PortfolioDataContext = createContext(null);

/**
 * Hook to access shared portfolio data from any component.
 *
 * Returns:
 *   { properties, allIncome, allExpenses, allEvents, loading, refresh }
 *
 * - properties:   active property records (with total_income, total_expenses)
 * - allIncome:    all income records tagged with property_name
 * - allExpenses:  all expense records tagged with property_name
 * - allEvents:    { propertyId: [events] } map
 * - loading:      true during initial load
 * - refresh:      ({ silent }) => Promise<void>  — reload everything
 */
export function usePortfolioData() {
  const ctx = useContext(PortfolioDataContext);
  if (!ctx) throw new Error('usePortfolioData must be used within <PortfolioDataProvider>');
  return ctx;
}

export function PortfolioDataProvider({ children }) {
  const [properties,  setProperties]  = useState([]);
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [allEvents,   setAllEvents]   = useState({});
  const [groups,      setGroups]      = useState([]);
  const [defaultGroup, setDefaultGroup] = useState(null);
  const [loading,     setLoading]     = useState(true);

  // Build lookup maps once per properties change
  const propIds   = useMemo(() => new Set(properties.map(p => p.id)), [properties]);
  const nameMap   = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p.name])), [properties]);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      // Fetch everything in parallel
      const [props, income, expenses] = await Promise.all([
        getProperties(),
        getIncome(),
        getExpenses(),
      ]);

      const ids = new Set(props.map(p => p.id));
      const names = Object.fromEntries(props.map(p => [p.id, p.name]));

      const tag = arr => arr
        .filter(r => ids.has(r.property_id))
        .map(r => ({ ...r, property_name: names[r.property_id] ?? '' }));

      setProperties(props);
      setAllIncome(tag(income));
      setAllExpenses(tag(expenses));

      // Fetch all events in a single request, then partition by property_id
      const allEvs = await getEvents().catch(() => []);
      const evMap = {};
      props.forEach(p => { evMap[p.id] = []; });
      allEvs.forEach(e => {
        if (evMap[e.property_id]) evMap[e.property_id].push(e);
      });
      setAllEvents(evMap);

      // Fetch groups and default group
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

  // Initial load
  useEffect(() => { loadAll(); }, [loadAll]);

  // Built-in pseudo-group: "All Properties" — always present, non-editable
  const allPropertiesGroup = useMemo(() => ({
    id: '__all__',
    name: 'All Properties',
    is_default: defaultGroup === null,
    is_builtin: true,
    property_ids: properties.map(p => p.id),
  }), [properties, defaultGroup]);

  // Groups list with the built-in pseudo-group prepended
  const allGroups = useMemo(() => [allPropertiesGroup, ...groups], [allPropertiesGroup, groups]);

  // Derived: properties filtered by default group (or all if no default)
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
  }), [properties, allIncome, allExpenses, allEvents, allGroups, defaultGroup, defaultGroupProperties, loading, loadAll]);

  return (
    <PortfolioDataContext.Provider value={value}>
      {children}
    </PortfolioDataContext.Provider>
  );
}
