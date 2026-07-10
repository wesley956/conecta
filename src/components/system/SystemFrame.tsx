import type { ReactNode } from 'react';

interface SystemFrameProps {
  children: ReactNode;
  className?: string;
}

export function SystemFrame({ children, className = '' }: SystemFrameProps) {
  return (
    <div className={`system-frame ${className}`.trim()}>
      <div className="system-frame-glow system-frame-glow-one" aria-hidden="true" />
      <div className="system-frame-glow system-frame-glow-two" aria-hidden="true" />
      <div className="system-frame-grid" aria-hidden="true" />

      <header className="system-brandbar">
        <div className="system-brandmark">RP</div>
        <div className="system-brandcopy">
          <strong>RonecaPlayTV</strong>
          <span>Streaming autorizado</span>
        </div>
      </header>

      <main className="system-frame-content">{children}</main>

      <footer className="system-frame-footer">
        O aplicativo não fornece conteúdo. Utilize somente listas autorizadas.
      </footer>
    </div>
  );
}
