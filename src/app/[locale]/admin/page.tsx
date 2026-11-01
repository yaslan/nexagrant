import { redirect } from 'next/navigation';

/**
 * /admin had no page of its own, so a platform admin who typed the address got
 * a bare 404. It now sends them to /admin/modules, the same entry the sidebar's
 * ADMIN link uses (TASK-MURBM059EDSQY).
 *
 * The platform-admin check stays in ./layout.tsx: its notFound() answers before
 * this redirect, so anyone else still gets a 404 with no Location header.
 * tests/e2e/admin-root-redirect.spec.ts holds that in place.
 */
export default async function AdminIndexPage({
  params,
}: {
  params: Promise<{ locale?: string }>;
}) {
  const { locale = 'tr' } = await params;
  redirect(`/${locale}/admin/modules`);
}
