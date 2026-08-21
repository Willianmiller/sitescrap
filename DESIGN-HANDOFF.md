# LexLeilões — Design Handoff (Novo Layout)

Este documento define o design system aplicado ao site LexLeilões, extraído do layout Cleber Lima e adaptado para o conteúdo e funcionalidade do LexLeilões. É a fonte de verdade para implementação.

---

## 1. Tokens de Design (CSS Variables)

```css
:root {
  /* Cores */
  --bg: #0B0B0B;
  --surface: #171717;
  --border: #2A2A2A;
  --fg: #FFFFFF;
  --muted: #A1A1AA;
  --accent: #B38547;
  --accent-hover: #c9974f;
  --success: #22C55E;

  /* Tipografia */
  --font-display: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* Layout */
  --max-w: 1180px;
  --radius: 14px;
  --radius-sm: 8px;

  /* Motion */
  --transition: 0.4s cubic-bezier(0.16,1,0.3,1);
}
```

### Mudanças em relação ao LexLeilões anterior

| Token | Antes | Depois |
|-------|-------|--------|
| `--accent` | `#C8A24A` | `#B38547` |
| `--accent-hover` | `#E3C56E` | `#c9974f` |
| `--max-w` | `1200px` | `1180px` |
| `--radius` | `12px` | `14px` |
| `--radius-sm` | `8px` | `8px` (inalterado) |

---

## 2. Paleta de Cores

| Uso | Cor | Hex |
|-----|-----|-----|
| Background principal | Preto profundo | `#0B0B0B` |
| Superfícies (cards, modais) | Cinza escuro | `#171717` |
| Bordas | Cinza médio | `#2A2A2A` |
| Texto principal | Branco | `#FFFFFF` |
| Texto muted/secundário | Cinza claro | `#A1A1AA` |
| Acento/destaque | Dourado quente | `#B38547` |
| Acento hover | Dourado claro | `#c9974f` |
| Sucesso/WhatsApp | Verde | `#22C55E` |
| Texto em botão primary | Preto | `#0B0B0B` |

### Gradientes

- **Hero overlay**: `radial-gradient(1000px 500px at 78% 20%, rgba(179,133,71,0.08), transparent 60%), linear-gradient(180deg, rgba(11,11,11,0.55) 0%, rgba(11,11,11,0.7) 45%, rgba(11,11,11,0.96) 100%)`
- **CTA band**: `radial-gradient(800px 360px at 85% 20%, rgba(179,133,71,0.12), transparent 60%), var(--surface)`
- **Auction card gradient**: `linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.48) 32%, transparent 65%)`
- **Hero grain**: `linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)` (56px grid)

---

## 3. Tipografia

### Fontes

| Uso | Fonte | Pesos |
|-----|-------|-------|
| Display (títulos, navbar, badges) | Manrope | 600, 700, 800 |
| Body (textos, parágrafos, inputs) | Inter | 400, 500, 600 |

### Escala de Tipografia

| Elemento | Tamanho | Peso | Fonte | Detalhes |
|----------|---------|------|-------|----------|
| `h1` hero | `clamp(38px,6.4vw,74px)` | 800 | Manrope | letter-spacing: -2px, line-height: 1.05 |
| `h2` section | `clamp(30px,4.6vw,46px)` | 800 | Manrope | letter-spacing: -1px, line-height: 1.12 |
| `h3` card/serviço | 19px | 700 | Manrope | — |
| `h4` diffs | 16px | 700 | Manrope | — |
| Body text | 17px | 400 | Inter | line-height: 1.7 |
| Body small | 14.5px | 400 | Inter | line-height: 1.7 |
| Badge/label | 12px | 700 | Manrope | text-transform: uppercase, letter-spacing: 2.4px |
| Card meta | 13px | 400 | Inter | — |
| Button | 15px | 600 | Manrope | — |
| Stat value | 32px | 800 | Manrope | font-variant-numeric: tabular-nums |
| Stat label | 13px | 400 | Inter | — |
| Footer h5 | 13px | 700 | Manrope | text-transform: uppercase, letter-spacing: 1.4px |
| Footer links | 14px | 400 | Inter | — |
| Footer bottom | 12.5px | 400 | Inter | — |

---

## 4. Espaçamento e Layout

### Container

- `max-width: 1180px`, centralizado com `margin: 0 auto`
- Padding horizontal: `24px` (desktop), `20px` (tablet), `16px` (mobile)

### Sections

- Padding: `110px 24px` (desktop), `84px 20px` (≤820px)
- Section header margin-bottom: `56px`
- Section header max-width: `720px`
- Section header centralizado: `margin-left:auto; margin-right:auto; text-align:center`

