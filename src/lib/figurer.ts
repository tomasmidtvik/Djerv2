// Tegner figurene som SVG i nettleseren. Ingen eksterne bibliotek.
// Tekst settes alltid med textContent. Farger kommer fra CSS-variabler, så lys og mørk modus følger siden.
import { antallKolonner, baller, median, type Ball, type Bolk } from './figurdata.ts';
import type { KampData } from './maltid.ts';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number>;

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element, tekst?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (tekst !== undefined) e.textContent = tekst;
  parent?.appendChild(e);
  return e;
}

const FARGE = { for: 'var(--fig-for)', mot: 'var(--fig-mot)' };
const AKSETEKST = { fill: 'var(--muted)', 'font-size': 11 };
const reduserBevegelse = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const tall = (x: number, d = 1) => x.toLocaleString('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
const dato = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Rot til et figurfelt: tømmer det og lager SVG og ett felles verktøytips. */
function ramme(el: HTMLElement, hoyde: number, etikett: string) {
  el.replaceChildren();
  el.style.position = 'relative';
  const b = el.clientWidth || 640;
  const svg = s('svg', { width: b, height: hoyde, viewBox: `0 0 ${b} ${hoyde}`, role: 'img', 'aria-label': etikett, class: 'block max-w-full select-none' }, el);
  const tips = document.createElement('div');
  tips.className = 'pointer-events-none absolute z-10 hidden min-w-[9rem] max-w-[15rem] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg';
  tips.setAttribute('aria-live', 'polite');
  el.appendChild(tips);
  return { svg, tips, bredde: b };
}

interface TipsRad {
  verdi: string;
  tekst?: string;
  farge?: string;
}

function visTips(tips: HTMLElement, el: HTMLElement, x: number, y: number, rader: TipsRad[]) {
  tips.replaceChildren();
  for (const r of rader) {
    const rad = document.createElement('div');
    rad.className = 'flex items-baseline gap-1.5 leading-snug';
    if (r.farge) {
      const nokkel = document.createElement('span');
      nokkel.className = 'inline-block h-0.5 w-3 shrink-0 self-center rounded';
      nokkel.style.background = r.farge;
      rad.appendChild(nokkel);
    }
    const v = document.createElement('span');
    v.className = 'num font-semibold text-ink';
    v.textContent = r.verdi;
    rad.appendChild(v);
    if (r.tekst) {
      const t = document.createElement('span');
      t.className = 'text-muted';
      t.textContent = r.tekst;
      rad.appendChild(t);
    }
    tips.appendChild(rad);
  }
  tips.classList.remove('hidden');
  const b = tips.offsetWidth;
  const h = tips.offsetHeight;
  const venstre = Math.max(0, Math.min(el.clientWidth - b, x + 12 + b > el.clientWidth ? x - b - 12 : x + 12));
  tips.style.left = `${venstre}px`;
  tips.style.top = `${Math.max(0, y - h - 10)}px`;
}

/** Forklaring over figuren: strek eller ball, aldri farget tekst. */
export function forklaring(el: HTMLElement, rader: { navn: string; farge: string; form?: 'ball' | 'strek' | 'ring' }[]) {
  el.replaceChildren();
  el.className = 'mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted';
  for (const r of rader) {
    const f = document.createElement('span');
    f.className = 'inline-flex items-center gap-1.5';
    const m = document.createElement('span');
    if (r.form === 'strek') {
      m.className = 'inline-block h-0.5 w-4 rounded';
      m.style.background = r.farge;
    } else if (r.form === 'ring') {
      m.className = 'inline-block h-2.5 w-2.5 rounded-full border-2';
      m.style.borderColor = r.farge;
    } else {
      m.className = 'inline-block h-2.5 w-2.5 rounded-full';
      m.style.background = r.farge;
    }
    f.appendChild(m);
    f.appendChild(document.createTextNode(r.navn));
    el.appendChild(f);
  }
}

// ---------- A. Ballediagram ----------

export interface BalleValg {
  bolk: number;
  fremhev?: string;
  animer?: boolean;
  kampUrl?: (id: string) => string;
  /** vis loddrett median (av for mange/få mål vises den ikke) */
  median?: boolean;
  maksHoyde?: number;
  /** ring rundt første mål i hver kamp (av for én kamp) */
  ring?: boolean;
}

/** 1-minuttsbolker hvis ballene blir store nok, ellers 3 minutter. */
export const autoBolk = (bredde: number) => (bredde >= 728 ? 1 : 3);

export function ballediagram(el: HTMLElement, data: KampData[], valg: BalleValg) {
  const { bolk } = valg;
  const { baller: bs, maksFor, maksMot } = baller(data, bolk);
  const b0 = el.clientWidth || 640;
  const mx = 6;
  const n = antallKolonner(bolk);
  const kolB = (b0 - mx * 2) / n;
  const r = Math.max(1.8, Math.min(kolB / 2 - 0.4, 7));
  const topp = 22;
  const bunn = 26;
  const sted = (maks: number) => maks * r * 2;
  const makshoyde = valg.maksHoyde ?? 460;
  const rå = Math.max(sted(maksFor) + sted(maksMot), 80);
  const skala = rå > makshoyde ? makshoyde / rå : 1;
  const steg = r * 2 * skala;
  const opp = Math.max(sted(maksFor) * skala, 28);
  const ned = Math.max(sted(maksMot) * skala, 28);
  const hoyde = topp + opp + ned + bunn;
  const midt = topp + opp;
  const etikett = `Ballediagram: ${bs.filter((x) => x.side === 'for').length} mål for og ${bs.filter((x) => x.side === 'mot').length} mål mot fordelt på minutt. Hver ball er ett mål.`;
  const { svg, tips } = ramme(el, hoyde, etikett);
  svg.setAttribute('role', 'group');
  svg.setAttribute('tabindex', '0');
  svg.classList.add('outline-offset-2');

  const xKol = (kol: number) => mx + kol * kolB + kolB / 2;
  // Akser
  const akse = s('g', {}, svg);
  for (let t = 15; t <= 90; t += 15) {
    const x = mx + (t / bolk) * kolB;
    s('line', { x1: x, x2: x, y1: topp, y2: hoyde - bunn, stroke: 'var(--border)', 'stroke-width': 1 }, akse);
    s('text', { x, y: hoyde - 8, 'text-anchor': 'middle', ...AKSETEKST }, akse, t === 90 ? '90+' : `${t}'`);
  }
  s('line', { x1: mx, x2: b0 - mx, y1: midt, y2: midt, stroke: 'var(--muted)', 'stroke-width': 1 }, akse);
  const pauseX = mx + (45 / bolk) * kolB;
  s('line', { x1: pauseX, x2: pauseX, y1: 12, y2: hoyde - bunn, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }, akse);

  // Median som loddrett strek for hver halvdel
  const mediane = { for: median(bs.filter((x) => x.side === 'for').map((x) => x.m)), mot: median(bs.filter((x) => x.side === 'mot').map((x) => x.m)) };
  let pauseVenstre = false;
  if (valg.median) {
    for (const side of ['for', 'mot'] as const) {
      const m = mediane[side];
      if (m === null) continue;
      const x = mx + (Math.min(m, 90) / bolk) * kolB;
      const y1 = side === 'for' ? topp : midt;
      const y2 = side === 'for' ? midt : hoyde - bunn;
      s('line', { x1: x, x2: x, y1, y2, stroke: 'var(--text)', 'stroke-width': 2, 'stroke-linecap': 'round' }, akse);
      if (side === 'for' && m < 45) pauseVenstre = false;
      else if (side === 'for') pauseVenstre = true;
      const venstre = m >= 80;
      s('text', { x: x + (venstre ? -4 : 4), y: side === 'for' ? topp + 9 : hoyde - bunn - 3, 'text-anchor': venstre ? 'end' : 'start', fill: 'var(--text)', 'font-size': 11, 'font-weight': 600 }, akse, `Median ${m}'`);
    }
  }
  s('text', { x: pauseX + (pauseVenstre ? -4 : 4), y: 10, 'text-anchor': pauseVenstre ? 'end' : 'start', ...AKSETEKST }, akse, 'Pause');

  // Baller
  const lag = s('g', {}, svg);
  const senter = (b: Ball) => ({ x: xKol(b.kol), y: b.side === 'for' ? midt - (b.rad + 0.5) * steg : midt + (b.rad + 0.5) * steg });
  const animer = valg.animer && !reduserBevegelse();
  const N = Math.max(1, bs.length);
  const elementer = bs.map((b) => {
    const { x, y } = senter(b);
    const dempet = valg.fremhev && (b.side === 'mot' || b.navn !== valg.fremhev || b.selvmal);
    const c = s('circle', { cx: x, cy: y, r: Math.max(1.5, r - 0.5), fill: FARGE[b.side], stroke: 'var(--surface)', 'stroke-width': 1, opacity: dempet ? 0.18 : 1 }, lag);
    if (b.forste && r >= 2.5 && valg.ring !== false) {
      c.setAttribute('stroke', 'var(--text)');
      c.setAttribute('stroke-width', '1.5');
    }
    if (animer) {
      const fra = b.side === 'for' ? -36 : 36;
      c.animate(
        [
          { transform: `translateY(${fra}px)`, opacity: 0 },
          { transform: 'translateY(0)', opacity: dempet ? 0.18 : 1 },
        ],
        { duration: 240, delay: (b.orden / N) * 960, easing: 'ease-out', fill: 'backwards' },
      );
    }
    return c;
  });
  const merke = s('circle', { r: r + 2, fill: 'none', stroke: 'var(--text)', 'stroke-width': 2, visibility: 'hidden', 'pointer-events': 'none' }, svg);

  const tastRekkefolge = bs.map((_, i) => i).sort((a, c) => bs[a].kol - bs[c].kol || bs[a].rad - bs[c].rad);
  let aktiv = -1;
  const vis = (i: number) => {
    aktiv = i;
    if (i < 0) {
      tips.classList.add('hidden');
      merke.setAttribute('visibility', 'hidden');
      return;
    }
    const b = bs[i];
    const { x, y } = senter(b);
    merke.setAttribute('cx', String(x));
    merke.setAttribute('cy', String(y));
    merke.setAttribute('visibility', 'visible');
    visTips(tips, el, x, y, [
      { verdi: `${b.m}'`, tekst: b.navn ? `${b.navn}${b.selvmal ? ' (selvmål)' : ''}` : 'Ukjent målscorer', farge: FARGE[b.side] },
      { verdi: b.kamp.tittel },
      { verdi: dato(b.kamp.dato) },
      ...(b.forste && valg.ring !== false ? [{ verdi: 'Første mål i kampen' }] : []),
    ]);
  };
  const naermest = (e: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best = -1;
    let d = 18 * 18;
    bs.forEach((b, i) => {
      const c = senter(b);
      const x = (c.x - px) ** 2 + (c.y - py) ** 2;
      if (x < d) {
        d = x;
        best = i;
      }
    });
    return best;
  };
  const apne = (i: number) => {
    if (valg.kampUrl && bs[i]) location.href = valg.kampUrl(bs[i].kamp.id);
  };
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const i = naermest(e);
    vis(i);
    svg.style.cursor = i >= 0 && valg.kampUrl ? 'pointer' : 'default';
  });
  svg.addEventListener('pointerleave', () => vis(-1));
  svg.addEventListener('pointerup', (e) => {
    const i = naermest(e);
    // På mobil viser første trykk verktøytipset, neste trykk på samme ball åpner kampen
    if (e.pointerType === 'touch' && i !== aktiv) vis(i);
    else if (i >= 0) apne(i);
  });
  svg.addEventListener('keydown', (e) => {
    const pos = tastRekkefolge.indexOf(aktiv);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') vis(tastRekkefolge[Math.min(bs.length - 1, pos + 1)]);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') vis(tastRekkefolge[Math.max(0, pos - 1)]);
    else if (e.key === 'Enter' && aktiv >= 0) apne(aktiv);
    else if (e.key === 'Escape') vis(-1);
    else return;
    e.preventDefault();
  });
  svg.addEventListener('blur', () => vis(-1));
  return elementer.length;
}

