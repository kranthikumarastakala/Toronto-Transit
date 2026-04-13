import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  accent?: "pine" | "rust" | "ink";
  icon?: ReactNode;
};

const accentClasses = {
  pine: "border-pine/20 bg-mist",
  rust: "border-rust/20 bg-white",
  ink: "border-ink/10 bg-white"
};

export function MetricCard({ label, value, hint, accent = "ink", icon }: MetricCardProps) {
  return (
    <article className={`rounded-[28px] border p-5 shadow-float ${accentClasses[accent]}`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-ink/55">{label}</p>
        <div className="text-2xl text-pine">{icon}</div>
      </div>
      <p className="text-4xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-3 text-sm leading-6 text-ink/70">{hint}</p>
    </article>
  );
}

