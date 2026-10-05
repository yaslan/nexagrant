'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShoppingBag, X, Trash2, ShieldCheck, ArrowRight, CreditCard, Layers } from 'lucide-react';
import { useCart } from './CartContext';
import { formatMoney } from '@/lib/money';
import { getPublicRoute } from '@/lib/routes';
import { errorMessage as toErrorMessage } from '@/lib/errors';

interface CartDrawerProps {
  locale?: string;
  workspace?: string;
}

/** The amounts checkout answered with — the figures actually being charged. */
interface CheckoutQuote {
  currency: string;
  totalMinor: number;
  activeTier?: { code: string; percentOff: number };
  lines: Array<{
    sku: string;
    name: string;
    quantity: number;
    amountMinor: number;
    totalMinor: number;
    percentOff: number;
    campaignCode: string;
  }>;
}

export function CartDrawer({ locale = 'tr', workspace = 'default' }: CartDrawerProps) {
  const {
    isOpen,
    activeTier,
    closeCart,
    toggleCart,
    removeFromCart,
    clearCart,
    getCartTotal,
  } = useCart();

  const router = useRouter();
  const t = useTranslations('billingPanels.cart');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);

  const { subtotalMinor, discountMinor, totalMinor, currency, lines, measured, unavailable } =
    getCartTotal();
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const money = (amountMinor: number, amountCurrency = currency) =>
    formatMoney(amountMinor, amountCurrency, locale);

  const handleCheckout = async () => {
    if (lines.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Which line, how many, how often. Nothing about price: the amount is
        // the catalogue's and the tier is the server's.
        body: JSON.stringify({
          items: lines.map((line) => ({
            sku: line.sku,
            quantity: line.quantity,
            billingCycle: line.billingCycle,
          })),
          couponCode: activeTier.code,
          locale,
          workspace,
        }),
      });

      // A signed-out visitor cannot start a payment: since TASK-MTUI9F5YBHTDC the
      // route answers 401 instead of inventing a tenant for the charge. Printing
      // the server's word ("Unauthorized") into a Turkish drawer would be a dead
      // end, so the click does what the visitor meant by it — go and sign in, then
      // come back to this page. The cart lives in localStorage, so it survives the
      // round trip and the visitor returns to the same lines.
      if (response.status === 401) {
        const returnTo =
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : getPublicRoute('pricing', locale);
        setIsSubmitting(false);
        closeCart();
        router.push(`${getPublicRoute('login', locale)}?callbackUrl=${encodeURIComponent(returnTo)}`);
        return;
      }

      const data = await response.json();

      if (data?.url) {
        // Live Stripe: the session was created from the same catalogue amounts.
        window.location.assign(data.url);
        return;
      }

      if (response.ok) {
        // Demo mode: show the server's own figures, not a second local sum.
        setQuote({
          currency: data.currency ?? currency,
          totalMinor: data.totalMinor ?? 0,
          activeTier: data.activeTier,
          lines: Array.isArray(data.lines) ? data.lines : [],
        });
        setIsSubmitting(false);
        return;
      }

      setErrorMessage(typeof data?.error === 'string' ? data.error : t('checkoutFailed'));
      setIsSubmitting(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err, t('checkoutUnreachable')));
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* ─── FLOATING CART TRIGGER BUTTON (Only shown when cart is not empty) ─── */}
      {itemCount > 0 && (
        <button
          onClick={toggleCart}
          className="fixed bottom-6 right-6 z-40 bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] px-4 py-3.5 rounded-full shadow-[0_0_25px_rgba(34,211,238,0.5)] hover:shadow-[0_0_35px_rgba(34,211,238,0.8)] transition-all transform hover:scale-105 flex items-center gap-2.5 font-black text-xs cursor-pointer border border-cyan-300/40 animate-in fade-in zoom-in-95 duration-200"
          aria-label={t('open')}
        >
          <ShoppingBag className="w-5 h-5 text-[#080d1a]" />
          <span className="font-sans font-extrabold tracking-tight text-[#080d1a]">{t('myCart')}</span>
          <span className="bg-[#080d1a] text-[#22d3ee] text-[11px] font-mono font-black px-2 py-0.5 rounded-full border border-cyan-400">
            {itemCount}
          </span>
        </button>
      )}

      {/* ─── SLIDE-OVER OVERLAY ─── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden backdrop-blur-sm bg-slate-950/70 transition-opacity animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={closeCart} />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-surface border-l border-line text-ink shadow-2xl flex flex-col justify-between font-sans">
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-line flex items-center justify-between bg-surface-hover/90 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-accent/15 border border-accent/30 text-accent">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-ink font-heading">{t('title')}</h2>
                    <p className="text-[11px] text-muted font-mono">
                      {t('itemCount', { count: itemCount })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeCart}
                  className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-hover transition cursor-pointer"
                  aria-label={t('close')}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List Scroll Area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Active campaign — shown, never chosen here. */}
                <div className="bg-ground border border-accent/30 rounded-xl p-3.5 text-xs font-mono space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-accent" />
                      {t('activeTier')}
                    </span>
                    <span className="bg-amber-500/20 border border-amber-500/40 text-amber-500 dark:text-amber-300 px-2 py-0.5 rounded font-extrabold">
                      {activeTier.code} (-{activeTier.percentOff}%)
                    </span>
                  </div>
                  <p className="text-[10px] text-muted leading-snug">{t('tierIsServerSide')}</p>
                </div>

                {lines.length === 0 ? (
                  <div className="text-center py-16 text-muted space-y-3">
                    <ShoppingBag className="w-12 h-12 mx-auto text-muted/50 stroke-[1.5]" />
                    <p className="text-xs font-mono">{t('empty')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lines.map((line) => (
                      <div
                        key={line.sku}
                        className="bg-surface border border-line rounded-xl p-4 flex items-start justify-between gap-3 shadow-xs relative"
                      >
                        <div className="space-y-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-ink font-heading">{line.name}</span>
                            <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.2 rounded font-mono uppercase">
                              {line.type}
                            </span>
                          </div>

                          {line.subtitle && (
                            <p className="text-[11px] text-muted leading-snug">{line.subtitle}</p>
                          )}

                          {/*
                            The amount is the server's or it is absent. A line
                            whose price has not been quoted yet shows a dash
                            rather than a number computed in this browser.
                          */}
                          {line.priced ? (
                            <div className="flex items-baseline gap-2 pt-1 font-mono">
                              <span className="text-base font-extrabold text-accent">
                                {money(line.priced.totalMinor, line.priced.currency)}
                              </span>
                              <span className="text-xs text-muted line-through">
                                {money(
                                  line.priced.listAmountMinor * line.priced.quantity,
                                  line.priced.currency
                                )}
                              </span>
                              <span className="text-[10px] text-amber-500 dark:text-amber-400 font-bold">
                                -{line.priced.percentOff}%
                              </span>
                            </div>
                          ) : (
                            <div className="pt-1 font-mono text-xs text-muted">{t('pricePending')}</div>
                          )}
                        </div>

                        <button
                          onClick={() => removeFromCart(line.sku)}
                          className="p-1.5 text-muted hover:text-bad transition cursor-pointer shrink-0"
                          title={t('remove')}
                          aria-label={t('remove')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {unavailable.length > 0 && (
                  <div
                    role="status"
                    data-testid="cart-unavailable"
                    className="p-3 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs rounded-xl"
                  >
                    {t('unavailableLines', { skus: unavailable.join(', ') })}
                  </div>
                )}

                {errorMessage && (
                  <div role="alert" className="p-3 bg-bad/15 border border-bad/40 text-bad text-xs rounded-xl">
                    {errorMessage}
                  </div>
                )}
              </div>

              {/* Footer Summary & High-Contrast Checkout Button */}
              {lines.length > 0 && (
                <div className="p-5 sm:p-6 border-t border-line bg-surface-hover space-y-4">
                  {!measured && (
                    <div
                      role="status"
                      data-testid="cart-total-unmeasured"
                      className="p-3 bg-amber-500/10 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-xs rounded-xl"
                    >
                      {t('totalUnavailable')}
                    </div>
                  )}
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-muted">
                      <span>{t('subtotal')}</span>
                      <span>{measured ? money(subtotalMinor) : '—'}</span>
                    </div>

                    <div className="flex justify-between text-amber-500 dark:text-amber-400 font-bold">
                      <span>{t('tierDiscount', { code: activeTier.code })}</span>
                      <span>{measured ? `-${money(discountMinor)}` : '—'}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm font-bold text-ink pt-2.5 border-t border-line font-mono">
                      <span>{t('totalDue')}</span>
                      <span
                        data-testid="cart-total"
                        className="text-accent dark:text-cyan-300 font-mono font-black text-xl tracking-tight"
                      >
                        {measured ? money(totalMinor) : '—'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={isSubmitting || !measured}
                    className="w-full py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] shadow-[0_0_25px_rgba(34,211,238,0.5)] hover:shadow-[0_0_35px_rgba(34,211,238,0.8)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 font-mono tracking-wide border border-cyan-300/60"
                  >
                    {isSubmitting ? (
                      <span className="animate-pulse text-[#080d1a] font-black">{t('connecting')}</span>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 text-[#080d1a] shrink-0" />
                        <span className="text-[#080d1a] font-black">{t('proceed')}</span>
                        <ArrowRight className="w-4 h-4 text-[#080d1a] shrink-0" />
                      </>
                    )}
                  </button>

                  <div className="flex justify-center items-center gap-4 text-[10px] text-muted font-mono">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      {t('sslNote')}
                    </span>
                    <span>·</span>
                    <span>{t('refundNote')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DEMO STRIPE CHECKOUT MODAL — renders the SERVER's amounts ─── */}
      {quote && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface border-2 border-accent rounded-2xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(34,211,238,0.3)] text-ink font-sans space-y-5">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-xs font-bold text-accent font-mono">
                <CreditCard className="w-4 h-4 text-accent" />
                <span>{t('demoBadge')}</span>
              </div>
              <button
                onClick={() => setQuote(null)}
                className="text-muted hover:text-ink"
                aria-label={t('close')}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-heading text-ink">{t('demoTitle')}</h3>
              <p className="text-xs text-muted leading-relaxed">{t('demoBody')}</p>
            </div>

            <div className="bg-ground border border-line rounded-xl p-4 space-y-2 font-mono text-xs">
              <div className="text-muted">{t('orderSummary')}</div>
              {quote.lines.map((line) => (
                <div key={line.sku} className="flex justify-between text-ink font-bold">
                  <span>{line.name}</span>
                  <span className="text-accent">{money(line.totalMinor, quote.currency)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-line flex justify-between text-accent font-black text-sm">
                <span>{t('serverTotal')}</span>
                <span data-testid="checkout-total">{money(quote.totalMinor, quote.currency)}</span>
              </div>
              {quote.activeTier && (
                <div className="text-[10px] text-muted">
                  {t('pricedUnder', {
                    code: quote.activeTier.code,
                    percent: quote.activeTier.percentOff,
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setQuote(null);
                  clearCart();
                  closeCart();
                  router.push(`/${locale}/${workspace}/settings/billing?success=true`);
                }}
                className="w-full py-3.5 rounded-xl font-black text-xs bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] transition flex items-center justify-center gap-2 cursor-pointer shadow-lg font-mono"
              >
                <span className="text-[#080d1a] font-black">✓ {t('completeDemo')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