// ---------- Linjer: overlevelseskurve, forløp, sesongkurver ----------

export interface Serie {
  navn: string;
  farge: string;
  punkter: { x: number; y: number }[];
  /** trappekurve */
  trapp?: boolean;
  bredde?: number;
  opasitet?: number;
  /** tynne bakgrunnslinjer vises ikke i verktøytipset */
  bakgrunn?: boolean;
}

export interface LinjeValg {
  etikett: string;
  serier: Serie[];
  hoyde?: number;
  xMin: number;
  xMaks: number;
  yMin: number;
  yMaks: number;
  xTicks: { x: number; tekst: string }[];
  yTicks: { y: number; tekst: string }[];
  /** tekst i verktøytipset for en x-verdi */
  xTekst: (x: number) => string;
  yTekst: (y: number) => string;
  /** loddrette markeringer */
  markeringer?: { x: number; tekst: string }[];
  /** vannrett linje, f.eks. null eller 50 % */
  nivaa?: { y: number; tekst?: string };
  /** merker på linjen, f.eks. mål */
  merker?: { x: number; y: number; farge: string; tekst: string }[];
}

export function linjediagram(el: HTMLElement, v: LinjeValg) {
  const H = v.hoyde ?? 240;
  const { svg, tips, bredde } = ramme(el, H, v.etikett);
  const venstre = 36;
  const hoyre = 12;
  const topp = 12;
  const bunn = 24;
  const px = (x: number) => venstre + ((x - v.xMin) / (v.xMaks - v.xMin || 1)) * (bredde - venstre - hoyre);
  const py = (y: number) => topp + (1 - (y - v.yMin) / (v.yMaks - v.yMin || 1)) * (H - topp - bunn);
  for (const t of v.yTicks) {
    s('line', { x1: venstre, x2: bredde - hoyre, y1: py(t.y), y2: py(t.y), stroke: 'var(--border)', 'stroke-width': 1 }, svg);
    s('text', { x: venstre - 6, y: py(t.y) + 4, 'text-anchor': 'end', ...AKSETEKST, class: 'num' }, svg, t.tekst);
  }
  for (const t of v.xTicks) s('text', { x: px(t.x), y: H - 7, 'text-anchor': 'middle', ...AKSETEKST }, svg, t.tekst);
  if (v.nivaa) {
    s('line', { x1: venstre, x2: bredde - hoyre, y1: py(v.nivaa.y), y2: py(v.nivaa.y), stroke: 'var(--muted)', 'stroke-width': 1 }, svg);
    if (v.nivaa.tekst) s('text', { x: bredde - hoyre, y: py(v.nivaa.y) - 4, 'text-anchor': 'end', ...AKSETEKST }, svg, v.nivaa.tekst);
  }
  for (const m of v.markeringer ?? []) {
    s('line', { x1: px(m.x), x2: px(m.x), y1: topp, y2: H - bunn, stroke: 'var(--text)', 'stroke-width': 1.5 }, svg);
    s('text', { x: px(m.x) + 4, y: topp + 10, fill: 'var(--text)', 'font-size': 11, 'font-weight': 600 }, svg, m.tekst);
  }
  for (const se of v.serier) {
    if (!se.punkter.length) continue;
    let d = '';
    se.punkter.forEach((p, i) => {
      const x = px(p.x).toFixed(1);
      const y = py(p.y).toFixed(1);
      if (!i) d += `M${x} ${y}`;
      else if (se.trapp) d += `H${x}V${y}`;
      else d += `L${x} ${y}`;
    });
    s('path', { d, fill: 'none', stroke: se.farge, 'stroke-width': se.bredde ?? 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: se.opasitet ?? 1 }, svg);
  }
  for (const m of v.merker ?? []) s('circle', { cx: px(m.x), cy: py(m.y), r: 4, fill: m.farge, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);

  const hoved = v.serier.filter((x) => !x.bakgrunn);
  const xer = [...new Set(hoved.flatMap((x) => x.punkter.map((p) => p.x)))].sort((a, b) => a - b);
  const krysshar = s('line', { y1: topp, y2: H - bunn, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const verdi = (se: Serie, x: number) => {
    if (se.trapp) return [...se.punkter].reverse().find((p) => p.x <= x)?.y ?? null;
    return se.punkter.find((p) => p.x === x)?.y ?? null;
  };
  const vis = (x: number | null) => {
    if (x === null) {
      tips.classList.add('hidden');
      krysshar.setAttribute('visibility', 'hidden');
      return;
    }
    krysshar.setAttribute('x1', String(px(x)));
    krysshar.setAttribute('x2', String(px(x)));
    krysshar.setAttribute('visibility', 'visible');
    const rader: TipsRad[] = [{ verdi: v.xTekst(x) }];
    for (const se of hoved) {
      const y = verdi(se, x);
      if (y !== null) rader.push({ verdi: v.yTekst(y), tekst: se.navn, farge: se.farge });
    }
    for (const m of v.merker ?? []) if (m.x === x) rader.push({ verdi: m.tekst, farge: m.farge });
    visTips(tips, el, px(x), topp + 30, rader);
  };
  let aktiv = -1;
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    let best = 0;
    xer.forEach((x, i) => {
      if (Math.abs(px(x) - rel) < Math.abs(px(xer[best]) - rel)) best = i;
    });
    aktiv = best;
    vis(xer[best] ?? null);
  });
  svg.addEventListener('pointerleave', () => vis(null));
  svg.addEventListener('blur', () => vis(null));
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') aktiv = Math.min(xer.length - 1, aktiv + 1);
    else if (e.key === 'ArrowLeft') aktiv = Math.max(0, aktiv - 1);
    else return;
    e.preventDefault();
    vis(xer[aktiv]);
  });
}

