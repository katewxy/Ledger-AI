"use client";

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "default" | "green" | "red" | "amber";
  icon?: React.ReactNode;
}

const colorMap = {
  default: "text-gray-900",
  green: "text-emerald-600",
  red: "text-red-500",
  amber: "text-amber-500",
};

export default function MetricCard({
  label,
  value,
  sub,
  color = "default",
  icon,
}: MetricCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        {icon && <span className="text-gray-300">{icon}</span>}
      </div>
      <p className={`text-2xl font-semibold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
