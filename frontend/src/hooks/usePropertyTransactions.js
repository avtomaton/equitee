import { useState, useEffect } from 'react';
import { getIncome, getExpenses, getEvents } from '../api.js';

/**
 * usePropertyTransactions — fetch and cache income, expenses AND events
 * for a list of properties. Re-fetches when the property ID set changes.
 *
 * @returns {{ allIncome, allExpenses, allEvents }}
 *   allEvents is keyed by property_id: { [id]: event[] }
 */
export default function usePropertyTransactions(properties) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);
  const [allEvents,   setAllEvents]   = useState({});

  const idKey = properties.map(p => p.id).join(',');

  useEffect(() => {
    if (!properties.length) return;

    Promise.all(
      properties.map(p =>
        getIncome(p.id)
          .then(data => data.map(r => ({ ...r, property_id: p.id })))
          .catch(() => [])
      )
    ).then(results => setAllIncome(results.flat()));

    Promise.all(
      properties.map(p =>
        getExpenses(p.id)
          .then(data => data.map(r => ({ ...r, property_id: p.id })))
          .catch(() => [])
      )
    ).then(results => setAllExpenses(results.flat()));

    Promise.all(
      properties.map(p =>
        getEvents(p.id)
          .then(evs => [p.id, evs])
          .catch(() => [p.id, []])
      )
    ).then(pairs => {
      const map = {};
      pairs.forEach(([id, evs]) => { map[id] = evs; });
      setAllEvents(map);
    });

  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { allIncome, allExpenses, allEvents };
}
