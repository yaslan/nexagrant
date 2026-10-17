import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';

/**
 * The one shell every public page shares (FO-68): the header and footer live
 * here, never in a page, so no public page goes out without them and none gets
 * two. The signed-in shells — `(app)` and `admin` — sit outside this group and
 * keep their own chrome. The 404 page is above `[locale]` and renders the same
 * pair itself (src/app/not-found.tsx).
 *
 * Both bars are hidden in print: the readiness report (fon-hazirlik) is meant
 * to be printed as a clean page.
 */
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      <div className="print:hidden contents">
        <PublicNavbar locale={locale} />
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
      <div className="print:hidden">
        <PublicFooter locale={locale} />
      </div>
    </div>
  );
}
