type StatusPillProps = {
  status: "ok" | "error" | "needs_setup";
};

const statusMap = {
  ok: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
  needs_setup: "bg-amber-100 text-amber-700"
};

const labelMap = {
  ok: "Live",
  error: "Issue",
  needs_setup: "Needs Setup"
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusMap[status]}`}>
      {labelMap[status]}
    </span>
  );
}
