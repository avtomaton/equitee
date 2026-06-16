import { useMemo } from 'react';
import { usePortfolioData } from '../context/PortfolioDataContext';

/**
 * usePropertyTransactions — derive per-property income, expenses, and events
 * from the shared PortfolioDataContext.
 *
 * No longer fetches independently — all HTTP calls happen once in the context provider.
 *
 * @param properties — property records to filter by
 * @param {{ includeEvents?: boolean }} opts
 * @returns {{ allIncome, allExpenses, allEvents }}
 */
export default function usePropertyTransactions(
  properties: { id: number }[],
  { includeEvents = true }: { includeEvents?: boolean } = {}
) {
  const { allIncome: ctxIncome, allExpenses: ctxExpenses, allEvents: ctxEvents } = usePortfolioData();

  const propIds = useMemo(() => new Set(properties.map(p => p.id)), [properties]);

  const allIncome = useMemo(
    () => ctxIncome.filter(r => propIds.has(r.property_id)),
    [ctxIncome, propIds]
  );

  const allExpenses = useMemo(
    () => ctxExpenses.filter(r => propIds.has(r.property_id)),
    [ctxExpenses, propIds]
  );

  const allEvents = useMemo(() => {
    if (!includeEvents) return {};
    const map: Record<number, any[]> = {};
    properties.forEach(p => { map[p.id] = ctxEvents[p.id] ?? []; });
    return map;
  }, [ctxEvents, properties, includeEvents]);

  return { allIncome, allExpenses, allEvents };
}