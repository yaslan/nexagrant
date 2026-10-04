import { notFound } from 'next/navigation';
import NotificationsClient from './client';

interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'match' | 'warning' | 'credit' | 'info';
  unread: boolean;
  link?: string;
}

interface PageProps {
  params: Promise<{
    locale: string;
    workspace: string;
  }>;
}

// Mock notifications data for now - in production, these would come from the database
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Match Found',
    desc: 'A new opportunity matching your profile has been identified',
    time: '1h ago',
    type: 'match',
    unread: true,
  },
  {
    id: 'n2',
    title: 'System Alert',
    desc: 'Your workspace quota is about to reach 80% capacity',
    time: '2h ago',
    type: 'warning',
    unread: true,
  },
  {
    id: 'n3',
    title: 'Credit Update',
    desc: 'You have received 50 additional credits from your subscription renewal',
    time: '1d ago',
    type: 'credit',
    unread: false,
  },
];

export const metadata = {
  title: 'Notifications',
  description: 'View your workspace notifications',
};

export default async function NotificationsPage({ params }: PageProps) {
  const { locale, workspace } = await params;

  // Validate workspace exists (in production, fetch from database)
  if (!workspace) {
    notFound();
  }

  return (
    <div className="p-6">
      <NotificationsClient
        initialNotifications={MOCK_NOTIFICATIONS}
        locale={locale}
        workspace={workspace}
      />
    </div>
  );
}
