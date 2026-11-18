/**
 * NG-57 — the public NexaGrant catalogue for a server component (the pricing page). Not a
 * server action: it needs no session and takes no input, so there is nothing for a browser
 * to call. Platform data, read through the shared client (RLS platform_read).
 */
import { prisma } from '@/lib/db';
import { readNgCatalog } from './repository';
import { catalogView, type NgCatalogView } from './view';

export async function getNgCatalogView(): Promise<NgCatalogView> {
  return catalogView(await readNgCatalog(prisma));
}
