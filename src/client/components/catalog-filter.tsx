'use client';

/** Empty selection means all; choices within a filter are combined with OR. */
export function CatalogFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: number; name: string }[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <details className="catalog-multi-filter">
      <summary>
        {label} <span>{value.length ? `${value.length} selected` : 'All'}</span>
      </summary>
      <fieldset>
        <legend className="sr-only">{label}</legend>
        <button type="button" className="text-button" onClick={() => onChange([])}>
          Clear {label.toLowerCase()}
        </button>
        {options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={value.includes(option.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, option.id] : value.filter((id) => id !== option.id),
                )
              }
            />
            {option.name}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
