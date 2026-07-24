import { useEffect, useState } from "react";
import { DeviceSession, useDeviceSession } from "./deviceSession";
import { moveFocus } from "./focus";
import { closeApplication, isBackKey, platform } from "./platform";

const destinations = [
  { icon: "⌂", label: "Início" },
  { icon: "◉", label: "TV ao vivo" },
  { icon: "▶", label: "Filmes" },
  { icon: "▣", label: "Séries" },
  { icon: "♥", label: "Minha lista" },
  { icon: "⚙", label: "Ajustes" }
];

const explore = [
  { label: "TV ao vivo", count: "284 canais", tone: "gold" },
  { label: "Filmes", count: "1.438 títulos", tone: "red" },
  { label: "Séries", count: "317 séries", tone: "gold" },
  { label: "Minha lista", count: "Seus favoritos", tone: "red" }
];

function FocusableButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button data-tv-focusable="true" {...props} />;
}

function ActivationScreen({
  session,
  onRefresh,
  onReset
}: {
  session: DeviceSession;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const pending = session.status === "pending";
  const title = {
    loading: "Preparando dispositivo",
    pending: "Ativar dispositivo",
    active: "Dispositivo ativo",
    blocked: "Acesso bloqueado",
    expired: "Assinatura expirada",
    error: "Falha de conexão"
  }[session.status];

  return (
    <main className="activation-shell">
      <section className="activation-panel">
        <div className="activation-brand">
          <span className="brand-mark">R</span>
          <span><b>RONECA</b><small>PLAYER TV</small></span>
        </div>

        <p className="eyebrow">{platform === "webos" ? "LG WEBOS" : platform === "tizen" ? "SAMSUNG TIZEN" : "PRÉ-VISUALIZAÇÃO"}</p>
        <h1>{title}</h1>
        <p className="activation-message">
          {session.message || (pending
            ? "Envie o código abaixo ao seu vendedor ou administrador."
            : "Conectando ao painel com segurança.")}
        </p>

        {session.deviceCode && (
          <div className="activation-code" aria-label={`Código de ativação ${session.deviceCode}`}>
            <small>CÓDIGO DO APARELHO</small>
            <strong>{session.deviceCode}</strong>
            <span>{pending ? "Aguardando liberação automática" : "Identidade do aparelho"}</span>
          </div>
        )}

        <div className="activation-actions">
          <FocusableButton
            data-autofocus="true"
            className="primary"
            disabled={session.refreshing || session.status === "loading"}
            onClick={onRefresh}
          >
            {session.refreshing ? "Atualizando..." : "Atualizar acesso"}
          </FocusableButton>
          {(session.status === "blocked" || session.status === "error") && (
            <FocusableButton className="secondary danger" onClick={onReset}>
              Gerar novo código
            </FocusableButton>
          )}
        </div>

        {pending && <p className="activation-hint">A tela consulta a liberação a cada 15 segundos.</p>}
      </section>
      <div className="activation-art" aria-hidden="true"><i /><span>R</span></div>
    </main>
  );
}

export function App() {
  const [selected, setSelected] = useState("Início");
  const { session, refresh, reset } = useDeviceSession();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right"
      };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        moveFocus(direction);
      } else if (isBackKey(event)) {
        event.preventDefault();
        closeApplication();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-autofocus='true']")?.focus();
    }, 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session.status]);

  if (session.status !== "active") {
    return <ActivationScreen session={session} onRefresh={() => void refresh()} onReset={() => void reset()} />;
  }

  return (
    <main className="shell">
      <aside className="rail" aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">RONECA</span>
        </div>
        <nav>
          {destinations.map((item) => (
            <FocusableButton
              key={item.label}
              className={`nav-item ${selected === item.label ? "selected" : ""}`}
              aria-label={item.label}
              onClick={() => setSelected(item.label)}
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
            </FocusableButton>
          ))}
        </nav>
        <small className="platform">{platform.toUpperCase()}</small>
      </aside>

      <section className="content">
        <header>
          <div>
            <p className="eyebrow">RONECAPLAYTV</p>
            <h1>{selected}</h1>
          </div>
          <div className="header-actions">
            <FocusableButton className="pill">⌕&nbsp;&nbsp;Buscar</FocusableButton>
            <div className="status">
              <i /> {session.clientName || "Aparelho ativo"} <span>•</span> <b>Ativo</b>
            </div>
          </div>
        </header>

        <section className="hero">
          <div className="accent"><i /><i /></div>
          <div className="hero-copy">
            <p className="eyebrow">RONECAPLAYTV</p>
            <h2>Sua programação em um só lugar</h2>
            <p className="description">
              {session.playlistName
                ? `${session.playlistName} pronta para explorar.`
                : "A mesma experiência rápida, elegante e familiar do aplicativo Android."}
            </p>
            <div className="hero-actions">
              <FocusableButton data-autofocus="true" className="primary">
                Explorar filmes
              </FocusableButton>
              <FocusableButton className="secondary">TV ao vivo</FocusableButton>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orb" />
            <span>R</span>
          </div>
        </section>

        <section className="explore-section">
          <div className="section-heading">
            <div><h3>Explorar</h3><p>Acesso direto ao seu conteúdo</p></div>
            <div className="cut"><i /><i /></div>
          </div>
          <div className="cards">
            {explore.map((item) => (
              <FocusableButton key={item.label} className={`card ${item.tone}`}>
                <span className="card-icon">◆</span>
                <span><strong>{item.label}</strong><small>{item.count}</small></span>
                <b>›</b>
              </FocusableButton>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
