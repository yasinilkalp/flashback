'use client';

const ITEMS = [
  { id: 1, name: 'Elma', price: 30 },
  { id: 2, name: 'Armut', price: 45 },
  { id: 3, name: 'Kiraz', price: 90 },
];

export function List({ showEmpty = false }: { showEmpty?: boolean }) {
  return (
    <ul data-ekb3="@">
      {ITEMS.map((item) => (
        <li data-ekb3="@" key={item.id}>
          <span data-ekb3="@">{item.name}</span>
          {item.price > 40 && <b data-ekb3="@">pahalı</b>}
        </li>
      ))}
      {showEmpty ? <li data-ekb3="@">boş</li> : <li data-ekb3="@" className="footer">toplam {ITEMS.length}</li>}
    </ul>
  );
}
