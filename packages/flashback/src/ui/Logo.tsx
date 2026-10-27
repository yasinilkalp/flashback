/** Flashback işareti: geri dönen ok (geçmişe dönüş) ve içinde şimşek (flaş). Kaynak: site/brand/flashback-mark.svg */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#ffd23f" />
      <path d="M10.54 9.49A8.5 8.5 0 1 1 7.5 16" fill="none" stroke="#0d111c" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M9.3 10.6 13.75 10.2 10.35 6.15z" fill="#0d111c" stroke="#0d111c" strokeLinejoin="round" />
      <path d="M17.3 10.2 13.2 16.6h3.1l-.9 5.2 4.3-6.8h-3.2z" fill="#0d111c" stroke="#0d111c" strokeWidth=".6" strokeLinejoin="round" />
    </svg>
  );
}
