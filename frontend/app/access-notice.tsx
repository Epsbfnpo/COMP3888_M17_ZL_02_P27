import type { ReactNode } from "react";

export default function AccessNotice({ title, children, actions, tone = "neutral" }: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "warning";
}) {
  return <section className={`access-notice access-notice-${tone}`} aria-label={title}>
    <span className="access-notice-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
    </span>
    <div className="access-notice-content"><p className="workflow-eyebrow">Workspace access</p><h2>{title}</h2>
      <div className="access-notice-copy">{children}</div>
      {actions && <div className="access-notice-actions">{actions}</div>}
    </div>
  </section>;
}
