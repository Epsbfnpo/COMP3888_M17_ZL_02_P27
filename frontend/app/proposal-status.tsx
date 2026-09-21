const statuses: Record<string, { icon: string; label: string }> = {
  approved: { icon: '\u2713', label: 'Accepted' },
  rejected: { icon: '\u2715', label: 'Rejected / changes requested' },
  pending: { icon: '\u2026', label: 'Awaiting review' },
  draft: { icon: '\u270e', label: 'Draft' },
};

export default function ProposalStatus({ status }: { status: string }) {
  const item = statuses[status] ?? { icon: '\u2022', label: status };
  return <span className={`workflow-badge proposal-status status-${status}`}>
    <span className="proposal-status-icon" aria-hidden="true">{item.icon}</span>{item.label}
  </span>;
}
