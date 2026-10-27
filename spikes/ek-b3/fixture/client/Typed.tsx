'use client';
import { useReducer } from 'react';

export enum Tone {
  Info = 'info',
  Warn = 'warn',
}

interface Row<T> {
  id: string;
  value: T;
}

type Action = { type: 'add' } | { type: 'reset' };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case 'add':
      return state + 1;
    case 'reset':
      return 0;
  }
}

function Cell<T extends string | number>({ row }: { row: Row<T> }) {
  return <td data-ekb3="@">{String(row.value)}</td>;
}

export function Typed({ tone = Tone.Info }: { tone?: Tone }) {
  const [n, dispatch] = useReducer(reducer, 0);
  const rows = [
    { id: 'a', value: 1 },
    { id: 'b', value: 'iki' },
  ] satisfies Row<string | number>[];
  return (
    <table data-ekb3="@" data-tone={tone}>
      <tbody data-ekb3="@">
        {rows.map((r) => (
          <tr data-ekb3="@" key={r.id}>
            <Cell row={r} />
          </tr>
        ))}
        <tr data-ekb3="@">
          <td data-ekb3="@">
            <button data-ekb3="@" type="button" onClick={() => dispatch({ type: 'add' })}>{n}</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
