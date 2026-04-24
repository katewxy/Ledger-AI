import { CATEGORY_COLORS } from "@/types";

interface CategoryBadgeProps {
  category: string;
  label?: string;
}

export default function CategoryBadge({ category, label }: CategoryBadgeProps) {
  const colorClass =
    CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colorClass}`}
    >
      {label ?? category}
    </span>
  );
}
