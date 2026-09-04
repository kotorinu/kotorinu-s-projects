export default function ProgressBar({
  pct,
  size = "md",
}: {
  pct: number;
  size?: "sm" | "md";
}) {
  const height = size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-stone-100 ${height}`}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}
