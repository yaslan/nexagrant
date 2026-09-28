'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Store,
  Key,
  Plus,
  Award,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  X
} from 'lucide-react';
import { createMarketplaceListing, orderMarketplaceService, generateApiKey } from '@/modules/marketplace/server/actions';
import type { MarketplaceOrderRefusal } from '@/modules/marketplace/server/orders';
import { formatMoney } from '@/lib/money';

export interface ListingItem {
  id: string;
  kind: 'consultancy' | 'patent_license' | 'service' | string;
  title: string;
  description: string;
  price?: string | null;
  status: string;
  verifiedReviewer?: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date | string;
}

interface MarketplaceClientProps {
  tenantId: string;
  userId: string;
  listings: ListingItem[];
  apiKeys: ApiKeyItem[];
}

/** The order `orderMarketplaceService` returns, as the confirmation modal reads it. */
interface ConfirmedOrder {
  id: string;
  totalAmountMinor: number;
  currency: string;
}

const REFUSAL_KEY: Record<MarketplaceOrderRefusal, string> = {
  LISTING_NOT_FOUND: 'orderModal.refused.notFound',
  OWN_LISTING: 'orderModal.refused.ownListing',
  PRICE_NOT_FIXED: 'orderModal.refused.priceNotFixed',
};

export function MarketplaceClient({
  tenantId: _tenantId,
  userId: _userId,
  listings: initialListings,
  apiKeys: initialApiKeys,
}: MarketplaceClientProps) {
  const t = useTranslations('m8');
  const locale = useLocale();
  const [listings, setListings] = useState<ListingItem[]>(initialListings);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(initialApiKeys);
  const [activeTab, setActiveTab] = useState<'listings' | 'post' | 'apikeys'>('listings');
  const [kindFilter, setKindFilter] = useState<'ALL' | 'consultancy' | 'patent_license' | 'service'>('ALL');

  // Form states
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('consultancy');
  const [price, setPrice] = useState('€1,500');
  const [description, setDescription] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // API Key Form states
  const [keyName, setKeyName] = useState('');
  const [newCreatedKey, setNewCreatedKey] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Order modal state
  const [selectedOrderListing, setSelectedOrderListing] = useState<ListingItem | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState<ConfirmedOrder | null>(null);
  const [orderRefusal, setOrderRefusal] = useState<MarketplaceOrderRefusal | null>(null);

  const handlePublishListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsPublishing(true);
    try {
      // The action stamps the session tenant itself.
      const res = await createMarketplaceListing({
        kind,
        title: title.trim(),
        description: description.trim(),
        price: price.trim(),
      });

      const newListing: ListingItem = {
        id: res.id || `list-${Date.now()}`,
        kind,
        title: title.trim(),
        description: description.trim(),
        price: price.trim(),
        status: 'active',
        verifiedReviewer: kind === 'consultancy',
      };

      setListings((prev) => [newListing, ...prev]);
      setTitle('');
      setDescription('');
      setActiveTab('listings');
    } catch (err) {
      console.error('Error creating listing:', err);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setIsGeneratingKey(true);
    try {
      const res = await generateApiKey({
        name: keyName.trim(),
      });

      if (res.rawKey) {
        setNewCreatedKey(res.rawKey);
        setApiKeys((prev) => [
          {
            id: res.apiKeyRecord.id,
            name: keyName.trim(),
            prefix: res.apiKeyRecord.prefix,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setKeyName('');
      }
    } catch (err) {
      console.error('Error generating API key:', err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleOrderService = async (listing: ListingItem) => {
    setIsOrdering(true);
    try {
      // No price is sent: the server reads it from the listing.
      const res = await orderMarketplaceService({ listingId: listing.id });

      if (res.success) {
        setOrderRefusal(null);
        setOrderConfirmed(res.order);
      } else {
        setOrderRefusal(res.code);
      }
    } catch (err) {
      console.error('Error ordering service:', err);
    } finally {
      setIsOrdering(false);
    }
  };

  const filteredListings = listings.filter((l) => {
    if (kindFilter === 'ALL') return true;
    return l.kind === kindFilter;
  });

  const getKindBadge = (k: string) => {
    switch (k) {
      case 'consultancy':
        return <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">{t('badge.consultancy')}</span>;
      case 'patent_license':
        return <span className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">{t('badge.patentLicense')}</span>;
      case 'service':
        return <span className="bg-accent/15 text-accent border border-accent/30 px-2.5 py-0.5 rounded-full font-bold text-[11px]">{t('badge.service')}</span>;
      default:
        return <span className="bg-surface-hover text-ink border border-border px-2.5 py-0.5 rounded-full font-bold text-[11px]">{k}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────── HEADER BANNER ──────────────────────── */}
      <div className="bg-surface rounded-2xl p-6 text-ink shadow-sm border border-border relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-accent font-semibold tracking-wider uppercase mb-1">
              <Store className="w-4 h-4 text-accent" />
              <span>{t('header.moduleLabel')}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-heading text-ink">
              {t('header.title')}
            </h1>
            <p className="text-muted text-xs md:text-sm mt-1 max-w-2xl">
              {t('header.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs bg-accent/10 border border-accent/20 text-accent-ink px-3.5 py-1.5 rounded-full font-mono font-bold">
              {t('header.apiFeeBadge')}
            </span>
          </div>
        </div>

        {/* Metric Cards Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border text-xs">
          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.metrics.activeListings')}</span>
            <span className="text-xl font-bold text-ink font-mono mt-0.5 block">
              {listings.length} <span className="text-xs text-muted">{t('header.metrics.listingUnit')}</span>
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.metrics.verifiedReviewer')}</span>
            <span className="text-xl font-bold text-emerald-500 font-mono mt-0.5 block flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t('header.metrics.verifiedBadge')}
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.metrics.commissionRate')}</span>
            <span className="text-xl font-bold text-accent font-mono mt-0.5 block">
              %10 <span className="text-xs text-muted">{t('header.metrics.commissionUnit')}</span>
            </span>
          </div>

          <div className="bg-ground border border-border rounded-xl p-3.5">
            <span className="text-muted block text-[11px]">{t('header.metrics.activeApiKeys')}</span>
            <span className="text-xl font-bold text-purple-400 font-mono mt-0.5 block">
              {apiKeys.length} <span className="text-xs text-muted">{t('header.metrics.keyUnit')}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────── NAVIGATION TABS ──────────────────────── */}
      <div className="flex border-b border-border gap-2">
        <button
          onClick={() => setActiveTab('listings')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'listings'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>{t('tabs.listings', { count: listings.length })}</span>
        </button>

        <button
          onClick={() => setActiveTab('post')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'post'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>{t('tabs.post')}</span>
        </button>

        <button
          onClick={() => setActiveTab('apikeys')}
          className={`px-4 py-2.5 font-semibold text-xs rounded-t-xl transition flex items-center gap-2 border-b-2 -mb-px ${
            activeTab === 'apikeys'
              ? 'border-accent text-accent-ink bg-accent/10 font-bold'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-hover'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>{t('tabs.apikeys')}</span>
        </button>
      </div>

      {/* ──────────────────────── TAB 1: MARKETPLACE LISTINGS ──────────────────────── */}
      {activeTab === 'listings' && (
        <div className="space-y-6">
          {/* Category Filter Buttons */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold text-muted mr-2">{t('filter.label')}</span>
            <button
              onClick={() => setKindFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border ${
                kindFilter === 'ALL'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-border text-ink-2 hover:bg-surface-hover'
              }`}
            >
              {t('filter.all', { count: listings.length })}
            </button>

            <button
              onClick={() => setKindFilter('consultancy')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border ${
                kindFilter === 'consultancy'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20'
              }`}
            >
              {t('filter.consultancy')}
            </button>

            <button
              onClick={() => setKindFilter('patent_license')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border ${
                kindFilter === 'patent_license'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}
            >
              {t('filter.patentLicense')}
            </button>

            <button
              onClick={() => setKindFilter('service')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition border ${
                kindFilter === 'service'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-accent/10 text-accent border-accent/20 hover:bg-accent/20'
              }`}
            >
              {t('filter.service')}
            </button>
          </div>

          {/* Listings Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredListings.map((item) => (
              <div
                key={item.id}
                className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between hover:border-accent/40 transition"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      {getKindBadge(item.kind)}
                      <h3 className="font-bold text-base text-ink mt-2">{item.title}</h3>
                    </div>
                    <span className="font-mono font-bold text-emerald-500 bg-emerald-500/15 px-3 py-1 rounded-xl text-xs border border-emerald-500/30 shrink-0">
                      {item.price || t('listing.priceTbd')}
                    </span>
                  </div>

                  <p className="text-xs text-ink-2 leading-relaxed">{item.description}</p>

                  {item.kind === 'consultancy' && (
                    <div className="inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 px-3 py-1 rounded-lg text-xs font-semibold">
                      <Award className="w-4 h-4 text-accent" />
                      <span>{t('listing.verifiedBadge')}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex justify-end">
                  <button
                    onClick={() => {
                      setOrderRefusal(null);
                      setSelectedOrderListing(item);
                    }}
                    className="px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl font-semibold text-xs transition shadow-2xs flex items-center gap-1.5"
                  >
                    <span>{t('listing.orderButton')}</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──────────────────────── TAB 2: POST SERVICE LISTING ──────────────────────── */}
      {activeTab === 'post' && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Plus className="w-5 h-5 text-accent" />
              <span>{t('postForm.heading')}</span>
            </h2>
            <p className="text-muted text-xs mt-1">
              {t('postForm.subtitle')}
            </p>
          </div>

          <form onSubmit={handlePublishListing} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-ink-2 block mb-1">{t('postForm.titleLabel')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('postForm.titlePlaceholder')}
                required
                className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground font-semibold text-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-semibold text-ink-2 block mb-1">{t('postForm.typeLabel')}</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
                >
                  <option value="consultancy">{t('postForm.typeConsultancy')}</option>
                  <option value="patent_license">{t('postForm.typePatentLicense')}</option>
                  <option value="service">{t('postForm.typeService')}</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-ink-2 block mb-1">{t('postForm.priceLabel')}</label>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={t('postForm.pricePlaceholder')}
                  className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground font-mono font-bold text-ink"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-ink-2 block mb-1">{t('postForm.detailsLabel')}</label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('postForm.detailsPlaceholder')}
                required
                className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-accent focus:outline-hidden bg-ground text-ink"
              />
            </div>

            <div className="bg-ground p-3.5 rounded-xl border border-border text-[11px] text-ink-2 space-y-1">
              <span className="font-bold text-ink">{t('postForm.commissionNoteLabel')}</span>
              <p>{t('postForm.commissionNoteBody')}</p>
            </div>

            <button
              type="submit"
              disabled={isPublishing}
              className="w-full bg-accent hover:opacity-90 text-white font-bold py-2.5 rounded-xl transition shadow-2xs text-xs"
            >
              {isPublishing ? t('postForm.publishing') : t('postForm.submit')}
            </button>
          </form>
        </div>
      )}

      {/* ──────────────────────── TAB 3: PARTNER API KEYS ──────────────────────── */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Key Generator Form (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-surface border border-border rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Key className="w-4 h-4 text-purple-400" />
                  <h3 className="font-bold text-sm text-ink">{t('apiKeys.generateHeading')}</h3>
                </div>

                <form onSubmit={handleGenerateKey} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-ink-2 block mb-1">{t('apiKeys.nameLabel')}</label>
                    <input
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder={t('apiKeys.namePlaceholder')}
                      required
                      className="w-full border border-border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden bg-ground text-ink"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isGeneratingKey}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-xl transition shadow-2xs text-xs"
                  >
                    {isGeneratingKey ? t('apiKeys.generating') : t('apiKeys.generateButton')}
                  </button>
                </form>

                {newCreatedKey && (
                  <div className="bg-purple-950 text-purple-100 p-3.5 rounded-xl border border-purple-800 space-y-2 text-xs">
                    <span className="font-bold text-amber-400 block text-[11px]">{t('apiKeys.newKeyWarning')}</span>
                    <div className="flex items-center justify-between font-mono bg-black/50 p-2 rounded-lg text-[11px] text-purple-300 break-all">
                      <span>{newCreatedKey}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(newCreatedKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="p-1 text-purple-300 hover:text-white"
                      >
                        {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: API Keys List & Documentation (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="font-bold text-sm text-ink">{t('apiKeys.listHeading', { count: apiKeys.length })}</h3>

              <div className="bg-surface border border-border rounded-2xl shadow-2xs overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                  <thead>
                    <tr className="bg-ground border-b border-border text-ink-2 font-bold uppercase tracking-wider text-[11px]">
                      <th className="p-3.5">{t('apiKeys.tableName')}</th>
                      <th className="p-3.5">{t('apiKeys.tablePrefix')}</th>
                      <th className="p-3.5">{t('apiKeys.tableCreated')}</th>
                      <th className="p-3.5 text-right">{t('apiKeys.tableStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-ground transition-colors">
                        <td className="p-3.5 font-bold text-ink">{key.name}</td>
                        <td className="p-3.5 font-mono text-ink-2">{key.prefix}...</td>
                        <td className="p-3.5 font-mono text-muted">
                          {new Date(key.createdAt).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="p-3.5 text-right">
                          <span className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[11px] font-bold">
                            {t('apiKeys.statusActive')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── ORDER SERVICE MODAL ──────────────── */}
      {selectedOrderListing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-border">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-ink">{t('orderModal.heading')}</h3>
              <button
                onClick={() => {
                  setSelectedOrderListing(null);
                  setOrderConfirmed(null);
                  setOrderRefusal(null);
                }}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {orderConfirmed ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-ink p-4 rounded-xl space-y-2 text-xs">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                <h4 className="font-bold text-sm text-emerald-500">{t('orderModal.confirmedHeading')}</h4>
                <p className="font-mono text-[11px] text-ink-2">{t('orderModal.orderNumber', { id: orderConfirmed.id })}</p>
                <p className="text-ink-2">{t('orderModal.totalAmount', {
                    amount: formatMoney(orderConfirmed.totalAmountMinor, orderConfirmed.currency, locale),
                  })}</p>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="bg-ground p-3.5 rounded-xl border border-border space-y-1">
                  <span className="text-muted block text-[11px]">{t('orderModal.selectedService')}</span>
                  <h4 className="font-bold text-ink">{selectedOrderListing.title}</h4>
                  <p className="font-mono text-emerald-500 font-bold text-sm">{selectedOrderListing.price}</p>
                </div>

                <div className="bg-accent/10 border border-accent/20 p-3 rounded-xl text-accent-ink text-[11px]">
                  <span>{t('orderModal.escrowNote')}</span>
                </div>

                {orderRefusal && (
                  <div role="alert" className="bg-red-500/10 border border-red-500/40 p-3 rounded-xl text-red-700 text-[11px]">
                    {t(REFUSAL_KEY[orderRefusal])}
                  </div>
                )}

                <button
                  onClick={() => handleOrderService(selectedOrderListing)}
                  disabled={isOrdering}
                  className="w-full bg-accent hover:opacity-90 text-white font-bold py-2.5 rounded-xl transition text-xs shadow-2xs"
                >
                  {isOrdering ? t('orderModal.ordering') : t('orderModal.confirmButton')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
