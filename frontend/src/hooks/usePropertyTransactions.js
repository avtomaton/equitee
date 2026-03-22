import { useState, useEffect } from 'react';
import { getIncome, getExpenses } from '../api.js';

/**
 * usePropertyTransactions — fetch and cache all income and expense records
 * for a given list of properties.
 *
 * Lifted out of PropertiesView so that Analytics (rendered inside the same
 * view) can consume the same already-fetched data without issuing its own
 * duplicate requests.
 *
 * Re-fetches whenever the set of property IDs changes.
 *
 * @param {object[]} properties — property records (need `.id` and `.name`)
 * @returns {{ allIncome: object[], allExpenses: object[] }}
 */
export default function usePropertyTransactions(properties) {
  const [allIncome,   setAllIncome]   = useState([]);
  const [allExpenses, setAllExpenses] = useState([]);

  // Stable cache key: only re-fetch when the property ID set actually changes
  const idKey = properties.map(p => p.id).join(',');

  useEffect(() => {
    if (!properties.length) return;

    // Fetch income and expenses in parallel across all properties,
    // tagging each record with its property_id so downstream code can filter.
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

  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { allIncome, allExpenses };
}
