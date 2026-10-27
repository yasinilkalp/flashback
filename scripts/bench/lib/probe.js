// Yalnızca kayıt AÇIK bench koşularında sayfaya eklenir: Flashback'in kullandığı rrweb örneğine ölçüm erişimi.
import { record } from 'rrweb';

window.__benchRecord = record;
// Checkout maliyet dökümü için (yalnızca inceleme adımında, tembel yüklenir).
window.__benchSnapshotLib = () => import('rrweb-snapshot');