### Grids

| Grid | Colunas | Gap | Notas |
|------|---------|-----|-------|
| Auction cards | 3 colunas | 10px | `aspect-ratio: 4/3`, cards full-image |
| Services | 3 colunas | 16px | Cards com superfície |
| Differentials | 3 colunas | 16px | Cards inline icon+text |
| Contact cards | 3 colunas | 16px | Cards centralizados |
| Footer | 1.5fr 1fr 1fr 1.2fr | 40px | 4 colunas |
| Stats row | 4 colunas | 16px | — |

---

## 5. Componentes

### Navbar (fixa)

- **Posição**: `position: fixed; top: 0; z-index: 1000`
- **Estado inicial**: transparente, padding `18px 0`
- **Estado scrolled**: `background: rgba(11,11,11,0.86); backdrop-filter: blur(24px); border-bottom: 1px solid var(--border); padding: 12px 0`
- **Logo**: Manrope 800, 22px, com `.logo-mark` (quadrado 9x9px, `var(--accent)`, `rotate(45deg)`)
- **Links**: 19px, `var(--muted)`, hover → `var(--fg)` com underline `var(--accent)` (width animation)
- **CTA button**: `padding: 10px 22px; background: var(--accent); color: #0B0B0B; border-radius: 100px`
- **Mobile toggle**: 3 spans, animação para X quando `.active`

### Hero

- `min-height: 100vh`, flex center
- **Background**: parallax com `will-change: transform`, imagem com `filter: saturate(0.7) contrast(1.05)`, escala `inset: -10%`
- **Overlay**: radial gradient dourado + linear gradient escuro
- **Grain**: grid pattern sutil com animação `floatGrain 16s linear infinite`
- **Badge**: pill com borda `rgba(179,133,71,0.35)`, fundo `rgba(179,133,71,0.06)`, dot pulsante
- **Título**: `clamp(38px,6.4vw,74px)`, `<em>` em `var(--accent)`
- **Stats**: grid 3 colunas, cards com `background: rgba(23,23,23,0.55)`, borda `var(--border)`, valor em `var(--accent)`

### Botões

- **Primary**: `background: var(--accent); color: #0B0B0B; border-radius: 100px; padding: 14px 30px`
  - Hover: `var(--accent-hover)`, `translateY(-2px)`, `box-shadow: 0 10px 30px rgba(179,133,71,0.25)`
- **Outline**: `border: 1px solid var(--border); color: var(--fg); background: transparent`
  - Hover: `border-color: var(--accent); background: rgba(179,133,71,0.07); translateY(-2px)`
- Todos usam `border-radius: 100px` (pill shape)

### Auction Cards (full-image)

- **Container**: `position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 4/3`
- **Background**: imagem com `background-size: cover`, hover → `scale(1.03)`
- **Gradient overlay**: `linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.48) 32%, transparent 65%)`
- **Conteúdo**: posicionado `bottom: 0`, padding `22px 24px`, flex column
- **Price pill**: `background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-radius: 100px; padding: 6px 14px; font-size: 13px; font-weight: 700; color: #1a1a1a`
- **Título**: Manrope 700, `clamp(16px,1.6vw,21px)`, branco
- **Meta (tipo leilão + data)**: alinhado à direita, 11px uppercase para tipo, 12px muted para data
- **Hover**: `transform: scale(1.02)` no card, gradient mais escuro

### Service Cards

- `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 30px 26px`
- **Top bar**: `::before` com `height: 2px; background: var(--accent)`, `scaleX(0)` → `scaleX(1)` no hover
- **Icon**: 48x48px, `border-radius: 12px`, fundo `rgba(179,133,71,0.1)`, borda `rgba(179,133,71,0.2)`, cor `var(--accent)`
- **Hover**: `border-color: rgba(179,133,71,0.35); translateY(-4px); box-shadow: 0 16px 44px rgba(0,0,0,0.35)`

### Timeline (Como Funciona)

- Container max-width: `860px`, centralizado
- Linha vertical: `left: 19px`, gradiente de `transparent` → `var(--accent)` → `transparent`
- **Dot**: 24x24px, `border-radius: 50%`, fundo `var(--surface)`, borda `rgba(179,133,71,0.5)`, inner dot 9px `var(--accent)`
- **Item padding**: `0 0 40px 64px`
- **Número**: Manrope 800, 13px, `var(--accent)`, letter-spacing 1px

### Differentials

