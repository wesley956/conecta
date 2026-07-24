import { useEffect, useState } from "react";
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

export function App() {
  const [selected, setSelected] = useState("Início");

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
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-autofocus='true']")?.focus();
    });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <div className="status"><i /> Aparelho ativo <span>•</span> <b>Ativo</b></div>
          </div>
        </header>

        <section className="hero">
          <div className="accent"><i /><i /></div>
          <div className="hero-copy">
            <p className="eyebrow">RONECAPLAYTV</p>
            <h2>Sua programação em um só lugar</h2>
            <p className="description">
              A mesma experiência rápida, elegante e familiar do aplicativo Android.
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
