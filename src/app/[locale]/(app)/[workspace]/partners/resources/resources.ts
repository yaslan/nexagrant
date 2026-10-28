import {
  BriefcaseBusiness,
  CalendarDays,
  Database,
  GraduationCap,
  Handshake,
  IdCard,
  Landmark,
  Network,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * External EU portals for finding partners. Names and one-line descriptions live
 * in `PartnerResources.items.<id>` (tr.json + en.json); only the links are here.
 * Every URL was opened in a browser on 2026-10-27 (FO-176 report lists them).
 */
export interface PartnerResource {
  id: string;
  href: string;
  icon: LucideIcon;
}

export const PARTNER_RESOURCES: readonly PartnerResource[] = [
  { id: 'fundingTenders', href: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home', icon: Landmark },
  { id: 'horizonTr', href: 'https://ufukavrupa.org.tr/tr', icon: Rocket },
  { id: 'erasmusResults', href: 'https://erasmus-plus.ec.europa.eu/projects', icon: GraduationCap },
  { id: 'cordis', href: 'https://cordis.europa.eu/', icon: Database },
  { id: 'cost', href: 'https://www.cost.eu/', icon: Users },
  { id: 'een', href: 'https://een.ec.europa.eu/partnering-opportunities', icon: Handshake },
  { id: 'tubitakNetworks', href: 'https://ufukavrupa.org.tr/tr/aglara-uyelik-destegi', icon: Network },
  { id: 'b2match', href: 'https://www.b2match.com/', icon: CalendarDays },
  { id: 'linkedin', href: 'https://www.linkedin.com/', icon: BriefcaseBusiness },
  {
    id: 'participantRegister',
    href: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/participant-register',
    icon: IdCard,
  },
];
