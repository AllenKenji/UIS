import { useEffect, useRef, useState } from "react";

/**
 * Type-to-filter resident select. Residents are already scoped to the
 * current staff/secretary's own barangay by the backend, so there's no need
 * to show the barangay per option — just the name (and a disambiguator like
 * address/contact when multiple residents share a name).
 */
const ResidentPicker = ({ residents, value, onChange, id, disabled, placeholder = "Type a resident's name..." }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selected = residents.find((r) => r.id === value) || null;

  // Keep the visible text in sync with the selected resident (e.g. on reset,
  // or when the parent clears/sets `value` programmatically).
  useEffect(() => {
    setQuery(selected ? selected.fullName : "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        // Revert to the last selected resident's name if the user typed
        // something and clicked away without picking a match.
        setQuery(selected ? selected.fullName : "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selected]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? residents.filter((r) => r.fullName?.toLowerCase().includes(normalizedQuery))
    : residents;

  const handleSelect = (resident) => {
    setQuery(resident.fullName);
    setOpen(false);
    onChange(resident.id);
  };

  const handleInputChange = (event) => {
    setQuery(event.target.value);
    setOpen(true);
    if (value) onChange(""); // typing again means the previous pick no longer applies
  };

  return (
    <div className="resident-picker" ref={containerRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        disabled={disabled}
      />

      {open && !disabled && (
        <ul className="resident-picker-options">
          {filtered.length === 0 ? (
            <li className="resident-picker-empty">No residents match "{query}"</li>
          ) : (
            filtered.map((r) => (
              <li key={r.id} onMouseDown={() => handleSelect(r)}>
                <span className="resident-picker-name">{r.fullName}</span>
                {(r.address?.street || r.contactNumber) && (
                  <span className="resident-picker-meta">
                    {[r.address?.street, r.contactNumber].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default ResidentPicker;
