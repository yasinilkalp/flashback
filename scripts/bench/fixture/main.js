/**
 * NFR referans sayfası: 5.000 öğeli liste (FRD §10, NFR-PERF-01 / NFR-MEM-01 "5.000 düğümlü liste").
 *
 * JSX derleyicisi gerektirmesin diye düz JS + React.createElement ile yazıldı. Sorgu parametreleri:
 *   ?n=5000        liste öğesi sayısı (varsayılan 5000)
 *   ?endpoint=...  flashback-mcp alıcısının adresi
 *   ?ticker=ms     her `ms` milisaniyede 50 satırı günceller (bellek stres senaryosu); 0 = kapalı
 *
 * `flashback-devtools` kayıt KAPALI koşuda bench Vite eklentisi tarafından `dist/noop.js`'e yönlendirilir.
 */
import { createElement as h, memo, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Flashback } from 'flashback-devtools';

const params = new URLSearchParams(location.search);
const N = Number(params.get('n') ?? 5000);
const endpoint = params.get('endpoint') ?? undefined;
const tickerMs = Number(params.get('ticker') ?? 0);

/** Belirlenimci sözde rastgele (aynı koşu → aynı mutasyonlar). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

function initialRows() {
  const rand = lcg(42);
  return Array.from({ length: N }, (_, i) => ({ id: i, value: Math.floor(rand() * 1000) }));
}

const Row = memo(function Row({ row, selected, hidden, onToggle }) {
  return h(
    'li',
    { 'data-i': row.id, className: selected ? 'selected' : undefined, hidden, onClick: () => onToggle(row.id) },
    `Satır ${row.id} — değer ${row.value}`,
  );
});

const CHUNK = 100;

/** Parçadaki seçili kimlikler (parçanın memo karşılaştırması için kararlı metin). */
function selKey(selected, start) {
  let out = '';
  for (const id of selected) if (id >= start && id < start + CHUNK) out += `${id},`;
  return out;
}

/** Bir parçanın satır dizisi yalnızca o parçada değişiklik varsa yeni olur (dilim kimliği yerine içerik karşılaştırması). */
const Chunk = memo(
  function Chunk({ rows, sel, filter, onToggle }) {
    const selected = new Set(sel.split(',').filter(Boolean).map(Number));
    return rows.map((r) =>
      h(Row, { key: r.id, row: r, selected: selected.has(r.id), hidden: filter !== '' && !String(r.value).includes(filter), onToggle }),
    );
  },
  (a, b) => a.sel === b.sel && a.filter === b.filter && a.onToggle === b.onToggle && a.rows.length === b.rows.length && a.rows.every((r, i) => r === b.rows[i]),
);

function App() {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [rand] = useState(() => lcg(7));

  // Ardışık `count` satırı günceller (rastgele başlangıç): 1–2 parça yeniden çizilir, ~count metin mutasyonu.
  const bump = (count) =>
    setRows((prev) => {
      const next = prev.slice();
      const start = Math.floor(rand() * Math.max(1, next.length - count));
      for (let i = start; i < Math.min(next.length, start + count); i++) next[i] = { id: next[i].id, value: next[i].value + 1 };
      return next;
    });

  useEffect(() => {
    if (!tickerMs) return;
    const t = setInterval(() => bump(50), tickerMs);
    return () => clearInterval(t);
  }, []);

  const toggle = useCallback(
    (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  // Satırlar 100'lük memo'lu parçalarda: satır tıklaması yalnızca bir parçayı yeniden çizer (verimli bir referans
  // sayfa; React 19 geliştirme kipinin öğe başına maliyeti kaydın ek yükünü gölgelemesin). Filtre ise binlerce
  // satırın `hidden` özniteliğini değiştirir (ağır mutasyon senaryosu).
  const chunks = [];
  for (let c = 0; c < rows.length; c += CHUNK) {
    const part = rows.slice(c, c + CHUNK);
    chunks.push(h(Chunk, { key: c, rows: part, sel: selKey(selected, c), filter, onToggle: toggle }));
  }

  return h(
    'div',
    null,
    h(
      'header',
      null,
      h('strong', null, `${N} satır`),
      h('button', { type: 'button', id: 'bump', onClick: () => bump(100) }, '100 satırı güncelle'),
      h('label', { htmlFor: 'filter' }, 'Filtre'),
      h('input', { id: 'filter', value: filter, autoComplete: 'off', onChange: (e) => setFilter(e.target.value) }),
      h('span', { 'data-testid': 'selected-count' }, `${selected.size} seçili`),
    ),
    h('ul', { id: 'list' }, chunks),
  );
}

createRoot(document.getElementById('root')).render([h(App, { key: 'app' }), h(Flashback, { key: 'flashback', endpoint })]);
