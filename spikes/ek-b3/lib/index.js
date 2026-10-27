// node_modules'tan gelen bir kütüphane bileşeni gibi davranır: derlenmiş JS, react/jsx-runtime, source map yok.
import { jsx } from 'react/jsx-runtime';

export function LibBox({ title, children, ...rest }) {
  return jsx('div', { ...rest, className: 'lib-box', 'data-title': title, children });
}
