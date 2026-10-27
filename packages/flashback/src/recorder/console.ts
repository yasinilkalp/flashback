/** console.error/warn, yakalanmamış istisna ve işlenmemiş Promise reddi kaydı (FR-REC-06). */
import type { ConsoleEntry } from '@flashback/shared';
import { formatConsoleArgs } from '../serialize.js';
import { firstUserFrame } from '../source/stack.js';

export interface ConsoleRecord {
  seq: number;
  time: number;
  level: ConsoleEntry['level'];
  message: string;
  stack?: string;
  source?: string;
}

const MAX_ENTRIES = 1000;
const MAX_MESSAGE = 4000;

function frameSource(stack: string | undefined): string | undefined {
  const f = firstUserFrame(stack);
  return f ? `${f.url}:${f.line}:${f.column}` : undefined;
}

export class ConsoleCapture {
  private entries: ConsoleRecord[] = [];
  private seq = 0;
  private restore: Array<() => void> = [];

  private push(e: Omit<ConsoleRecord, 'seq'>) {
    this.entries.push({ ...e, message: e.message.slice(0, MAX_MESSAGE), seq: ++this.seq });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  install(win: Window & typeof globalThis = window): void {
    if (this.restore.length) return;
    for (const level of ['error', 'warn'] as const) {
      const original = win.console[level];
      const self = this;
      const patched = function (this: Console, ...args: unknown[]) {
        try {
          const err = args.find((a): a is Error => a instanceof Error);
          const callStack = new Error().stack;
          self.push({
            time: Date.now(),
            level,
            message: formatConsoleArgs(args),
            stack: err?.stack ?? callStack?.split('\n').slice(2).join('\n'),
            source: frameSource(err?.stack) ?? frameSource(callStack),
          });
        } catch {
          /* kayıt hatası uygulamayı etkilemez */
        }
        return original.apply(this, args);
      };
      win.console[level] = patched;
      this.restore.push(() => {
        if (win.console[level] === patched) win.console[level] = original;
      });
    }

    const onError = (ev: ErrorEvent) => {
      const err = ev.error as Error | undefined;
      this.push({
        time: Date.now(),
        level: 'uncaught',
        message: ev.message || String(err),
        stack: err?.stack,
        source: ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : frameSource(err?.stack),
      });
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason as unknown;
      const err = reason instanceof Error ? reason : undefined;
      this.push({
        time: Date.now(),
        level: 'unhandledrejection',
        message: err ? `${err.name}: ${err.message}` : formatConsoleArgs([reason]),
        stack: err?.stack,
        source: frameSource(err?.stack),
      });
    };
    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onRejection);
    this.restore.push(() => {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
    });
  }

  uninstall(): void {
    for (const r of this.restore.splice(0)) r();
  }

  prune(before: number): void {
    if (this.entries.length && this.entries[0].time < before) this.entries = this.entries.filter((e) => e.time >= before);
  }

  snapshot(): ConsoleRecord[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
