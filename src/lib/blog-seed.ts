/**
 * TASK-MTRNQHC3IV2BE — a byline names a real author or it is absent.
 *
 * The four posts below shipped with bylines nobody wrote: "Dr. Mehmet Yılmaz /
 * AB Proje Başdanışmanı", "Av. Ayşe Kaya", "Dr. Sofia Rossi", "Can Aksoy" —
 * each with a stock photograph of an unrelated real person as their avatar,
 * signing marketing copy that carries success-rate claims. The posts are public
 * (`/tr/blog`), so an invented expert was vouching for those numbers.
 *
 * `author` is therefore optional. The three surfaces that render a byline
 * (marketing list, post page, landing section) render it only when one exists;
 * the admin editor fills it with the signed-in author's own identity. There is
 * no default author string anywhere: an unattributed post is shown
 * unattributed.
 *
 * TASK-MTS6MRKDP168Q — a figure on a public page names a record or it is absent.
 *
 * The same posts carried numbers no record in this repo produces: "150.000+
 * CORDIS kurum verisiyle yapılan analize göre", "kazanma şansını %40 artırıyor",
 * "60 milyar Avro'dan fazla hibe alan 150.000'den fazla kuruluş", "ortalama
 * 4.8/5.0 puan", "bütçenin en az %25'i ... etki puanını yükseltir", "50+ teklifi
 * eşzamanlı sıfır çakışmayla", "sürelerini haftalardan saatlere". Measured on
 * this branch: `CordisOrganization` holds 0 rows and the analysed EU budget is
 * EUR 0, so "150.000+" and "EUR 60B+" were not merely unsourced — they were
 * contradicted. `TopicStat` holds 3 demo rows (source "seed-demo-g0-evidence")
 * carrying per-topic success rates, which back neither a 40% uplift nor a
 * 4.8/5.0 reviewer average; `Evidence` is tenant-scoped behind RLS and a public
 * page has no tenant to read it from.
 *
 * None of the seven could therefore be bound to a record, so each is gone —
 * removed, not softened into "yaklaşık". What survives describes what the
 * platform computes, never how much it is worth. Adding a figure back means
 * adding the Evidence/TopicStat read that produces it (CLAUDE.md rule 7);
 * `tests/marketing-unsourced-figures.test.ts` pins the removed strings.
 *
 * AKTAR-MURBCJ0A-1 — these four posts used to be the live blog: a module-level
 * array in src/lib/blog.ts that the admin editor mutated in memory. The blog now
 * lives in the `BlogPost` table; this file is only the launch content, inserted
 * by {@link seedBlogPosts} (`pnpm db:seed-blog`, also run by `pnpm db:seed`).
 * The publication dates are the ones the posts were shown with ("28 Ağustos
 * 2026" …), now stored as dates and formatted per locale on render.
 */
import type { PrismaClient } from '@prisma/client';
import { PRODUCT_NAME } from './brand';

/** One launch post as it is inserted. No `author`: see TASK-MTRNQHC3IV2BE above. */
export interface BlogSeedPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  publishedAt: Date;
  image: string;
  featured: boolean;
}

