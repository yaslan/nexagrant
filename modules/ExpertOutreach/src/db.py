import sqlite3
from pathlib import Path
from typing import Optional, Union, List, Tuple
import config
from src.auth import hash_password

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_soyad TEXT NOT NULL,
  eposta TEXT UNIQUE NOT NULL,
  rol TEXT NOT NULL,        -- 'yonetici' | 'uye'
  parola_hash TEXT NOT NULL,
  aktif INTEGER DEFAULT 1,
  gunluk_limit INTEGER,     -- boşsa genel ayar kullanılır
  paket TEXT DEFAULT 'Standart', -- 'Standart', 'Pro', 'Enterprise', 'Outreach Add-on'
  moduller TEXT DEFAULT ''  -- virgülle ayrılmış özel lisanslı modüller
);

CREATE TABLE IF NOT EXISTS segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT UNIQUE NOT NULL   -- ör. 'Finans', 'Hukuk'
);

CREATE TABLE IF NOT EXISTS experts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT NOT NULL,
  soyad TEXT NOT NULL,
  uzmanlik TEXT,
  ulus TEXT DEFAULT 'Uluslararası',
  dil TEXT NOT NULL DEFAULT 'EN',
  durum TEXT NOT NULL DEFAULT 'Bekliyor',
  opt_out INTEGER NOT NULL DEFAULT 0,
  son_gonderim_tarihi TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_experts_durum ON experts(durum);
