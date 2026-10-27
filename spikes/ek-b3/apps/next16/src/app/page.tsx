import { ClientRoot } from '../fixture/ClientRoot';
import { ServerPart } from '../server/ServerPart';

export default function Page() {
  return (
    <main>
      <ServerPart />
      <ClientRoot />
    </main>
  );
}
