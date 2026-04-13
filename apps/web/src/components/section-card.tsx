import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function SectionCard({ eyebrow, title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-float backdrop-blur">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-ink/55">{eyebrow}</p>
      <div className="mt-3 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-ink/72">{description}</p> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

