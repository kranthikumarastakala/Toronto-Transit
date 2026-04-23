import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="d-flex flex-row align-items-center justify-content-between gap-3 mb-4">
      <div>
        <div className="signalto-kicker">{eyebrow}</div>
        <h2 className="signalto-panel-title mt-1 mb-0">{title}</h2>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}
