'use client';
import type { Category } from '@/lib/types';
export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <fieldset className="category-picker">
      <legend>
        Categories <span>Choose 1–3 · {value.length}/3</span>
      </legend>
      <div>
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              name="categoryIds"
              value={category.id}
              checked={value.includes(category.id)}
              disabled={!value.includes(category.id) && value.length >= 3}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, category.id]
                    : value.filter((id) => id !== category.id),
                )
              }
            />
            {category.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
