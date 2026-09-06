// Resilient In-Memory Store for K5 Pipeline & Opportunity Management

export interface NoteEntry {
  id: string;
  text: string;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
}

export interface OpportunityItem {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  topicId?: string | null;
  intendedRole?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
  status: 'ACTIVE' | 'WITHDRAWN' | 'SUBMITTED' | 'FUNDED' | 'REJECTED';
  g0Score: number;
  notes?: string | null;
  notesList?: NoteEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export const WORKSPACE_MEMBERS = [
  { id: 'usr-1', name: 'Ahmet Yılmaz', role: 'Pipeline Manager', avatar: '👨‍💼' },
  { id: 'usr-2', name: 'Ayşe Kaya', role: 'Kıdemli Yazar', avatar: '👩‍💻' },
  { id: 'usr-3', name: 'Mehmet Demir', role: 'Proje Ofisi Yöneticisi', avatar: '👨‍🔬' },
  { id: 'usr-4', name: 'Zeynep Şahin', role: 'Ar-Ge Uzmanı', avatar: '👩‍🔬' },
  { id: 'usr-5', name: 'Can Öztürk', role: 'Konsorsiyum Danışmanı', avatar: '👨‍💼' },
];

const initialDemoOpportunities: OpportunityItem[] = [
  {
    id: 'demo-opp-101',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri',
    stage: 'G0',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2026-09-D4-03',
    intendedRole: 'coordinator',
    ownerId: 'usr-1',
    ownerName: 'Ahmet Yılmaz',
    g0Score: 91,
    notes: 'Çağrı detayından eklenen örnek test projesi',
    notesList: [
      {
        id: 'note-1',
        text: 'TÜBİTAK MAM Araştırma Merkezi ile ön görüşme sağlandı. Koordinatörlük teklif edildi.',
        authorName: 'Ahmet Yılmaz',
        authorAvatar: '👨‍💼',
        createdAt: '03.09.2026 21:30',
      },
      {
        id: 'note-2',
        text: 'Almanya Fraunhofer Enstitüsü konsorsiyum davet mektubunu incelemeye aldı.',
        authorName: 'Ayşe Kaya',
        authorAvatar: '👩‍💻',
        createdAt: '03.09.2026 21:45',
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'demo-opp-102',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri (2027)',
    stage: 'G0',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2027-01-D4',
    intendedRole: 'coordinator',
    ownerId: 'usr-2',
    ownerName: 'Ayşe Kaya',
    g0Score: 94,
    notesList: [
      {
        id: 'note-3',
        text: 'İTÜ Yapay Zeka Laboratuvarı ekibiyle iş paketleri taslağı oluşturuldu.',
        authorName: 'Ayşe Kaya',
        authorAvatar: '👩‍💻',
        createdAt: '03.09.2026 20:15',
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'demo-opp-1',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'FLEX-GRID: Decarbonised Smart Grid Flexibility Solutions',
    stage: 'G0',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2024-D3-01-01',
    intendedRole: 'coordinator',
    ownerId: 'usr-3',
    ownerName: 'Mehmet Demir',
    g0Score: 88,
    notesList: [
      {
        id: 'note-4',
        text: 'Bütçe dağılımı €5.000.000 seviyesine göre ayarlandı.',
        authorName: 'Mehmet Demir',
        authorAvatar: '👨‍🔬',
        createdAt: '03.09.2026 19:00',
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'demo-opp-2',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'TWIN-HYDRO: AI-Powered Digital Twins for Green Hydrogen Plants',
    stage: 'G1',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL4-2024-TWIN-01',
    intendedRole: 'partner',
    ownerId: 'usr-4',
    ownerName: 'Zeynep Şahin',
    g0Score: 92,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'demo-opp-3',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'CIRC-PACK: Circular Bio-Economy Polymers for Industrial Packaging',
    stage: 'G2',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL6-2024-CIRCBIO-01',
    intendedRole: 'coordinator',
    ownerId: 'usr-1',
    ownerName: 'Ahmet Yılmaz',
    g0Score: 85,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'demo-opp-4',
    tenantId: 'demo-tenant',
    workspaceId: 'default',
    title: 'CLEAN-PORT: Zero-Emission Coastal Freight & Smart Bunkering',
    stage: 'G3',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2024-D5-01-12',
    intendedRole: 'partner',
    ownerId: 'usr-5',
    ownerName: 'Can Öztürk',
    g0Score: 94,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const globalStore = globalThis as unknown as {
  inMemoryOpportunities: OpportunityItem[] | undefined;
};

if (!globalStore.inMemoryOpportunities) {
  globalStore.inMemoryOpportunities = [...initialDemoOpportunities];
}

export function getInMemoryOpportunities(): OpportunityItem[] {
  return globalStore.inMemoryOpportunities || [...initialDemoOpportunities];
}

export function addInMemoryOpportunity(opp: OpportunityItem): OpportunityItem {
  if (!globalStore.inMemoryOpportunities) {
    globalStore.inMemoryOpportunities = [...initialDemoOpportunities];
  }
  if (!opp.notesList) opp.notesList = [];
  globalStore.inMemoryOpportunities.unshift(opp);
  return opp;
}

export function updateInMemoryOpportunityStage(id: string, stage: 'G0' | 'G1' | 'G2' | 'G3' | 'G4'): boolean {
  if (!globalStore.inMemoryOpportunities) return false;
  const found = globalStore.inMemoryOpportunities.find((o) => o.id === id);
  if (found) {
    found.stage = stage;
    found.updatedAt = new Date();
    return true;
  }
  return false;
}

export function updateInMemoryOpportunityOwner(id: string, ownerId: string, ownerName: string): boolean {
  if (!globalStore.inMemoryOpportunities) return false;
  const found = globalStore.inMemoryOpportunities.find((o) => o.id === id);
  if (found) {
    found.ownerId = ownerId;
    found.ownerName = ownerName;
    found.updatedAt = new Date();
    return true;
  }
  return false;
}

export function addInMemoryOpportunityNote(id: string, note: NoteEntry): boolean {
  if (!globalStore.inMemoryOpportunities) return false;
  const found = globalStore.inMemoryOpportunities.find((o) => o.id === id);
  if (found) {
    if (!found.notesList) found.notesList = [];
    found.notesList.push(note);
    found.updatedAt = new Date();
    return true;
  }
  return false;
}
