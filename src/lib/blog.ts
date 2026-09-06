export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  publishedAt: string;
  author: {
    name: string;
    role: string;
    avatar: string;
  };
  image: string;
  featured?: boolean;
}

export let BLOG_POSTS: BlogPost[] = [
  {
    slug: 'horizon-europe-basarili-konsorsiyum-rehberi',
    title: 'Horizon Europe Çalışma Programlarında Başarılı Konsorsiyum Kurma Rehberi',
    excerpt: '150.000+ CORDIS kurum verisiyle yapılan analize göre, AB projelerinde koordinatör ve partnerlerin ağ merkezilik skoru kazanma şansını %40 artırıyor.',
    category: 'Horizon Europe',
    readTime: '5 dk okuma',
    publishedAt: '28 Ağustos 2026',
    author: {
      name: 'Dr. Mehmet Yılmaz',
      role: 'AB Proje Başdanışmanı',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    },
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# Horizon Europe Çalışma Programlarında Başarılı Konsorsiyum Kurma Rehberi

Horizon Europe projelerinde fonlanma başarısı, yalnızca güçlü bir fikre değil; fikri hayata geçirecek doğru uluslararası konsorsiyuma dayanır. 

## 1. CORDIS Veri Analitiği ve Ağ Merkeziliği
CORDIS (Community Research and Development Information Service) verileri, geçmiş 10 yılda 60 milyar Avro'dan fazla hibe alan 150.000'den fazla kuruluşu içerir. Bir kurumun ağ merkezilik puanı (eigenvector centrality), daha önce ne kadar aktif koordinasyon yaptığını gösterir.

### Önemli Metrikler:
* **Koordinatörlük Deneyimi:** En az 2 kabul edilmiş projesi olan koordinatörler, G3 Hakem değerlendirmesinde Mükemmeliyet bölümünden ortalama 4.8/5.0 puan almaktadır.
* **Coğrafi Çeşitlilik:** AB 27 üye ülkesi ve Asosiye ülkelerden dengeli dağılım.
* **KOBİ ve Sanayi Katılımı:** Bütçenin en az %25'inin sanayi/KOBİ ortağına ayrılması etki puanını yükseltir.

## 2. FonBridge M8 Konsorsiyum Eşleştirme Motoru
FonBridge M8 modülü, CORDIS canlı delta API entegrasyonu sayesinde aradığınız spesifik yetkinliğe sahip partnerleri saniyeler içinde önerir.
    `,
  },
  {
    slug: 'tubitak-esik-ustu-ab-hakem-kriterleri',
    title: 'TÜBİTAK Eşik Üstü Ödülü ve AB Hakem Değerlendirme Kriterleri (15 Puan)',
    excerpt: 'Mükemmeliyet (Excellence), Etki (Impact) ve Uygulama (Implementation) kriterlerinde AB bağımsız hakemlerinin dikkat ettiği 10 kritik detay.',
    category: 'TÜBİTAK & Hibe',
    readTime: '7 dk okuma',
    publishedAt: '15 Ağustos 2026',
    author: {
      name: 'Av. Ayşe Kaya',
      role: 'Hukuk & Mevzuat Uzmanı',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80',
    },
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# TÜBİTAK Eşik Üstü Ödülü ve AB Hakem Değerlendirme Kriterleri

Avrupa Komisyonu doğrudan hibelerinde eşik puanı (Threshold) aşmak, hem TÜBİTAK Eşik Üstü Ödülü almak hem de fonlanma şansını yakalamak için kritiktir.

## 15 Puanlık AB Puanlama Skalası:
1. **Excellence (Mükemmeliyet) - 5 Puan:** Projenin durumu ötesi (Beyond State-of-the-Art), TRL seviyesindeki sıçrama ve bilimsel metodoloji.
2. **Impact (Etki) - 5 Puan:** AB Yeşil Mutabakatı (Green Deal) ve Dijital On Yıl hedeflerine somut katkı, CORDIS çıktıları ile yaygınlaştırma planı.
3. **Implementation (Uygulama) - 5 Puan:** Çalışma paketleri (Work Packages), risk matrisi ve bütçe/adam-gün tutarlılığı.

## FonBridge M6 Evaluator Lens İle Puanınızı Yükseltin
FonBridge M6 modülü, resmi AB hakemi bakış açısıyla metninizin zayıf paragraflarını tespit eder ve iyileştirme önerileri sunar.
    `,
  },
  {
    slug: 'ar-ge-projelerinde-yapay-zeka-destegi-part-b',
    title: 'Ar-Ge Projelerinde Yapay Zeka Desteği: Part B Yazımında Etik Standartlar',
    excerpt: 'Yapay zeka araçlarıyla Konsept Notu ve Part B taslağı oluştururken AB komisyonu etik rehberi ve CORDIS RAG mimarisinin kullanımı.',
    category: 'Yapay Zeka',
    readTime: '4 dk okuma',
    publishedAt: '2 Ağustos 2026',
    author: {
      name: 'Dr. Sofia Rossi',
      role: 'Yapay Zeka Mimarisi Lideri',
      avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80',
    },
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# Ar-Ge Projelerinde Yapay Zeka Desteği: Part B Yazımı

Yapay zeka (LLM) teknolojileri teklif hazırlama sürelerini haftalardan saatlere düşürse de, AB Komisyonu tarafından yayımlanan etik ilkeler doğrultusunda kullanılması şarttır.

## CORDIS RAG Destekli Doğru Üretim
Genel yapay zeka modelleri (hallucination) uydurma kaynak üretebilir. FonBridge, CORDIS vector veritabanı uyarınca **Retrieval-Augmented Generation (RAG)** mimarisini kullanarak doğruluk sunar.

### Etik Kullanım İlkeleri:
* Özgünfikir beyanı ve fikri mülkiyet (IP) koruması.
* Multi-tenant veri izolasyonu ile müşteri verilerinin gizliliği.
* Yapay Zeka Kullanım Beyanı (AI Declaration) şablonu.
    `,
  },
  {
    slug: 'tto-ve-danismanlar-icin-multi-tenant-proje-yonetimi',
    title: 'TTO ve Danışmanlar İçin Multi-Tenant Proje Yönetimi: Adam-Gün Eforu',
    excerpt: 'G0-G4 Stage-Gate boru hattı ile üniversite ve danışmanlık firmalarının 50+ teklifi eşzamanlı sıfır çakışmayla yönetme sırları.',
    category: 'TTO & Danışmanlık',
    readTime: '6 dk okuma',
    publishedAt: '20 Temmuz 2026',
    author: {
      name: 'Can Aksoy',
      role: 'TTO Ürün Yöneticisi',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    },
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
    featured: false,
    content: `
# TTO ve Danışmanlar İçin Multi-Tenant Proje Yönetimi

Üniversite Teknoloji Transfer Ofisleri (TTO) ve AB proje danışmanlık firmaları aynı anda onlarca farklı akademisyen veya müşteri projesini yürütür.

## Stage-Gate (Aşama-Kapı) Boru Hattı
5 Aşamalı Kapı Modeli (G0-G4), projenin elenmesi veya devam etmesi kararını objektif kriterlere bağlar. Bu sayede elenecek projelere boşa harcanan adam-gün eforu engellenir.
    `,
  },
];

export function getBlogPosts(): BlogPost[] {
  return BLOG_POSTS;
}

export function getFeaturedBlogPosts(count: number = 3): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.featured).slice(0, count);
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

// ─── CRUD OPERASYONLARI ───

export function createBlogPost(post: BlogPost): BlogPost {
  // Generate slug if empty or format
  const formattedSlug = post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  const newPost: BlogPost = {
    ...post,
    slug: formattedSlug,
    publishedAt: post.publishedAt || new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
  
  BLOG_POSTS = [newPost, ...BLOG_POSTS.filter((p) => p.slug !== formattedSlug)];
  return newPost;
}

export function updateBlogPost(slug: string, updated: Partial<BlogPost>): BlogPost | undefined {
  const index = BLOG_POSTS.findIndex((p) => p.slug === slug);
  if (index === -1) return undefined;

  const current = BLOG_POSTS[index];
  const updatedPost: BlogPost = {
    ...current,
    ...updated,
    author: {
      ...current.author,
      ...(updated.author || {}),
    },
  };

  BLOG_POSTS[index] = updatedPost;
  return updatedPost;
}

export function deleteBlogPost(slug: string): boolean {
  const initialLength = BLOG_POSTS.length;
  BLOG_POSTS = BLOG_POSTS.filter((p) => p.slug !== slug);
  return BLOG_POSTS.length < initialLength;
}

export function toggleFeaturedBlogPost(slug: string): BlogPost | undefined {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return undefined;
  post.featured = !post.featured;
  return post;
}
