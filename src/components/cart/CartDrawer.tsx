'use client';

import React, { useState } from 'react';
import { ShoppingBag, X, Trash2, ShieldCheck, Zap, ArrowRight, Check, Sparkles, CreditCard, Layers } from 'lucide-react';
import { useCart } from './CartContext';

interface CartDrawerProps {
  locale?: string;
  workspace?: string;
}

export function CartDrawer({ locale = 'tr', workspace = 'default' }: CartDrawerProps) {
  const {
    cartItems,
    isOpen,
    activeCoupon,
    discountPercent,
    closeCart,
    toggleCart,
    removeFromCart,
    clearCart,
    applyCoupon,
    getCartTotal,
  } = useCart();

  const isTr = locale === 'tr';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const { subtotal, discountAmount, total } = getCartTotal();
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const DISCOUNT_TIERS = [
    { id: 1, discount: 70, code: 'ILK5', labelTr: 'İlk 5 Abone (%70 İndirim)' },
    { id: 2, discount: 60, code: 'SONRAKI10', labelTr: 'Sonraki 10 (%60 İndirim)' },
    { id: 3, discount: 50, code: 'LANSMAN50', labelTr: 'Sonraki 20 (%50 İndirim)' },
    { id: 4, discount: 40, code: 'KURUCU40', labelTr: 'Sonraki 50 (%40 İndirim)' },
    { id: 5, discount: 30, code: 'GROWTH30', labelTr: 'Sonraki 100 (%30 İndirim)' },
    { id: 6, discount: 20, code: 'SCALE20', labelTr: 'Sonraki 200 (%20 İndirim)' },
    { id: 7, discount: 10, code: 'PROMO10', labelTr: 'Sonraki 500 (%10 İndirim)' },
  ];

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems,
          couponCode: activeCoupon,
          discountPercent: discountPercent,
          locale,
          workspace,
        }),
      });

      const data = await response.json();

      if (data?.url) {
        // Redirect to real Stripe Checkout page
        window.location.href = data.url;
      } else if (data?.demoMode || response.ok) {
        // Stripe credentials not configured, open interactive demo checkout confirmation
        setShowDemoModal(true);
        setIsSubmitting(false);
      } else {
        setErrorMessage(data?.error || (isTr ? 'Ödeme oturumu başlatılamadı.' : 'Checkout session error.'));
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || (isTr ? 'Ödeme servisine bağlanılamadı.' : 'Could not connect to payment service.'));
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
          aria-label="Sepeti Aç"
        >
          <ShoppingBag className="w-5 h-5 text-[#080d1a]" />
          <span className="font-sans font-extrabold tracking-tight text-[#080d1a]">{isTr ? 'Sepetim' : 'Cart'}</span>
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
                    <h2 className="text-base font-bold text-ink font-heading">
                      {isTr ? 'Sipariş Sepetiniz' : 'Your Shopping Cart'}
                    </h2>
                    <p className="text-[11px] text-muted font-mono">
                      {itemCount} {isTr ? 'ürün/hizmet seçildi' : 'items selected'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeCart}
                  className="p-2 rounded-lg text-muted hover:text-ink hover:bg-surface-hover transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List Scroll Area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Active Coupon Badge & Selector */}
                <div className="bg-ground border border-accent/30 rounded-xl p-3.5 text-xs font-mono">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-muted flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-accent" />
                      {isTr ? 'Aktif İndirim Katmanı:' : 'Active Tier Code:'}
                    </span>
                    <span className="bg-amber-500/20 border border-amber-500/40 text-amber-500 dark:text-amber-300 px-2 py-0.5 rounded font-extrabold">
                      {activeCoupon} (-%{discountPercent})
                    </span>
                  </div>

                  <select
                    value={activeCoupon}
                    onChange={(e) => {
                      const found = DISCOUNT_TIERS.find((t) => t.code === e.target.value);
                      if (found) applyCoupon(found.code, found.discount);
                    }}
                    className="w-full bg-surface border border-line text-ink text-[11px] rounded-lg p-2 font-mono focus:border-accent focus:outline-none"
                  >
                    {DISCOUNT_TIERS.map((tier) => (
                      <option key={tier.code} value={tier.code}>
                        {tier.code} — -%{tier.discount} ({isTr ? tier.labelTr : `${tier.discount}% off`})
                      </option>
                    ))}
                  </select>
                </div>

                {cartItems.length === 0 ? (
                  <div className="text-center py-16 text-muted space-y-3">
                    <ShoppingBag className="w-12 h-12 mx-auto text-muted/50 stroke-[1.5]" />
                    <p className="text-xs font-mono">
                      {isTr ? 'Sepetiniz henüz boş. Bir abonelik planı veya kredi paketi seçin.' : 'Your cart is empty. Select a plan or credit pack.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cartItems.map((item) => {
                      const itemDiscountRate = item.type === 'lifetime' ? 50 : (item.discountPercent ?? discountPercent);
                      const basePrice = item.originalPrice || item.price;
                      const discountedPrice = basePrice * (1 - itemDiscountRate / 100);

                      return (
                        <div
                          key={item.id}
                          className="bg-surface border border-line rounded-xl p-4 flex items-start justify-between gap-3 shadow-xs relative"
                        >
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-ink font-heading">{item.name}</span>
                              <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.2 rounded font-mono uppercase">
                                {item.type}
                              </span>
                            </div>

                            {item.subtitle && (
                              <p className="text-[11px] text-muted leading-snug">{item.subtitle}</p>
                            )}

                            <div className="flex items-baseline gap-2 pt-1 font-mono">
                              <span className="text-base font-extrabold text-accent">
                                ${(discountedPrice * item.quantity).toFixed(2)}
                              </span>
                              <span className="text-xs text-muted line-through">
                                ${(basePrice * item.quantity).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-amber-500 dark:text-amber-400 font-bold">
                                -%{itemDiscountRate}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1.5 text-muted hover:text-bad transition cursor-pointer shrink-0"
                            title={isTr ? 'Sil' : 'Remove'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 bg-bad/15 border border-bad/40 text-bad text-xs rounded-xl">
                    {errorMessage}
                  </div>
                )}
              </div>

              {/* Footer Summary & High-Contrast Checkout Button */}
              {cartItems.length > 0 && (
                <div className="p-5 sm:p-6 border-t border-line bg-surface-hover space-y-4">
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between text-muted">
                      <span>{isTr ? 'Ara Toplam (Liste Fiyatı)' : 'Subtotal'}</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-amber-500 dark:text-amber-400 font-bold">
                      <span>{isTr ? `Kademeli İndirim (${activeCoupon})` : `Tier Discount (${activeCoupon})`}</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm font-bold text-ink pt-2.5 border-t border-line font-mono">
                      <span>{isTr ? 'Toplam Ödenecek Tutar' : 'Total Due Today'}</span>
                      <span className="text-accent dark:text-cyan-300 font-mono font-black text-xl tracking-tight">${total.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] shadow-[0_0_25px_rgba(34,211,238,0.5)] hover:shadow-[0_0_35px_rgba(34,211,238,0.8)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 font-mono tracking-wide border border-cyan-300/60"
                  >
                    {isSubmitting ? (
                      <span className="animate-pulse text-[#080d1a] font-black">{isTr ? 'Stripe Bağlanıyor...' : 'Connecting Stripe...'}</span>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 text-[#080d1a] shrink-0" />
                        <span className="text-[#080d1a] font-black">{isTr ? 'Stripe İle Ödemeye Geç' : 'Proceed to Stripe Checkout'}</span>
                        <ArrowRight className="w-4 h-4 text-[#080d1a] shrink-0" />
                      </>
                    )}
                  </button>

                  <div className="flex justify-center items-center gap-4 text-[10px] text-muted font-mono">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      256-bit Stripe SSL
                    </span>
                    <span>·</span>
                    <span>14 Gün İade Garantisi</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DEMO STRIPE CHECKOUT MODAL ─── */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface border-2 border-accent rounded-2xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(34,211,238,0.3)] text-ink font-sans space-y-5">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-xs font-bold text-accent font-mono">
                <CreditCard className="w-4 h-4 text-accent" />
                <span>STRIPE CHECKOUT DEMO MODE</span>
              </div>
              <button onClick={() => setShowDemoModal(false)} className="text-muted hover:text-ink">
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-heading text-ink">
                {isTr ? 'Stripe Ödeme Simülasyonu' : 'Stripe Checkout Simulation'}
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                {isTr
                  ? 'Stripe API canlı/test anahtarları tanımlandığında kullanıcı doğrudan Stripe Checkout sayfasına yönlendirilir. Demo ortamında siparişiniz anında onaylanacaktır.'
                  : 'In demo mode, your cart purchase will be approved instantly.'}
              </p>
            </div>

            <div className="bg-ground border border-line rounded-xl p-4 space-y-2 font-mono text-xs">
              <div className="text-muted">{isTr ? 'Sipariş Özeti:' : 'Order Summary:'}</div>
              {cartItems.map((item) => (
                <div key={item.id} className="flex justify-between text-ink font-bold">
                  <span>{item.name}</span>
                  <span className="text-accent">${((item.originalPrice || item.price) * (1 - (item.discountPercent ?? discountPercent) / 100)).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-line flex justify-between text-accent font-black text-sm">
                <span>{isTr ? 'Toplam Tutar:' : 'Total:'}</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDemoModal(false);
                  clearCart();
                  closeCart();
                  window.location.href = `/${locale}/${workspace}/settings/billing?success=true`;
                }}
                className="w-full py-3.5 rounded-xl font-black text-xs bg-[#22d3ee] hover:bg-[#67e8f9] text-[#080d1a] transition flex items-center justify-center gap-2 cursor-pointer shadow-lg font-mono"
              >
                <span className="text-[#080d1a] font-black">✓ {isTr ? 'Test Ödemesini Tamamla (Demo)' : 'Complete Test Purchase'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
