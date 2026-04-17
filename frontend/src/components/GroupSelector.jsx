import { useMemo } from 'react';
import { usePortfolioData } from '../context/PortfolioDataContext.jsx';

/**
 * GroupSelector — compact dropdown to quickly switch the active group view.
 * Designed to sit inside a page-header row, aligned to the right.
 *
 * Three states for the activeGroupId:
 *   null       → use the configured default group (or all properties if no default)
 *   '__all__'  → explicitly show all properties
 *   <number>   → show a specific group
 */
export default function GroupSelector({ value, onChange }) {
  const { groups, defaultGroup } = usePortfolioData();

  // Only show if there are user-created groups beyond the built-in "All Properties"
  const userGroups = useMemo(() => groups.filter(g => !g.is_builtin), [groups]);

  // Don't render if there are no custom groups
  if (userGroups.length === 0) return null;

  // Map the activeGroupId to a <select> value (always a string):
  //   null  → show the default group's id, or '__all__' if no default is set
  //   other → stringified value
  const selectValue = value === null
    ? (defaultGroup ? String(defaultGroup.id) : '__all__')
    : String(value);

  return (
    <select
      value={selectValue}
      onChange={e => {
        const raw = e.target.value;
        onChange(raw === '__all__' ? '__all__' : Number(raw));
      }}
      style={{
        fontSize: '0.78rem',
        padding: '5px 10px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        color: 'var(--text-primary)',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {groups.map(g => (
        <option key={g.id} value={g.id}>
          {g.is_builtin ? '🌐' : '📁'} {g.name} ({g.property_ids?.length || 0})
        </option>
      ))}
    </select>
  );
}
