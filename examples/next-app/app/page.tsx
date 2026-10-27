import { Shop } from './components/Shop';

const PRODUCTS = [
  { id: 1, name: 'Seramik kupa', price: 250 },
  { id: 2, name: 'Noktalı defter', price: 500 },
  { id: 3, name: 'Kanvas çanta', price: 750 },
];

// Sunucu bileşeni (RSC). Buradaki öğeler için istemci kaynak satırı yoktur: doğru satır ya da resolved:false.
export default function Page() {
  return (
    <main className="page">
      <h1 data-testid="srv-title">Mağaza</h1>
      <p className="lead" data-testid="srv-lead">
        Sunucuda oluşturulan açıklama.
      </p>
      <ServerNote text="RSC içinden RSC" />
      <Shop products={PRODUCTS} />
    </main>
  );
}

function ServerNote({ text }: { text: string }) {
  return <small data-testid="srv-note">{text}</small>;
}