- Grid 3 colunas
- **Card**: flex row com gap 16px, `background: var(--surface)`, borda `var(--border)`, padding `24px`
- **Check circle**: 34x34px, `border-radius: 50%`, fundo `rgba(179,133,71,0.12)`, borda `rgba(179,133,71,0.3)`
- Hover: `border-color: rgba(179,133,71,0.35); translateY(-3px); background: #1a1a1a`

### Opportunity Cards (Oportunidades)

- Grid 3 colunas (desktop)
- **Filtros**: pills com `border-radius: 100px`, estado active com `var(--accent)` border + bg
- **Card**: `background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius)`
- **Imagem**: 180px height, badge posicionado top-left
- **Valores**: preço de mercado tachado (muted), preço de lance (bold 20px)
- **Save pill**: `background: rgba(34,197,94,0.1); color: var(--success)`
- **Botão ação**: fundo `rgba(200,162,74,0.1)`, hover → `var(--accent)` solid

### Blog Cards

- Grid 3 colunas
- **Imagem**: 200px height, hover → `scale(1.05)`
- **Category badge**: pill `rgba(200,162,74,0.1)`, cor `var(--accent)`
- **Hover**: `border-color: rgba(200,162,74,0.3); translateY(-4px)`

### FAQ Accordion

- Max-width: `820px`, centralizado
- **Item**: `background: var(--surface)`, borda `var(--border)`, `border-radius: var(--radius)`
- **Active**: `border-color: rgba(179,133,71,0.4)`
- **Pergunta**: Manrope 600, 16.5px, flex space-between
- **Ícone +**: 26x26px, `border-radius: 50%`, borda `var(--border)`, rotate 45deg no active
- **Resposta**: `max-height: 0` → `max-height: 400px`, padding smooth

### Testimonials

- Carousel horizontal com dots
- **Card**: `min-width: 380px`, `background: var(--surface)`, padding `32px`
- **Stars**: cor `var(--accent)`, letter-spacing 2px
- **Avatar**: 44x44px, `border-radius: 50%`, fundo `var(--border)`
- **Dots**: 8x8px, active → 24px width, `border-radius: 4px`, cor `var(--accent)`

### CTA Band

- `background: radial-gradient(800px 360px at 85% 20%, rgba(179,133,71,0.12), transparent 60%), var(--surface)`
- `border: 1px solid var(--border); border-radius: 20px; padding: 64px 48px`

### Contact Form

- **Input/Textarea**: `background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius)`
- **Focus**: `border-color: var(--accent)`
- **Submit**: `background: var(--accent); color: #0B0B0B; border-radius: var(--radius-sm)`

### Footer

- `border-top: 1px solid var(--border); padding: 64px 24px 32px; background: #080808`
- Grid 4 colunas: `1.5fr 1fr 1fr 1.2fr`
- Links hover: `color: var(--accent); transform: translateX(2px)`
- Social icons: 40x40px, `border-radius: 50%`, hover → borda + cor accent

### WhatsApp FAB

- `position: fixed; bottom: 24px; right: 24px; z-index: 900`
- 58x58px, `border-radius: 50%`, `background: #22C55E`
- Shadow: `0 12px 36px rgba(34,197,94,0.35)`
- Hover: `translateY(-3px) scale(1.05)`
- Pulse ring: `::after` com `border: 1px solid rgba(34,197,94,0.4)`, animação `pulse-glow`

### Back to Top

- `position: fixed; bottom: 90px; right: 24px`
- 44x44px, `border-radius: 50%`, `background: var(--surface)`, borda `var(--border)`
- `opacity: 0; pointer-events: none` → `.visible` → `opacity: 1`
- Hover: borda + cor accent

---

## 6. Animações

| Animação | Keyframes | Uso |
|----------|-----------|-----|
| `fadeUp` | `opacity:0 → 1`, `translateY(30px) → 0` | Reveal de seções |
| `fadeIn` | `opacity:0 → 1` | Badges, elementos leves |
| `floatGrain` | `translateY(0) → -40px` | Hero grain background |
| `pulse-glow` | `box-shadow` oscillando | Badge dot, WhatsApp ring |
| `floatParticle` | `translateY(100vh → -100vh)` + rotate | Particles do hero |
| `countUp` | `opacity:0 → 1`, `translateY(10px) → 0` | Contadores |
| `shimmer` | `background-position` | Loading states (se usado) |

### Scroll Reveal

- `.reveal`: `opacity:0; transform:translateY(36px)` → `.visible`: `opacity:1; transform:translateY(0)`
- `.reveal-left`: translateX(-40px) → 0
- `.reveal-right`: translateX(40px) → 0
- `.reveal-scale`: scale(0.94) → 1
- Transição: `0.7s ease`
- Trigger: `IntersectionObserver` com `threshold: 0.1`

