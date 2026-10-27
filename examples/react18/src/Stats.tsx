export function Stats({ count }: { count: number }) {
  return (
    <>
      <span data-testid="stat-a">Kalem: {count}</span>
      {' · '}
      <span data-testid="stat-b">Durum: açık</span>
    </>
  );
}
