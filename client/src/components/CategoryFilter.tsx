interface Category {
  id: string;
  label: string;
}

interface CategoryFilterProps {
  active: string;
  onChange: (id: string) => void;
}

/**
 * Why these 5 categories (+ "Top"):
 *
 *   They cover the dominant share of newsroom desks without bloating the
 *   filter strip. A grid of 12 categories would force the user to scan
 *   and choose; 5 is a glance.
 *
 * The list is hardcoded on purpose: every category sent to the proxy is
 * also whitelisted server-side. Keeping the two lists in lockstep is
 * worth more than dynamic flexibility.
 */
const CATEGORIES: Category[] = [
  { id: 'all', label: 'Top' },
  { id: 'general', label: 'World' },
  { id: 'tech', label: 'Tech' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'health', label: 'Health' },
];

export function CategoryFilter({ active, onChange }: CategoryFilterProps) {
  return (
    <nav className="filter" aria-label="Filter stories by category">
      {CATEGORIES.map((cat) => {
        const isActive = cat.id === active;
        return (
          <button
            key={cat.id}
            type="button"
            className="pill"
            onClick={() => onChange(cat.id)}
            aria-pressed={isActive}
          >
            {cat.label}
          </button>
        );
      })}
    </nav>
  );
}
