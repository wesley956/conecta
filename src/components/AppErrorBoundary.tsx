import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useAppStore } from '@/stores/appStore';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  incidentCode: string;
}

function makeIncidentCode() {
  return `RPTV-${Date.now().toString(36).toUpperCase()}`;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    incidentCode: '',
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return {
      hasError: true,
      incidentCode: makeIncidentCode(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[RonecaPlayTV] Erro inesperado capturado pela proteção global.',
      {
        error,
        componentStack: info.componentStack,
        incidentCode: this.state.incidentCode,
      },
    );
  }

  componentDidUpdate(
    _previousProps: AppErrorBoundaryProps,
    previousState: AppErrorBoundaryState,
  ) {
    if (!previousState.hasError && this.state.hasError) {
      window.addEventListener('keydown', this.handleFallbackKeyDown, true);

      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>('[data-error-action="retry"]')
          ?.focus();
      });
    }

    if (previousState.hasError && !this.state.hasError) {
      window.removeEventListener('keydown', this.handleFallbackKeyDown, true);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleFallbackKeyDown, true);
  }

  private getFallbackActions() {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-error-action]'),
    ).filter(button => !button.disabled);
  }

  private handleFallbackKeyDown = (event: KeyboardEvent) => {
    const actions = this.getFallbackActions();
    if (actions.length === 0) return;

    const active = document.activeElement;
    const currentIndex = actions.findIndex(button => button === active);
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown';

    if (isPrevious || isNext) {
      event.preventDefault();
      event.stopPropagation();

      const direction = isPrevious ? -1 : 1;
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (startIndex + direction + actions.length) % actions.length;
      actions[nextIndex]?.focus();
      return;
    }

    if (
      event.key === 'Enter' ||
      event.key === 'NumpadEnter' ||
      event.key === ' '
    ) {
      const focusedAction =
        active instanceof HTMLButtonElement && actions.includes(active)
          ? active
          : actions[0];

      if (!focusedAction) return;

      event.preventDefault();
      event.stopPropagation();
      focusedAction.click();
      return;
    }

    if (
      event.key === 'Escape' ||
      event.key === 'Backspace' ||
      event.key === 'GoBack'
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.recoverApplication();
    }
  };

  private retry = () => {
    this.setState({
      hasError: false,
      incidentCode: '',
    });
  };

  private recoverApplication = () => {
    const store = useAppStore.getState();

    store.setIsPlaying(false);
    store.setCurrentChannel(null);
    store.setCurrentMovie(null);
    store.setCurrentSeries(null);
    store.setActiveNotice(
      `O aplicativo se recuperou da ocorrência ${this.state.incidentCode}.`,
    );
    store.setScreen('home');

    this.retry();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        className="flex min-h-screen w-screen items-center justify-center overflow-hidden bg-[#020617] px-6 py-8 text-white"
        aria-live="assertive"
      >
        <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 shadow-2xl backdrop-blur-xl sm:p-10">
          <div
            className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/10"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-red-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 9v4m0 4h.01M10.3 3.8 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.8a2 2 0 0 0-3.4 0Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-red-300/80">
            Proteção do aplicativo
          </p>

          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            O aplicativo encontrou uma falha inesperada
          </h1>

          <p className="mt-4 max-w-xl text-base leading-7 text-white/62">
            Seus canais, listas, favoritos, progresso e configurações continuam
            salvos. Tente renderizar novamente ou volte ao início com o estado de
            reprodução limpo.
          </p>

          <div className="mt-6 rounded-xl border border-white/8 bg-black/20 px-4 py-3">
            <span className="text-xs uppercase tracking-wider text-white/35">
              Código da ocorrência
            </span>
            <p className="mt-1 font-mono text-sm text-white/70">
              {this.state.incidentCode}
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              data-error-action="retry"
              data-tv-focusable="true"
              tabIndex={0}
              autoFocus
              onClick={this.retry}
              className="min-h-14 rounded-xl bg-white px-5 font-semibold text-black outline-none transition hover:bg-white/90 focus:scale-[1.035] focus:ring-4 focus:ring-red-400/55"
            >
              Tentar novamente
            </button>

            <button
              type="button"
              data-error-action="recover"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={this.recoverApplication}
              className="min-h-14 rounded-xl border border-white/14 bg-white/[0.07] px-5 font-semibold text-white outline-none transition hover:bg-white/[0.12] focus:scale-[1.035] focus:ring-4 focus:ring-red-400/55"
            >
              Recuperar e voltar ao início
            </button>
          </div>
        </section>
      </main>
    );
  }
}
