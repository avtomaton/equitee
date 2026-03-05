export const COLORS = ['#3b82f6', '#60a5fa', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// With Vite's proxy, we can use a relative path instead of hardcoding localhost
export const API_URL = '/api';

export const getDateRanges = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return {
    ytd:          { start: new Date(year, 0, 1),      end: now },
    currentMonth: { start: new Date(year, month, 1),  end: new Date(year, month + 1, 0) },
    currentYear:  { start: new Date(year, 0, 1),      end: new Date(year, 11, 31) },
    lastYear:     { start: new Date(year - 1, 0, 1),  end: new Date(year - 1, 11, 31) },
  };
};

export const isDateInRange = (date, start, end) => {
  const d = new Date(date);
  return d >= start && d <= end;
};
