'use client';

/**
 * EK-B3 sınır durumu: React 19, ~1 sn içinde 10 000'den fazla öğe oluşturulunca gerçek sahip yığını yerine paylaşılan
 * `UnknownOwner` yığınını verir. Bu sayfadaki işaretli öğenin kendi JSX konumu bilinemez; Flashback yanlış satır
 * vermemeli (ata öğe ya da resolved:false).
 */
export default function OwnerLimit() {
  const many = Array.from({ length: 10_500 }, (_, i) => <span key={i} />);
  return (
    <main>
      <div hidden>{many}</div>
      <p data-testid="after-owner-limit">Sınırdan sonra oluşturulan öğe</p>
    </main>
  );
}
