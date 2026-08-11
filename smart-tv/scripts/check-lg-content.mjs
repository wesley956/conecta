import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`LG-04: ${message}`);
    process.exit(1);
  }
};

const app = read("src/App.tsx");
const shell = read("src/content/MainShell.tsx");
const cards = read("src/content/cards.ts");
const css = read("src/content.css");
const main = read("src/main.tsx");

assert(app.includes("const PAGE_SIZE = 60"), "catálogo precisa manter paginação progressiva de 60 itens.");
assert(shell.includes("slice(0, 20).map(channelCard)"), "Busca global precisa limitar Canais a 20 resultados como o APK.");
assert(shell.includes("slice(0, 20).map(movieCard)"), "Busca global precisa limitar Filmes a 20 resultados como o APK.");
assert(shell.includes("slice(0, 20).map(seriesCard)"), "Busca global precisa limitar Séries a 20 resultados como o APK.");
assert(shell.includes('<SearchGroup title="Canais"') && shell.includes('<SearchGroup title="Filmes"') && shell.includes('<SearchGroup title="Séries"'), "Busca global deve separar resultados por tipo.");
assert(shell.includes('label="Favoritos"') && shell.includes('label="A-Z"'), "Canais precisam expor Favoritos e A-Z.");
assert(shell.includes('["Todos", "Minha Lista", "Continuar"'), "Filmes precisam manter Todos, Minha Lista e Continuar.");
assert(shell.includes('["Todas", "Minha Lista", "Continuar"'), "Séries precisam manter Todas, Minha Lista e Continuar.");
assert(shell.includes('title="Continuar assistindo"') && shell.includes('title="Minha lista"'), "Home precisa manter Continuar assistindo e Minha lista.");
assert(shell.includes("Retome exatamente de onde parou"), "Continuar assistindo precisa representar progresso real.");
assert(shell.includes("data-scroll-key") && shell.includes("scrollMemory"), "LG-04 precisa preservar posição de rolagem durante retornos.");
assert(cards.includes("progress") && cards.includes("currentTime") && cards.includes("duration"), "Cards de biblioteca precisam carregar progresso real.");
assert(css.includes("padding: 150% 0 0"), "Cards de filmes/séries devem preservar proporção visual 2:3 sem depender de CSS aspect-ratio moderno.");
assert(css.includes("grid-template-columns: repeat(6") && css.includes("grid-template-columns: repeat(4"), "Grid de posters precisa ter layouts FHD e 720p.");
assert(css.includes("grid-template-columns: repeat(3") && css.includes("grid-template-columns: repeat(2"), "Canais precisam usar grid compacto próprio em FHD/720p.");
assert(css.includes('img[data-media-fit="contain"]') && css.includes('img[data-media-fit="cover"]'), "Imagens precisam diferenciar contain e cover para evitar deformação.");
assert(css.includes(".catalog-notice"), "Aviso de catálogo preservado/reserva não pode substituir a área de conteúdo.");
assert(shell.includes("Nenhum canal encontrado") && shell.includes("Nenhum filme encontrado") && shell.includes("Nenhuma série encontrada"), "Estados vazios por catálogo são obrigatórios.");
assert(shell.includes("Nenhum resultado encontrado") && shell.includes("Digite um nome para iniciar a busca"), "Busca precisa ter estados vazio e sem resultado.");

const contentImport = main.indexOf('import "./content.css"');
const navigationImport = main.indexOf('import "./navigation.css"');
assert(contentImport >= 0 && navigationImport > contentImport, "navigation.css deve continuar depois de content.css para preservar o gate visual de foco LG-03.");

const staged = path.join(root, "build/webos");
if (fs.existsSync(staged)) {
  const assets = path.join(staged, "assets");
  const cssFiles = fs.existsSync(assets) ? fs.readdirSync(assets).filter(name => name.endsWith(".css")) : [];
  const packagedCss = cssFiles.map(name => fs.readFileSync(path.join(assets, name), "utf8")).join("\n");
  assert(packagedCss.includes("content-poster-card") && packagedCss.includes("global-search-row") && packagedCss.includes("content-channel-card"), "CSS LG-04 não chegou ao bundle webOS final.");
}

console.log("LG-04: Home, catálogo, busca agrupada, biblioteca, paginação e imagens validados no bundle webOS.");
