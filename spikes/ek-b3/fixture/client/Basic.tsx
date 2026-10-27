'use client';
import { useState } from 'react';

export function Basic() {
  const [count, setCount] = useState(0);
  return (
    <section data-ekb3="@" className="card">
      <h2 data-ekb3="@">Temel öğeler</h2>
      <p data-ekb3="@">
        Basit paragraf <strong data-ekb3="@">kalın</strong> ve <em data-ekb3="@">eğik</em>.
      </p>
      <button data-ekb3="@"
        type="button"
        onClick={() => setCount((c) => c + 1)}
      >
        Sayaç: {count}
      </button>
      <input data-ekb3="@" aria-label="ad" defaultValue="Ayşe" />
      <img data-ekb3="@" alt="" width={16} height={16} src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
    </section>
  );
}