CREATE INDEX IF NOT EXISTS idx_experts_opt_out ON experts(opt_out);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment TEXT,            -- boşsa varsayılan şablon
  dil TEXT NOT NULL DEFAULT 'TR',
  konu TEXT,
  govde TEXT NOT NULL,
  aktif INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contact_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expert_id INTEGER REFERENCES experts(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  tip TEXT NOT NULL,       -- 'durum_degisti', 'mesaj_kopyalandi', 'not_eklendi', 'atandi'
  not_metni TEXT,
  tarih TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_expert ON contact_events(expert_id);
CREATE INDEX IF NOT EXISTS idx_events_user_tarih ON contact_events(user_id, tarih);

CREATE TABLE IF NOT EXISTS assignments (
  expert_id INTEGER PRIMARY KEY REFERENCES experts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  segment_id INTEGER REFERENCES segments(id),
  atama_tarihi TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_segment ON assignments(segment_id);

CREATE TABLE IF NOT EXISTS settings (
  anahtar TEXT PRIMARY KEY,
  deger TEXT
);
"""

# Native default templates for all 24 European Union official languages + Turkish
DEFAULT_TEMPLATES: List[Tuple[Optional[str], str, str, str, int]] = [
    # 1. TR - Türkçe (Türkiye)
    (
        None,
        "TR",
        "FonBridge Tanıtımı",
        "Merhaba {ad},\n\n{uzmanlik} alanındaki çalışmalarınızı takip ediyoruz. AB fonlama projelerinizi yönetmenize yardımcı olabilecek FonBridge platformunu tanıtmak isterim: Horizon Europe, Digital Europe ve Eurostars başvurularını fikirden hibe imzasına kadar yöneten bir platform.\n\nUygun olursa kısa bir görüşme yapmak ister misiniz?\n\nBu tür mesajları almak istemiyorsanız tek bir cevap yeterli; bir daha size yazmayacağız.",
        1
    ),
    # 2. EN - English (Ireland, Malta, International)
    (
        None,
        "EN",
        "Introducing FonBridge",
        "Hello {ad},\n\nI came across your work in {uzmanlik} and wanted to introduce FonBridge, a platform that manages EU funding applications (Horizon Europe, Digital Europe, Eurostars) from idea to grant signature.\n\nWould you be open to a short conversation?\n\nIf you prefer not to receive messages like this, a single reply is enough and we will not contact you again.",
        1
    ),
    # 3. DE - Deutsch (Germany, Austria)
    (
        None,
        "DE",
        "Vorstellung von FonBridge",
        "Hallo {ad},\n\nich bin auf Ihre Arbeit im Bereich {uzmanlik} gestoßen und möchte Ihnen FonBridge vorstellen, eine Plattform, die EU-Förderanträge (Horizon Europe, Digital Europe, Eurostars) vom Konzept bis zur Fördervereinbarung begleitet.\n\nHätten Sie Interesse an einem kurzen Gespräch?\n\nWenn Sie keine solchen Nachrichten mehr erhalten möchten, genügt eine kurze Antwort, und wir werden nicht erneut Kontakt aufnehmen.",
        1
    ),
    # 4. FR - Français (France, Belgium, Luxembourg)
    (
        None,
        "FR",
        "Présentation de FonBridge",
        "Bonjour {ad},\n\nJ'ai découvert vos travaux dans le domaine {uzmanlik} et je souhaitais vous présenter FonBridge, une plateforme dédiée à la gestion des candidatures aux financements européens (Horizon Europe, Digital Europe, Eurostars), de l'idée initiale jusqu'à la signature de la convention de subvention.\n\nSeriez-vous disponible pour un court échange ?\n\nSi vous ne souhaitez plus recevoir ce type de message, une simple réponse suffit et nous ne vous recontacterons plus.",
        1
    ),
    # 5. IT - Italiano (Italy)
    (
        None,
        "IT",
        "Presentazione di FonBridge",
        "Gentile {ad},\n\nSeguo con interesse il Suo lavoro nel settore {uzmanlik} e vorrei presentarLe FonBridge, una piattaforma dedicata alla gestione delle candidature per i finanziamenti europei (Horizon Europe, Digital Europe, Eurostars), dall'idea progettuale iniziale fino alla firma della convenzione di sovvenzione.\n\nSarebbe disponibile per un breve colloquio conoscitivo?\n\nSe preferisce non ricevere ulteriori comunicazioni di questo tipo, è sufficiente una breve risposta e non La ricontatteremo più.",
        1
    ),
    # 6. ES - Español (Spain)
    (
        None,
        "ES",
        "Presentación de FonBridge",
        "Estimado/a {ad},\n\nSigo con gran interés su trabajo en el área de {uzmanlik} y me gustaría presentarle FonBridge, una plataforma diseñada para gestionar solicitudes de financiación europea (Horizon Europe, Digital Europe, Eurostars) desde la idea inicial hasta la firma del acuerdo de subvención.\n\n¿Estaría disponible para una breve conversación?\n\nSi no desea recibir más mensajes de este tipo, basta con una breve respuesta y no volveremos a ponernos en contacto con usted.",
        1
    ),
    # 7. NL - Nederlands (Netherlands, Belgium)
    (
        None,
        "NL",
        "Introductie van FonBridge",
        "Beste {ad},\n\nIk volg uw werk op het gebied van {uzmanlik} met veel belangstelling en wil u graag kennis laten maken met FonBridge: een platform dat Europese subsidieaanvragen (Horizon Europe, Digital Europe, Eurostars) begeleidt van eerste idee tot aan subsidieovereenkomst.\n\nStaat u open voor een kort kennismakingsgesprek?\n\nMocht u geen berichten van deze aard wensen te ontvangen, volstaat een kort antwoord en zullen wij u niet meer benaderen.",
        1
    ),
    # 8. PL - Polski (Poland)
    (
        None,
        "PL",
        "Prezentacja platformy FonBridge",
        "Dzień dobry {ad},\n\nZ dużym zainteresowaniem śledzę Państwa osiągnięcia w dziedzinie {uzmanlik}. Chciał(a)bym przedstawić FonBridge – platformę kompleksowo wspierającą wnioski o dotacje unijne (Horizon Europe, Digital Europe, Eurostars), od koncepcji po podpisanie umowy grantowej.\n\nCzy był(a)by Pan/Pani otwarty/a na krótką rozmowę?\n\nJeśli nie życzą sobie Państwo takich wiadomości, wystarczy jedna krótka odpowiedź, a nie będziemy się więcej kontaktować.",
        1
    ),
    # 9. PT - Português (Portugal)
    (
        None,
        "PT",
        "Apresentação da FonBridge",
        "Olá {ad},\n\nAcompanho com grande interesse o seu trabalho na área de {uzmanlik} e gostaria de lhe apresentar a FonBridge, uma plataforma criada para gerir candidaturas a financiamentos europeus (Horizon Europe, Digital Europe, Eurostars), desde a ideia inicial até à assinatura do acordo de subvenção.\n\nEstaria disponível para uma breve conversa?\n\nSe não pretender receber este tipo de mensagens, basta uma breve resposta e não voltaremos a contactá-lo(a).",
        1
    ),
    # 10. RO - Română (Romania)
    (
        None,
        "RO",
        "Prezentare FonBridge",
        "Bună ziua {ad},\n\nUrmăresc cu interes activitatea dumneavoastră în domeniul {uzmanlik} și aș dori să vă prezint FonBridge, o platformă concepută pentru a gestiona cererile de finanțare europeană (Horizon Europe, Digital Europe, Eurostars), de la ideea de proiect până la semnarea acordului de grant.\n\nAți fi disponibil(ă) pentru o scurtă discuție?\n\nDacă preferați să nu mai primiți astfel de mesaje, un simplu răspuns este suficient și nu vă vom mai contacta.",
        1
    ),
    # 11. EL - Ελληνικά (Greece, Cyprus)
    (
        None,
        "EL",
        "Παρουσίαση του FonBridge",
        "Αξιότιμε/η {ad},\n\nΠαρακολουθώ με μεγάλο ενδιαφέρον το έργο σας στον τομέα {uzmanlik} και θα ήθελα να σας παρουσιάσω το FonBridge, μια πλατφόρμα διαχείρισης ευρωπαϊκών προγραμμάτων χρηματοδότησης (Horizon Europe, Digital Europe, Eurostars), από την αρχική ιδέα έως την υπογραφή της συμφωνίας επιχορήγησης.\n\nΘα ήσασταν διαθέσιμος/η για μια σύντομη συνομιλία;\n\nΕάν δεν επιθυμείτε να λαμβάνετε τέτοια μηνύματα, αρκεί μια σύντομη απάντηση και δεν θα επικοινωνήσουμε ξανά μαζί σας.",
        1
    ),
    # 12. CS - Čeština (Czechia)
    (
        None,
        "CS",
        "Představení platformy FonBridge",
        "Dobrý den, {ad},\n\nsleduji Vaši práci v oblasti {uzmanlik} a rád(a) bych Vám představil(a) platformu FonBridge, která pomáhá řídit žádosti o evropské granty (Horizon Europe, Digital Europe, Eurostars) od prvotního nápadu až po podpis grantové smlouvy.\n\nByl(a) byste otevřen(a) krátkému rozhovoru?\n\nPokud si nepřejete dostávat tyto zprávy, stačí odpovědět a již Vás nebudeme kontaktovat.",
        1
    ),
    # 13. HU - Magyar (Hungary)
    (
        None,
        "HU",
        "A FonBridge bemutatása",
        "Kedves {ad}!\n\nFigyelemmel kísérem a(z) {uzmanlik} területén végzett szakmai munkáját, és szeretném bemutatni Önnek a FonBridge platformot, amely európai uniós pályázatok (Horizon Europe, Digital Europe, Eurostars) menedzselését segíti a kezdeti ötlettől a támogatási szerződés aláírásáig.\n\nNyitott lenne egy rövid megbeszélésre?\n\nAmennyiben nem szeretne hasonló üzeneteket kapni, egyetlen rövid válasszal jelezze, és nem keressük többet.",
        1
    ),
    # 14. SV - Svenska (Sweden)
    (
        None,
        "SV",
        "Presentation av FonBridge",
        "Hej {ad},\n\njag har med stort intresse tagit del av ditt arbete inom {uzmanlik} och vill gärna introducera FonBridge: en plattform som stödjer hantering av EU-ansökningar (Horizon Europe, Digital Europe, Eurostars) från projektidé till tecknande av bidragsavtal.\n\nSkulle du vara öppen för ett kort samtal?\n\nOm du inte önskar fler meddelanden av denna typ räcker det med ett kort svar, så kontaktar vi dig inte igen.",
        1
    ),
    # 15. DA - Dansk (Denmark)
    (
        None,
        "DA",
        "Præsentation af FonBridge",
        "Hej {ad},\n\njeg har fulgt dit arbejde inden for {uzmanlik} med stor interesse og vil gerne præsentere FonBridge – en platform dedikeret til styring af EU-tilskudsansøgninger (Horizon Europe, Digital Europe, Eurostars) fra idé til endelig bevilling.\n\nVil du være åben for en kort samtale?\n\nHvis du foretrækker ikke at modtage sådanne henvendelser, behøver du blot svare kort, og vi kontakter dig ikke igen.",
        1
    ),
    # 16. FI - Suomi (Finland)
    (
        None,
        "FI",
        "FonBridge-alustan esittely",
        "Hei {ad},\n\nolen seurannut mielenkiinnolla työtänne aihealueella {uzmanlik} ja haluaisin esitellä teille FonBridge-alustan, joka tukee EU-rahoitushakemusten (Horizon Europe, Digital Europe, Eurostars) hallintaa aina ideasta avustussopimuksen allekirjoittamiseen saakka.\n\nOlisitteko avoin lyhyelle keskustelulle?\n\nMikäli ette halua vastaanottaa tämänkaltaisia viestejä, lyhyt vastaus riittää, emmekä ota teihin enää yhteyttä.",
        1
    ),
    # 17. SK - Slovenčina (Slovakia)
    (
        None,
        "SK",
        "Predstavenie platformy FonBridge",
        "Dobrý deň {ad},\n\nsledujem Vašu prácu v oblasti {uzmanlik} a rád/rada by som Vám predstavil/a FonBridge – platformu, ktorá podporuje žiadosti o európske granty (Horizon Europe, Digital Europe, Eurostars) od prvotnej myšlienky až po podpis zmluvy o grante.\n\nBoli by ste otvorený/á krátkemu rozhovoru?\n\nAk si neželáte dostávať takéto správy, stačí jedna krátka odpoveď a viac Vás nebudeme kontaktovať.",
        1
    ),
    # 18. HR - Hrvatski (Croatia)
    (
        None,
        "HR",
        "Predstavljanje platforme FonBridge",
        "Poštovani {ad},\n\npratim Vaš rad u području {uzmanlik} te bih Vam želio/željela predstaviti FonBridge – platformu za upravljanje prijavama za financiranje iz fondova EU (Horizon Europe, Digital Europe, Eurostars), od početne ideje do potpisivanja ugovora o dodjeli bespovratnih sredstava.\n\nBiste li bili otvoreni za kratak razgovor?\n\nAko ne želite primati ovakve poruke, dovoljan je jedan kratak odgovor i više Vas nećemo kontaktirati.",
        1
    ),
    # 19. BG - Български (Bulgaria)
    (
        None,
        "BG",
        "Представяне на FonBridge",
        "Здравейте {ad},\n\nС голям интерес следя Вашата работа в областта на {uzmanlik}. Бих желал(а) да Ви представя FonBridge – платформа за управление на кандидатстването по европейски програми (Horizon Europe, Digital Europe, Eurostars), от първоначалната идея до подписването на договора за безвъзмездна помощ.\n\nБихте ли били отворени за кратък разговор?\n\nАко не желаете да получавате подобни съобщения, достатъчно е да отговорите с една дума и няма да се свързваме повече с Вас.",
        1
    ),
    # 20. SL - Slovenščina (Slovenia)
    (
        None,
        "SL",
        "Predstavitev platforme FonBridge",
        "Pozdravljeni {ad},\n\nz zanimanjem spremljam vaše delo na področju {uzmanlik} in bi vam z veseljem predstavil platformo FonBridge, ki omogoča vodenje prijav za evropska nepovratna sredstva (Horizon Europe, Digital Europe, Eurostars) od začetne ideje do podpisa pogodbe o dodelitvi sredstev.\n\nBi bili pripravljeni na kratek pogovor?\n\nČe tovrstnih sporočil ne želite prejemati, zadostuje kratek odgovor in vas ne bomo več kontaktirali.",
        1
    ),
    # 21. LT - Lietuvių (Lithuania)
    (
        None,
        "LT",
        "FonBridge platformos pristatymas",
        "Sveiki, {ad},\n\nsu dideliu susidomėjimu stebiu Jūsų veiklą srityje {uzmanlik} ir norėčiau pristatyti „FonBridge“ – platformą, skirtą valdyti ES finansavimo paraiškas (Horizon Europe, Digital Europe, Eurostars) nuo pradinės idėjos iki dotacijos sutarties pasirašymo.\n\nAr būtumėte atviras(-a) trumpam pokalbiui?\n\nJei nenorite gauti tokių pranešimų, tiesiog atsakykite trumpa žinute ir mes daugiau su Jumis nebesusisieksime.",
        1
    ),
    # 22. LV - Latviešu (Latvia)
    (
        None,
        "LV",
        "FonBridge platformas iepazīstināšana",
        "Labdien, {ad}!\n\nAr lielu interesi sekoju Jūsu darbam jomā {uzmanlik} un vēlētos Jūs iepazīstināt ar FonBridge – platformu, kas palīdz pārvaldīt ES finansējuma pieteikumus (Horizon Europe, Digital Europe, Eurostars) no projekta idejas līdz pat granta līguma parakstīšanai.\n\nVai Jūs būtu atvērts(-a) īsai sarunai?\n\nJa nevēlaties saņemt šādus ziņojumus, pietiek ar īsu atbildi, un mēs ar Jums vairs nesazināsimies.",
        1
    ),
    # 23. ET - Eesti keel (Estonia)
    (
        None,
        "ET",
        "FonBridge platvormi tutvustus",
        "Tere {ad}!\n\nJälgin suure huviga Teie tööd valdkonnas {uzmanlik} ning sooviksin tutvustada FonBridge platvormi, mis toetab Euroopa Liidu rahastustaotluste (Horizon Europe, Digital Europe, Eurostars) haldamist alates esialgsest ideest kuni toetuslepingu allkirjastamiseni.\n\nKas oleksite avatud lühikesele vestlusele?\n\nKui Te ei soovi selliseid teateid saada, piisab ühest vastusest ning me ei võta Teiega enam ühendust.",
        1
    ),
    # 24. GA - Gaeilge (Ireland)
    (
        None,
        "GA",
        "Réamhrá ar FonBridge",
        "A {ad}, a chara,\n\nBhí mé ag leanúint do chuid oibre i réimse {uzmanlik} agus ba mhaith liom FonBridge a chur i láthair duit: ardán a chabhraíonn le hiarratais ar mhaoiniú ón AE (Horizon Europe, Digital Europe, Eurostars) a bhainistiú ón gcéad smaoineamh go dtí síniú an deontais.\n\nAn mbeifeá sásta comhrá gairid a dhéanamh?\n\nMura mian leat teachtaireachtaí den sórt seo a fháil feasta, is leor freagra gairid amháin agus ní dhéanfaimid teagmháil leat arís.",
        1
    ),
    # 25. MT - Malti (Malta)
    (
        None,
        "MT",
        "Introduzzjoni għal FonBridge",
        "Għażiż/a {ad},\n\nQed insegwi b'interess kbir il-ħidma tiegħek fil-qasam ta' {uzmanlik} u nixtieq nintroduċilek FonBridge, pjattaforma mfassla biex timmaniġġja applikazzjonijiet għal fondi Ewropej (Horizon Europe, Digital Europe, Eurostars) mill-idea inizjali sal-iffirmar tal-għotja.\n\nTkun miftuħ/a għal konversazzjoni qasira?\n\nJekk tippreferi ma tirċevix aktar messaġġi bħal dawn, risposta qasira hija biżżejjed u ma nerġgħux nikkuntattjawk.",
        1
    ),
]


def get_db_connection(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Get a database connection with foreign key support enabled."""
    target_path = db_path or config.DB_PATH
    conn = sqlite3.connect(target_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Initialize database tables, default settings, templates, and admin user."""
    conn = get_db_connection(db_path)
    with conn:
        conn.executescript(SCHEMA_SQL)
        
        # Ensure 'ulus' column exists for existing databases
        # Ensure columns exist for existing databases
        try:
            conn.execute("ALTER TABLE experts ADD COLUMN ulus TEXT DEFAULT 'Uluslararası'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN paket TEXT DEFAULT 'Standart'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN moduller TEXT DEFAULT ''")
        except Exception:
            pass
        
        # Seed settings if empty
        conn.execute(
            "INSERT OR IGNORE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("gunluk_limit", str(config.DEFAULT_DAILY_LIMIT))
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("takip_gun", str(config.DEFAULT_FOLLOWUP_DAYS))
        )
        # Module settings (standart, paket_eklenti, devre_disi)
        conn.execute(
            "INSERT OR IGNORE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("module_outreach_mode", "standart")
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("module_outreach_allowed_plans", "Pro,Enterprise,Outreach Add-on")
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (anahtar, deger) VALUES (?, ?)",
            ("module_outreach_price", "₺4.990 / ay")
        )
        
        # Seed default templates per language if not present
        cursor = conn.cursor()
        for tpl in DEFAULT_TEMPLATES:
            cursor.execute(
                "SELECT COUNT(*) FROM templates WHERE segment IS NULL AND dil = ?",
                (tpl[1],)
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute(
                    "INSERT INTO templates (segment, dil, konu, govde, aktif) VALUES (?, ?, ?, ?, ?)",
                    tpl
                )
            
        # Seed default admin user if no users exist
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            admin_hash = hash_password("admin123")
            cursor.execute(
                """
                INSERT INTO users (ad_soyad, eposta, rol, parola_hash, aktif, gunluk_limit, paket, moduller)
                VALUES (?, ?, ?, ?, 1, NULL, 'Enterprise', 'expert_outreach')
                """,
                ("Sistem Yöneticisi", "admin@fonbridge.com", "yonetici", admin_hash)
            )
    return conn
