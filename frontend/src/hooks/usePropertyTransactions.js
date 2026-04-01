import { useState, useEffect } from 'react';
import { getIncome, getExpenses, getEvents } from '../api.js';

/**
 * usePropertyTransactions — fetch income, expenses, and optionally events
 * for a list of properties. Re-fetches when the property ID set changes.
 *
 * @param {object[]} properties
 * @param {{ includeEvents?: boolean }} opts
 * @returns {{ allIncome, allExpenses, allEvents }}
 */
export default function usePropertyTransactions(properties, { includeEvents = true } = {}) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [allEvents,   setAllEvents]   = useState({});

  const idKey = properties.map(p => p.id).join(',');

  useEffect(() => {
    if (!properties.length) return;

    // Fetch income and expenses in parallel — both return all records;
    // filter by property_id client-side so each is just one HTTP request.
    const propIds = new Set(properties.map(p => p.id));
    const nameMap = Object.fromEntries(properties.map(p => [p.id, p.name]));
    const tag     = arr => arr
      .filter(r => propIds.has(r.property_id))
      .map(r => ({ ...r, property_name: nameMap[r.property_id] ?? '' }));

    getIncome().then(data => setAllIncome(tag(data))).catch(() => {});
    getExpenses().then(data => setAllExpenses(tag(data))).catch(() => {});

    if (includeEvents) {
      Promise.all(
        properties.map(p => getEvents(p.id).then(evs => [p.id, evs]).catch(() => [p.id, []]))
      ).then(pairs => {
        const map = {};
        pairs.forEach(([id, evs]) => { map[id] = evs; });
        setAllEvents(map);
      });
    }
  }, [idKey, includeEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  return { allIncome, allExpenses, allEvents };
}
