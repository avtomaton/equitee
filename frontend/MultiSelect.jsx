import { useState, useEffect, useRef } from 'react';

export default function MultiSelect({ label, options, selected, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = selected.length === options.length;

  const handleToggle = (value) => {
    const newSelected = selected.includes(value)
      ? selected.filter((s) => s !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleSelectAll = () => onChange([...options]);
  const handleClearAll = () => onChange([]);
  const handleOnly = (value) => onChange([value]);

  const displayText =
    selected.length === options.length
      ? `All ${label}`
      : selected.length === 0
      ? 'None'
      : `${selected.length} selected`;

  return (
    <div className="multi-select" ref={ref}>
      <div className="multi-select-trigger" onClick={() => setIsOpen(!isOpen)}>
        <span>{displayText}</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="multi-select-dropdown">
          <div className="multi-select-actions">
            <button type="button" onClick={handleSelectAll} disabled={allSelected}>
              Select all
            </button>
            <button type="button" onClick={handleClearAll} disabled={selected.length === 0}>
              Clear all
            </button>
          </div>

          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <div key={option} className="multi-select-option">
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(option)}
                  />
                  <span>{option}</span>
                </label>
                {!(checked && selected.length === 1) && (
                  <button
                    type="button"
                    className="only-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOnly(option);
                    }}
                  >
                    only
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