### Glass Utility

```css
.glass {
  background: rgba(23,23,23,0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(42,42,42,0.5);
}
```

---

## 7. Breakpoints Responsivos

| Breakpoint | Largura | Mudanças |
|------------|---------|----------|
| Desktop | > 1024px | Layout completo, grids de 3-4 colunas |
| Tablet landscape | ≤ 1024px | Auction: 2 colunas, Services: 1 coluna, Diffs: 2 colunas, Footer: 2 colunas |
| Tablet portrait | ≤ 820px | Navbar links viram mobile menu, Hero auto-height, Contact: 1 coluna, padding reduzido |
| Mobile | ≤ 600px | Auction: 1 coluna, Diffs: 1 coluna, Timeline padding ajustado, Footer: 1 coluna |
| Mobile small | ≤ 430px | Padding 18px, buttons full-width, footer bottom em coluna |

### Mobile Menu

- Painel lateral direito: `width: min(80vw, 340px)`, slide-in com `right: -100%` → `right: 0`
- Scrim overlay: `background: rgba(0,0,0,0.6); backdrop-filter: blur(4px)`
- Transição: `0.45s cubic-bezier(0.16,1,0.3,1)`

---

## 8. Funcionalidades a Preservar

### API de Imóveis

- `GET /api/properties?limit=100` — carrega imóveis dinâmicos
- Renderiza cards de oportunidades com filtro (judicial/extrajudicial)
- Exibe: cidade, tipo, valor de mercado, valor de lance, economia %, imagem, badge

### Blog

- Array estático `ARTICLES` com 3 artigos mock
- Renderiza cards com imagem, category badge, título, resumo, link

### Depoimentos

- Array estático `TESTIMONIALS` com 5 depoimentos
- Carousel horizontal com dots de navegação
- Auto-advance a cada 5 segundos

### Particles

- 30 partículas douradas flutuando no hero
- Animação `floatParticle` com duração e delay aleatórios

### Contadores

- Animação de contagem numérica ao entrar no viewport
- Easing: `1 - Math.pow(1 - progress, 3)` (ease-out cubic)

### Formulário de Contato

- Campos: nome, email, telefone, mensagem
- Submit → feedback visual "Mensagem Enviada!" com cor verde
- Reset automático após 3 segundos

### Scroll Reveal

- IntersectionObserver em todos os `.reveal`, `.reveal-left`, `.reveal-right`, `.reveal-scale`
- Threshold: 0.1

### Parallax

- Hero background se move com `translateY(scrolled * 0.3)`

---

## 9. Checklist de Implementação

1. [ ] Aplicar CSS variables exatas (cores, fontes, spacing, radius)
2. [ ] Manter toda a estrutura HTML (Hero, Quem Somos, Serviços, Como Funciona, Diferenciais, Oportunidades, Blog, FAQ, Depoimentos, Contato, Footer)
3. [ ] Todos os links e CTAs apontando para os locais corretos do LexLeilões
4. [ ] API `/api/properties` funcionando com renderização dinâmica
5. [ ] Filtros de oportunidades (Todos, Judicial, Extrajudicial) operacionais
6. [ ] Carousel de depoimentos com auto-advance e dots
7. [ ] Particles no hero
8. [ ] Contadores animados
9. [ ] FAQ accordion
10. [ ] Formulário de contato com feedback
11. [ ] Scroll reveal em todas as seções
12. [ ] Navbar sticky com glass blur no scroll
13. [ ] Mobile menu funcional
14. [ ] WhatsApp FAB e back-to-top
15. [ ] Responsive: testar em 360px, 768px, 1024px, 1440px
16. [ ] SEO: meta tags, Open Graph, JSON-LD preservados
17. [ ] `admin.html`, `api/`, `scraper/`, `supabase/`, `vercel.json` intactos

---

## 10. Arquivos do Projeto

| Arquivo | Status | Descrição |
|---------|--------|-----------|
| `index.html` | **REESCREVER** | Site principal com novo layout |
| `lexleiloes-site.html` | Manter ou remover | Versão alternativa (não usada em produção) |
| `admin.html` | **MANTER** | Painel administrativo |
| `api/` | **MANTER** | Backend API (Vercel Functions) |
| `scraper/` | **MANTER** | Scraper de leilões |
| `supabase/` | **MANTER** | Configuração Supabase |
| `vercel.json` | **MANTER** | Configuração de deploy |
| `package.json` | **MANTER** | Dependências do projeto |
| `DESIGN-HANDOFF.md` | **ATUALIZAR** | Este documento |
| `DESIGN-MANIFEST.json` | Manter | Manifesto de design existente |