// ---------- D. Søyler ----------

export function soyler(el: HTMLElement, bolker: Bolk[]) {
  const H = 240;
  const sum = (k: 'for' | 'mot') => bolker.reduce((n, b) => n + b[k], 0);
  const { svg, tips, bredde } = ramme(el, H, `Søylediagram: ${sum('for')} mål for og ${sum('mot')} mål mot fordelt på ${bolker.length} tidsbolker.`);
  const mx = 4;
  const topp = 18;
  const bunn = 40;
  const slot = (bredde - mx * 2) / bolker.length;
  const tykk = Math.max(3, Math.min(24, slot - 2));
  const maks = Math.max(1, ...bolker.map((b) => Math.max(b.for, b.mot)));
  const midt = topp + (H - topp - bunn) / 2;
  const enhet = (H - topp - bunn) / 2 / maks;
  const merkelapp = slot >= 26;
  s('line', { x1: mx, x2: bredde - mx, y1: midt, y2: midt, stroke: 'var(--muted)', 'stroke-width': 1 }, svg);
  const rund = (x: number, y: number, w: number, h: number, oppover: boolean) => {
    const r = Math.min(4, w / 2, h);
    return oppover
      ? `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
      : `M${x} ${y}V${y + h - r}Q${x} ${y + h} ${x + r} ${y + h}H${x + w - r}Q${x + w} ${y + h} ${x + w} ${y + h - r}V${y}Z`;
  };
  bolker.forEach((b, i) => {
    const x = mx + i * slot + (slot - tykk) / 2;
    const cx = mx + i * slot + slot / 2;
    if (b.for) s('path', { d: rund(x, midt - b.for * enhet - 1, tykk, b.for * enhet, true), fill: FARGE.for }, svg);
    if (b.mot) s('path', { d: rund(x, midt + 1, tykk, b.mot * enhet, false), fill: FARGE.mot }, svg);
    if (merkelapp) {
      if (b.for) s('text', { x: cx, y: midt - b.for * enhet - 5, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 11, class: 'num' }, svg, String(b.for));
      if (b.mot) s('text', { x: cx, y: midt + b.mot * enhet + 13, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 11, class: 'num' }, svg, String(b.mot));
    }
    if (merkelapp || i % 3 === 2) s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', ...AKSETEKST }, svg, b.navn);
  });
  const vis = (i: number) => {
    if (i < 0) return tips.classList.add('hidden');
    const b = bolker[i];
    visTips(tips, el, mx + i * slot + slot / 2, midt - 20, [
      { verdi: `Minutt ${b.navn}` },
      { verdi: String(b.for), tekst: 'mål for', farge: FARGE.for },
      { verdi: String(b.mot), tekst: 'mål mot', farge: FARGE.mot },
    ]);
  };
  const plass = (e: PointerEvent) => Math.floor((e.clientX - svg.getBoundingClientRect().left - mx) / slot);
  svg.addEventListener('pointermove', (e) => vis(Math.min(bolker.length - 1, Math.max(0, plass(e)))));
  svg.addEventListener('pointerleave', () => vis(-1));
  let aktiv = -1;
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') aktiv = Math.min(bolker.length - 1, aktiv + 1);
    else if (e.key === 'ArrowLeft') aktiv = Math.max(0, aktiv - 1);
    else return;
    e.preventDefault();
    vis(aktiv);
  });
  svg.addEventListener('blur', () => vis(-1));
}

// ---------- E. Varmekart ----------

/** Varmekart som vanlig tabell: tallene står i cellene, fargen viser mengde i én fargetone. */
export function varmekart(el: HTMLElement, kolonner: string[], rader: { navn: string; verdier: number[] }[], farge: string, tekstForste: string, bildetekst: string) {
  el.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'card overflow-x-auto';
  const tbl = document.createElement('table');
  tbl.className = 'tbl';
  const cap = document.createElement('caption');
  cap.className = 'sr-only';
  cap.textContent = bildetekst;
  tbl.appendChild(cap);
  const thead = tbl.createTHead().insertRow();
  const f = document.createElement('th');
  f.scope = 'col';
  f.textContent = tekstForste;
  thead.appendChild(f);
  for (const k of kolonner) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = '!text-center';
    th.textContent = k;
    thead.appendChild(th);
  }
  const maks = Math.max(1, ...rader.flatMap((r) => r.verdier));
  const body = tbl.createTBody();
  for (const r of rader) {
    const tr = body.insertRow();
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = '!text-sm !font-medium !normal-case !tracking-normal !text-ink whitespace-nowrap';
    th.textContent = r.navn;
    tr.appendChild(th);
    for (const v of r.verdier) {
      const td = tr.insertCell();
      const pct = Math.round((v / maks) * 90);
      td.className = 'num !border-surface text-center !border-2';
      td.textContent = v ? String(v) : '';
      if (v) {
        td.style.background = `color-mix(in oklab, ${farge} ${Math.max(12, pct)}%, var(--surface))`;
        if (pct >= 55) td.classList.add(farge === FARGE.mot ? 'varme-mot' : 'varme-for');
      }
    }
  }
  wrap.appendChild(tbl);
  el.appendChild(wrap);
}

/** Tegner figuren på nytt når bredden endrer seg. */
export function vedResize(el: HTMLElement, tegn: () => void) {
  let sist = el.clientWidth;
  let t: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => {
    if (el.clientWidth === sist) return;
    sist = el.clientWidth;
    clearTimeout(t);
    t = setTimeout(tegn, 120);
  }).observe(el);
}

export { FARGE, dato as datoTekst, tall as tallTekst };
