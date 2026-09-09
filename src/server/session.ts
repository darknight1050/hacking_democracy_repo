import { requireAccount } from './accounts';
/** Resolve ballot ownership from an authenticated account, never from request data. */
export async function participant() {
  return (await requireAccount()).id;
}
