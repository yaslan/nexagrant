import { prisma } from '@/lib/db';
prisma.$queryRawUnsafe(`SELECT current_setting('TimeZone') tz, now()::date::text local_day`).then((r) => console.log('app tz', JSON.stringify(r), 'node TZ', Intl.DateTimeFormat().resolvedOptions().timeZone, new Date().toString())).finally(() => prisma.$disconnect());
