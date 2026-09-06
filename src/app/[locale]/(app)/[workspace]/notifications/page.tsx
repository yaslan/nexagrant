import React from 'react';
import NotificationsClient from './client';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const isTr = locale === 'tr';

  const initialNotifications = isTr
    ? [
        {
          id: '1',
          title: 'Yeni Çağrı Eşleşmesi',
          desc: 'HORIZON-CL5-2026-D3 çağrısı profilinizle %92 oranında eşleşti.',
          time: '10 dakika önce',
          type: 'match',
          unread: true,
          link: `/${locale}/${workspace}/calls`,
        },
        {
          id: '2',
          title: 'Kanıt Belgesi Uyarısı',
          desc: 'SME Beyannamesi geçerlilik süresi 15 gün içinde sona eriyor. Lütfen güncelleyiniz.',
          time: '2 saat önce',
          type: 'warning',
          unread: true,
          link: `/${locale}/${workspace}/evidence`,
        },
        {
          id: '3',
          title: 'Aylık Kredi Tanımlandı',
          desc: 'Abonelik planınız kapsamında aylık 500 AI Kredisi hesabınıza yüklendi.',
          time: '1 gün önce',
          type: 'credit',
          unread: false,
          link: `/${locale}/${workspace}/settings/billing`,
        },
        {
          id: '4',
          title: 'Konsorsiyum Daveti Güncellemesi',
          desc: 'Fraunhofer Enstitüsü ile M4 etkileşim notu eklendi.',
          time: '3 gün önce',
          type: 'info',
          unread: false,
          link: `/${locale}/${workspace}/relationships`,
        },
      ]
    : [
        {
          id: '1',
          title: 'New Call Match',
          desc: 'HORIZON-CL5-2026-D3 matched 92% with your profile.',
          time: '10m ago',
          type: 'match',
          unread: true,
          link: `/${locale}/${workspace}/calls`,
        },
        {
          id: '2',
          title: 'Evidence Vault Alert',
          desc: 'SME Declaration expires in 15 days.',
          time: '2h ago',
          type: 'warning',
          unread: true,
          link: `/${locale}/${workspace}/evidence`,
        },
        {
          id: '3',
          title: 'Credits Allocated',
          desc: 'Monthly 500 AI Credits added to your workspace.',
          time: '1d ago',
          type: 'credit',
          unread: false,
          link: `/${locale}/${workspace}/settings/billing`,
        },
        {
          id: '4',
          title: 'Consortium Update',
          desc: 'M4 interaction note added with Fraunhofer.',
          time: '3d ago',
          type: 'info',
          unread: false,
          link: `/${locale}/${workspace}/relationships`,
        },
      ];

  return (
    <NotificationsClient
      initialNotifications={initialNotifications}
      locale={locale}
      workspace={workspace}
    />
  );
}