export const BLOG_SEED_POSTS: readonly BlogSeedPost[] = [
  {
    slug: 'horizon-europe-basarili-konsorsiyum-rehberi',
    title: 'Horizon Europe Çalışma Programlarında Başarılı Konsorsiyum Kurma Rehberi',
    excerpt: 'CORDIS ağ verisinde bir kurumun merkezilik puanı, geçmişte ne kadar aktif koordinasyon yaptığını gösterir. Konsorsiyum kurarken bu sinyali nasıl okuyacağınızı anlatıyoruz.',
    category: 'Horizon Europe',
    readTime: '5 dk okuma',
    publishedAt: new Date('2026-08-28T00:00:00.000Z'),
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# Horizon Europe Çalışma Programlarında Başarılı Konsorsiyum Kurma Rehberi

Horizon Europe projelerinde fonlanma başarısı, yalnızca güçlü bir fikre değil; fikri hayata geçirecek doğru uluslararası konsorsiyuma dayanır. 

## 1. CORDIS Veri Analitiği ve Ağ Merkeziliği
CORDIS (Community Research and Development Information Service), Avrupa Komisyonu'nun fonladığı projeleri, bu projelere katılan kuruluşları ve aldıkları hibe tutarlarını yayımlar. Bir kurumun ağ merkezilik puanı (eigenvector centrality), daha önce ne kadar aktif koordinasyon yaptığını gösterir.

### Önemli Metrikler:
* **Koordinatörlük Deneyimi:** Daha önce kabul edilmiş proje yürütmüş koordinatörler, Uygulama (Implementation) bölümünde yönetim kapasitesini somut referansla gösterebilir.
* **Coğrafi Çeşitlilik:** AB 27 üye ülkesi ve Asosiye ülkelerden dengeli dağılım.
* **KOBİ ve Sanayi Katılımı:** Sanayi ve KOBİ ortaklarının bütçe payı, Etki (Impact) bölümünde ticarileştirme ve kullanım planının inandırıcılığını belirler.

## 2. ${PRODUCT_NAME} M8 Konsorsiyum Eşleştirme Motoru
${PRODUCT_NAME} M8 modülü, CORDIS canlı delta API entegrasyonu sayesinde aradığınız spesifik yetkinliğe sahip partnerleri saniyeler içinde önerir.
    `,
  },
  {
    slug: 'tubitak-esik-ustu-ab-hakem-kriterleri',
    title: 'TÜBİTAK Eşik Üstü Ödülü ve AB Hakem Değerlendirme Kriterleri (15 Puan)',
    excerpt: 'Mükemmeliyet (Excellence), Etki (Impact) ve Uygulama (Implementation) kriterlerinde AB bağımsız hakemlerinin dikkat ettiği 10 kritik detay.',
    category: 'TÜBİTAK & Hibe',
    readTime: '7 dk okuma',
    publishedAt: new Date('2026-08-15T00:00:00.000Z'),
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# TÜBİTAK Eşik Üstü Ödülü ve AB Hakem Değerlendirme Kriterleri

Avrupa Komisyonu doğrudan hibelerinde eşik puanı (Threshold) aşmak, hem TÜBİTAK Eşik Üstü Ödülü almak hem de fonlanma şansını yakalamak için kritiktir.

## 15 Puanlık AB Puanlama Skalası:
1. **Excellence (Mükemmeliyet) - 5 Puan:** Projenin durumu ötesi (Beyond State-of-the-Art), TRL seviyesindeki sıçrama ve bilimsel metodoloji.
2. **Impact (Etki) - 5 Puan:** AB Yeşil Mutabakatı (Green Deal) ve Dijital On Yıl hedeflerine somut katkı, CORDIS çıktıları ile yaygınlaştırma planı.
3. **Implementation (Uygulama) - 5 Puan:** Çalışma paketleri (Work Packages), risk matrisi ve bütçe/adam-gün tutarlılığı.

## ${PRODUCT_NAME} M6 Evaluator Lens İle Puanınızı Yükseltin
${PRODUCT_NAME} M6 modülü, resmi AB hakemi bakış açısıyla metninizin zayıf paragraflarını tespit eder ve iyileştirme önerileri sunar.
    `,
  },
  {
    slug: 'ar-ge-projelerinde-yapay-zeka-destegi-part-b',
    title: 'Ar-Ge Projelerinde Yapay Zeka Desteği: Part B Yazımında Etik Standartlar',
    excerpt: 'Yapay zeka araçlarıyla Konsept Notu ve Part B taslağı oluştururken AB komisyonu etik rehberi ve CORDIS RAG mimarisinin kullanımı.',
    category: 'Yapay Zeka',
    readTime: '4 dk okuma',
    publishedAt: new Date('2026-08-02T00:00:00.000Z'),
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    featured: true,
    content: `
# Ar-Ge Projelerinde Yapay Zeka Desteği: Part B Yazımı

Yapay zeka (LLM) teknolojileri teklif hazırlama sürecini hızlandırsa da, AB Komisyonu tarafından yayımlanan etik ilkeler doğrultusunda kullanılması şarttır.

## CORDIS RAG Destekli Doğru Üretim
Genel yapay zeka modelleri (hallucination) uydurma kaynak üretebilir. ${PRODUCT_NAME}, CORDIS vector veritabanı uyarınca **Retrieval-Augmented Generation (RAG)** mimarisini kullanarak doğruluk sunar.

### Etik Kullanım İlkeleri:
* Özgünfikir beyanı ve fikri mülkiyet (IP) koruması.
* Multi-tenant veri izolasyonu ile müşteri verilerinin gizliliği.
* Yapay Zeka Kullanım Beyanı (AI Declaration) şablonu.
    `,
  },
  {
    slug: 'tto-ve-danismanlar-icin-multi-tenant-proje-yonetimi',
    title: 'TTO ve Danışmanlar İçin Multi-Tenant Proje Yönetimi: Adam-Gün Eforu',
    excerpt: 'G0-G4 Stage-Gate boru hattı ile üniversite ve danışmanlık firmaları çok sayıda teklifi eşzamanlı ve birbirinden yalıtılmış yürütür.',
    category: 'TTO & Danışmanlık',
    readTime: '6 dk okuma',
    publishedAt: new Date('2026-07-20T00:00:00.000Z'),
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

/**
 * Inserts each launch post whose slug is not in the table yet, and leaves every
 * existing row alone — an upsert by slug with an empty `update`. Re-running it is
 * a no-op, and it never overwrites what an admin edited through /admin/blog.
 * (A launch post an admin DELETED comes back on the next run; the seed is meant
 * to run once per environment — scripts/seed-blog-posts.ts.)
 */
export async function seedBlogPosts(
  client: Pick<PrismaClient, 'blogPost'>
): Promise<{ inserted: number; kept: number }> {
  let inserted = 0;
  for (const post of BLOG_SEED_POSTS) {
    const before = await client.blogPost.count({ where: { slug: post.slug } });
    await client.blogPost.upsert({ where: { slug: post.slug }, create: { ...post }, update: {} });
    if (before === 0) inserted += 1;
  }
  return { inserted, kept: BLOG_SEED_POSTS.length - inserted };
}
