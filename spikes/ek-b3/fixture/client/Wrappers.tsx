'use client';
import { Component, forwardRef, memo, type ReactNode } from 'react';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-ekb3="@" className="card">
      <h3 data-ekb3="@">{title}</h3>
      {children}
    </div>
  );
}

const Fancy = forwardRef<HTMLButtonElement, { label: string }>(function Fancy({ label }, ref) {
  return <button data-ekb3="@" ref={ref} type="button">{label}</button>;
});

const Pure = memo(function Pure({ n }: { n: number }) {
  return <output data-ekb3="@">{n * 2}</output>;
});

class Legacy extends Component<{ text: string }> {
  render() {
    return <blockquote data-ekb3="@">{this.props.text}</blockquote>;
  }
}

function RenderProp({ render }: { render: (v: string) => ReactNode }) {
  return <div data-ekb3="@">{render('render-prop')}</div>;
}

export function Wrappers() {
  return (
    <Card title="Sarmalayıcılar">
      <p data-ekb3="@">Card'a children olarak geçen paragraf</p>
      <Fancy label="forwardRef" />
      <Pure n={21} />
      <Legacy text="sınıf bileşeni" />
      <RenderProp render={(v) => <code data-ekb3="@">{v}</code>} />
    </Card>
  );
}
