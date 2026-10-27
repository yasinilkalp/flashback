/**
 * Ayrıştırma (ablation) kipi: `flashback-devtools` yerine yalnızca rrweb kaydı.
 * rrweb, Flashback'in `Recorder.start()` içindeki seçenekleriyle birebir başlatılır (packages/flashback/src/recorder/recorder.ts);
 * panel, adım/ağ/konsol yakalama, alıcı yoklaması ve halka tampon YOKTUR. `?ablate=rrweb-size` verilirse her olay
 * Flashback'in `estimateEventBytes`'ı gibi JSON.stringify ile boyutlandırılır.
 * Böylece "kayıt açık" ek yükü rrweb çekirdeği ile Flashback eklentileri arasında ayrıştırılabilir.
 */
import { useEffect } from 'react';
import { record } from 'rrweb';

const ALL_INPUTS = {
  color: true, date: true, 'datetime-local': true, email: true, month: true, number: true, range: true, search: true,
  tel: true, text: true, time: true, url: true, week: true, textarea: true, select: true, password: true,
};

const sizeEvents = new URLSearchParams(location.search).get('ablate') === 'rrweb-size';

export function Flashback() {
  useEffect(() => {
    let events = [];
    let bytes = 0;
    const stop = record({
      emit: (e, isCheckout) => {
        if (isCheckout) events = [];
        events.push(e);
        if (sizeEvents) bytes += JSON.stringify(e).length * 2;
      },
      checkoutEveryNms: 30_000,
      blockSelector: '[data-flashback-block], [data-flashback-ui]',
      maskTextSelector: '[data-flashback-mask]',
      maskInputOptions: ALL_INPUTS,
      maskInputFn: (text) => text,
      recordAfter: 'DOMContentLoaded',
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
      sampling: { input: 'last' },
    });
    window.__benchShim = { get count() { return events.length; }, get bytes() { return bytes; }, get events() { return events; } };
    return () => stop?.();
  }, []);
  return null;
}

export function trackStore() {
  return () => {};
}
