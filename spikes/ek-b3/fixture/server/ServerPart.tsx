// Sunucu bileşenleri (RSC). Yalnızca Next.js uygulamasında kullanılır; 'use client' yok.

async function loadTitle(): Promise<string> {
  await Promise.resolve();
  return 'Sunucu bileşeni';
}

async function AsyncPart() {
  const title = await loadTitle();
  return <h2 data-ekb3-rsc="@">{title} (async)</h2>;
}

export function ServerPart() {
  const where = 'sunucu';
  return (
    <section data-ekb3-rsc="@" className="card">
      <AsyncPart />
      <p data-ekb3-rsc="@">RSC ile üretilen paragraf ({where})</p>
      <ul data-ekb3-rsc="@">
        {['bir', 'iki'].map((t) => (
          <li data-ekb3-rsc="@" key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
