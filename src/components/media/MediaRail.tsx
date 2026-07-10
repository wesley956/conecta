import type { ReactNode } from 'react';

type MediaRailProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
  empty?: boolean;
  emptyText?: string;
  className?: string;
};

export function MediaRail({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
  empty = false,
  emptyText = 'Nada para exibir por enquanto.',
  className = 'stream-rail',
}: MediaRailProps) {
  return (
    <section className="stream-section">
      <div className="stream-section-heading">
        <div>
          <h2 className="stream-section-title">{title}</h2>
          {subtitle ? <p className="stream-section-subtitle">{subtitle}</p> : null}
        </div>

        {actionLabel && onAction ? (
          <button type="button" className="stream-section-action" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>

      {empty ? (
        <div className="stream-empty-state">{emptyText}</div>
      ) : (
        <div className={className}>{children}</div>
      )}
    </section>
  );
}
