"""
Complete European Union (24 official languages) + Turkey (TR)
Nationality and Native Language Detection Engine.

Detects nationality and native language using first name, last name,
morphological cues (suffixes, prefixes), and special alphabets/characters.
"""

from typing import Set, Tuple, Dict, Any, List
import re
import sqlite3

# ----------------- DISTINCTIVE CHARACTER SETS -----------------
TURKISH_CHARS = set("çğıöşüÇĞİÖŞÜ")
GREEK_CHARS = set("αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ")
CYRILLIC_CHARS = set("абвгдежзийклмнопрстуфхцчшщъыьэюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ")
MALTESE_CHARS = set("ċġħżĊĠĦŻ")
POLISH_CHARS = set("ąćęłńśźżĄĆĘŁŃŚŹŻ")
HUNGARIAN_UNIQUE_CHARS = set("őűŐŰ")
CZECH_UNIQUE_CHARS = set("řěůŘĚŮ")
SLOVAK_UNIQUE_CHARS = set("ĺľŕôĹĽŔÔ")
ROMANIAN_CHARS = set("ăâîșțĂÂÎȘȚ")
LITHUANIAN_CHARS = set("ąęėįųūžĄĘĖĮŲŪŽ")
LATVIAN_CHARS = set("āēīūģķļņčšžĀĒĪŪĢĶĻŅČŠŽ")
DANISH_CHARS = set("æøÆØ")
CROATIAN_CHARS = set("ćđĆĐ")
PORTUGUESE_UNIQUE_CHARS = set("ãõÃÕ")
SPANISH_UNIQUE_CHARS = set("ñÑ")
GERMAN_UNIQUE_CHARS = set("ß")
FRENCH_LIGATURES = set("œæŒÆ")

# ----------------- SURNAME SUFFIXES & PREFIXES -----------------
TURKISH_SURNAME_SUFFIXES = (
    "oğlu", "oglu", "kaya", "demir", "yılmaz", "yilmaz", "çelik", "celik",
    "şahin", "sahin", "öztürk", "ozturk", "aksoy", "arslan", "doğan", "dogan",
    "kılıç", "kilic", "aslan", "çetin", "cetin", "kara", "koç", "koc", "kurt",
    "özdemir", "ozdemir", "polat", "özkan", "ozkan", "acar", "avcı", "avci",
    "yıldız", "yildiz", "yıldırım", "yildirim", "aydın", "aydin", "özcan", "ozcan",
    "tekin", "güler", "yalçın", "yalcin", "yavuz"
)

GREEK_SURNAME_SUFFIXES = (
    "opoulos", "opoulou", "akis", "aki", "idis", "idou", "iadis", "iadi",
    "eas", "atos", "elis", "poulos", "oglou", "akos"
)

BULGARIAN_SURNAME_SUFFIXES = ("ov", "ova", "ev", "eva")

POLISH_SURNAME_SUFFIXES = (
    "ski", "ska", "wicz", "czyk", "czak", "kowski", "kowska", "iak", "ak", "ewski", "ewska"
)

ROMANIAN_SURNAME_SUFFIXES = ("escu", "eanu", "aru", "anu", "ești", "esti")

HUNGARIAN_SURNAME_SUFFIXES = ("ffy", "yi", "ai")

CZECH_SURNAME_SUFFIXES = ("ová", "ova", "ský", "sky", "ek", "ik", "čková", "ckova")
SLOVAK_SURNAME_SUFFIXES = ("ová", "ova", "ský", "ska", "ík", "ik")

LITHUANIAN_SURNAME_SUFFIXES = (
    "aitis", "aitė", "aite", "eika", "auskas", "auskienė", "auskiene",
    "evičius", "evicius", "ienė", "iene", "ėnas", "enas", "elis"
)

LATVIAN_SURNAME_SUFFIXES = ("iņš", "ins", "nieks", "āns", "ans", "ens", "is", "us")

ESTONIAN_SURNAME_SUFFIXES = ("soo", "maa", "mägi", "magi")

FINNISH_SURNAME_SUFFIXES = ("nen", "la", "lä", "mäki", "maki", "vaara", "kari", "järvi", "jarvi")

DANISH_SURNAME_SUFFIXES = ("sen",)

SWEDISH_SURNAME_SUFFIXES = (
    "sson", "gren", "berg", "ström", "strom", "qvist", "kvist", "lund", "lind"
)

SLOVENIAN_SURNAME_SUFFIXES = ("ič", "ic", "nik", "šek", "sek", "ar", "ec")

CROATIAN_SURNAME_SUFFIXES = ("ić", "ic", "ović", "ovic", "ević", "evic")

PORTUGUESE_SURNAME_SUFFIXES = ("eiro", "eira")

SPANISH_SURNAME_SUFFIXES = ("ez", "és")

ITALIAN_SURNAME_SUFFIXES = (
    "etti", "etto", "ini", "ino", "elli", "ello", "oni", "one", "ucci",
    "icci", "otti", "otto", "ari", "aro", "ato", "uto"
)

DUTCH_SURNAME_PREFIXES = ("van ", "van de ", "van den ", "van der ", "ter ", "te ")
DUTCH_SURNAME_SUFFIXES = ("stra", "ma", "klerk", "boer", "bakker", "visser", "smit", "dijk")

GERMAN_SURNAME_SUFFIXES = (
    "winkel", "beerenwinkel", "mann", "stein", "berg", "bauer", "schmidt", "müller",
    "mueller", "weber", "schneider", "fischer", "meyer", "wagner", "becker",
    "hoffmann", "schäfer", "schaefer", "koch", "richter", "klein", "wolf",
    "schröder", "schroeder", "neumann", "schwarz", "zimmermann", "braun",
    "krüger", "krueger", "hartmann", "lange", "schmitt", "werner", "krause",
    "meier", "sommer", "vogel", "keller", "günther", "guenther", "berger",
    "baum", "bach", "dorf", "burg", "haus", "feld", "wald", "thal", "tal",
    "land", "strauss", "strauß", "beck", "hoff", "burchard", "schulze",
    "voigt", "lehmann", "köhler", "koehler", "herrmann", "walter", "mayer"
)
GERMAN_SURNAME_PREFIXES = ("von ", "vom ", "zu ", "auf ")

FRENCH_SURNAME_SUFFIXES = (
    "eau", "eaux", "ier", "ard", "ault", "auld", "oux", "ac", "el", "ot",
    "gube", "legube", "pont", "dupont", "mont", "court", "ville", "bois"
)
FRENCH_SURNAME_PREFIXES = ("de la ", "du ", "des ", "d'")

IRISH_SURNAME_PREFIXES = ("o'", "ó ", "mac ", "mc", "ní ", "nic ")

# ----------------- COMMON SURNAMES LISTS -----------------
SPANISH_SURNAMES: Set[str] = {
    "garcia", "garcía", "rodriguez", "rodríguez", "gonzalez", "gonzález",
    "fernandez", "fernández", "lopez", "lópez", "martinez", "martínez",
    "sanchez", "sánchez", "perez", "pérez", "gomez", "gómez", "martin", "martín",
    "jimenez", "jiménez", "ruiz", "hernandez", "hernández", "diaz", "díaz",
    "moreno", "alvarez", "álvarez", "romero", "alonso", "gutierrez", "gutiérrez",
    "navarro", "torres", "dominguez", "domínguez", "vazquez", "vázquez",
    "ramos", "gil", "ramirez", "ramírez", "serrano", "blanco", "molina", "morales"
}

PORTUGUESE_SURNAMES: Set[str] = {
    "silva", "santos", "ferreira", "oliveira", "sousa", "souza", "costa",
    "pereira", "rodrigues", "almeida", "nascimento", "alves", "carvalho",
    "ribeiro", "pinto", "marques", "teixeira", "moreira", "correia", "mendes",
    "lopes", "soares", "vieira", "monteiro", "cardoso", "rocha", "neves", "coelho"
}

HUNGARIAN_SURNAMES: Set[str] = {
    "szabó", "szabo", "kovács", "kovacs", "tóth", "toth", "nagy", "varga",
    "horváth", "horvath", "molnár", "molnar", "németh", "nemeth", "farkas",
    "balogh", "papp", "takács", "takacs", "juhász", "juhasz", "lakatos", "mészáros", "meszaros"
}

CZECH_SURNAMES: Set[str] = {
    "novák", "novak", "svoboda", "novotný", "novotny", "dvořák", "dvorak",
    "černý", "cerny", "procházka", "prochazka", "kučera", "kucera", "veselý", "vesely",
    "horák", "horak", "němec", "nemec", "marek", "pospíšil", "pospisil", "pokorný", "pokorny"
}

SLOVAK_SURNAMES: Set[str] = {
    "horváth", "kováč", "kovac", "varga", "tóth", "nagy", "baláž", "balaz",
    "szabó", "molnár", "lukáč", "lukac", "kučera", "polák", "polak"
}

MALTESE_SURNAMES: Set[str] = {
    "borg", "camilleri", "vella", "farrugia", "bonnici", "spiteri", "mifsud",
    "azzopardi", "galea", "cassar", "zammit", "grech", "caruana", "attard",
    "muscat", "schembri", "abela", "pace", "falzon", "agius", "scicluna", "busuttil", "fenech"
}

IRISH_SURNAMES: Set[str] = {
    "murphy", "kelly", "o'sullivan", "walsh", "o'brien", "byrne",
    "ryan", "o'connor", "o'neill", "reilly", "doyle", "mccarthy", "gallagher",
    "doherty", "kennedy", "lynch", "murray", "quinn", "connolly"
}

ESTONIAN_SURNAMES: Set[str] = {
    "tamm", "saar", "sepp", "mägi", "magi", "kallas", "kask", "kukk", "rebane",
    "ilves", "pärn", "parn", "koppel", "luik", "kaasik", "raudsepp"
}

LATVIAN_SURNAMES: Set[str] = {
    "bērziņš", "berzins", "kalniņš", "kalnins", "ozoliņš", "ozolins", "jansons",
    "ozols", "liepiņš", "liepins", "krūmiņš", "krumins", "balodis", "eglītis", "eglitis"
}

LITHUANIAN_SURNAMES: Set[str] = {
    "kazlauskas", "petrauskas", "jankauskas", "stankevičius", "stankevicius",
    "vasiliauskas", "žukauskas", "zukauskas", "butkus", "paulauskas"
}

ROMANIAN_SURNAMES: Set[str] = {
    "popa", "popescu", "radu", "ionescu", "dumitru", "stoica", "stan",
    "gheorghe", "rusu", "munteanu", "matei", "constantin", "şerban", "serban", "dobre", "barbu"
}

CROATIAN_SURNAMES: Set[str] = {
    "horvat", "kovačević", "kovacevic", "babić", "babic", "marić", "maric",
    "jurić", "juric", "kovačić", "kovacic", "vuković", "vukovic",
    "knežević", "knezevic", "marković", "markovic", "petrović", "petrovic", "matić", "matic", "tomić", "tomic"
}

SLOVENIAN_SURNAMES: Set[str] = {
    "kovačič", "kovacic", "krajnc", "zupan", "potočnik", "potocnik",
    "mlakar", "kos", "vidmar", "golob", "turk", "božič", "bozic", "zupanc"
}

# ----------------- FIRST NAMES DICTIONARIES -----------------
TURKISH_FIRST_NAMES: Set[str] = {
    "ahmet", "mehmet", "mustafa", "ali", "ayse", "ayşe", "fatma", "emre", "can",
    "burak", "zeynep", "elif", "selin", "murat", "hakan", "ozan", "ömer", "omer",
    "cem", "deniz", "eren", "tolga", "berk", "kaan", "onur", "baris", "barış",
    "oguz", "oğuz", "volkan", "serkan", "kerem", "arzu", "ebru", "duygu", "gamze",
    "derya", "pinar", "pınar", "damla", "yasemin", "sinem", "didem", "gizem",
    "irem", "hande", "eda", "sevgi", "melis", "büşra", "busra", "ezgi", "tugba",
    "tuğba", "sema", "esra", "asli", "aslı", "burcu", "merve", "hilal", "betul",
    "betül", "ceyda", "berna", "selma", "sevil", "nihal", "gulsah", "gülşah",
    "ozgur", "özgür", "koray", "ulas", "ulaş", "firat", "fırat", "alper", "levent",
    "metin", "orhan", "caglar", "çağlar", "ercan", "tarkan", "tuncay", "bora",
    "yusuf", "ibrahim", "ismail", "huseyin", "hüseyin", "hasan", "kemal", "engin",
    "sinan", "sedat", "taner", "timur", "tayfun", "utku", "yasin", "zafer",
    "ferhat", "selcuk", "selçuk", "serdar", "suat", "tarik", "tarık", "vedat",
    "yavuz", "alp", "atilla", "batu", "batuhan", "bilal", "cihan", "devrim",
    "doruk", "emrah", "faruk", "fatih", "furkan", "gokhan", "gökhan", "guney",
    "güney", "halil", "harun", "haydar", "ilker", "irfan", "kadir", "mahmut",
    "mesut", "mithat", "necip", "nihat", "oguzhan", "oğuzhan", "rasim", "remzi",
    "rıza", "riza", "sabri", "sadi", "salih", "sami", "samet", "sefa", "sukru",
    "şükrü", "tahir", "ugur", "uğur", "umut", "veysel", "yigit", "yiğit"
}

GREEK_FIRST_NAMES: Set[str] = {
    "nikolaos", "nikos", "georgios", "giorgos", "ioannis", "giannis", "dimitrios",
    "dimitris", "konstantinos", "kostas", "panagiotis", "vasileios", "vasilis",
    "christos", "athanasios", "michail", "michalis", "evangelos", "spyridon",
    "alexandros", "antonios", "eleni", "aikaterini", "vasiliki",
    "angeliki", "georgia", "dimitra", "ioanna", "konstantina", "paraskevi"
}

BULGARIAN_FIRST_NAMES: Set[str] = {
    "dimitar", "petar", "hristo", "todor", "vasil", "borislav", "aleksandar",
    "desislava", "gergana", "radostina"
}

POLISH_FIRST_NAMES: Set[str] = {
    "piotr", "krzysztof", "andrzej", "tomasz", "paweł", "pawel", "michał",
    "michal", "marcin", "jakub", "łukasz", "lukasz", "grzegorz",
    "mateusz", "wojciech", "mariusz", "dariusz", "zbigniew", "maciej",
    "katarzyna", "małgorzata", "malgorzata", "agnieszka", "krystyna", "elżbieta", "elzbieta"
}

HUNGARIAN_FIRST_NAMES: Set[str] = {
    "lászló", "laszlo", "istván", "istvan", "józsef", "jozsef", "jános", "janos",
    "zoltán", "zoltan", "sándor", "sandor", "ferenc", "gábor", "gabor", "attila",
    "tamás", "tamas", "tibor", "andrás", "andras", "csaba", "erzsébet"
}

CZECH_FIRST_NAMES: Set[str] = {
    "jiří", "jiri", "zdeněk", "zdenek", "františek", "frantisek",
    "václav", "vaclav", "jaroslav", "kateřina"
}

SLOVAK_FIRST_NAMES: Set[str] = {
    "jozef", "branislav", "pavol", "juraj", "ladislav", "katarína", "katarina"
}

ROMANIAN_FIRST_NAMES: Set[str] = {
    "andrei", "alexandru", "stefan", "ștefan", "marian", "marius", "bogdan",
    "gheorghe", "vasile", "radu", "florin", "roxana", "daniela"
}

LITHUANIAN_FIRST_NAMES: Set[str] = {
    "jonas", "vytautas", "mindaugas", "gediminas", "mantas", "artūras", "arturas",
    "darius", "saulius", "rasa", "daiva", "dalia", "jurgita"
}

LATVIAN_FIRST_NAMES: Set[str] = {
    "jānis", "janis", "andris", "juris", "edgars", "māris", "maris", "kaspars",
    "aivars", "artūrs", "arturs", "līga", "liga", "ilze", "dace", "inese"
}

ESTONIAN_FIRST_NAMES: Set[str] = {
    "mart", "jüri", "juri", "toomas", "margus", "peeter",
    "rein", "indrek", "tarmo", "kadri", "marju", "piret"
}

FINNISH_FIRST_NAMES: Set[str] = {
    "matti", "juha", "kari", "antti", "mikko", "heikki", "jari", "ville",
    "aleksi", "pekka", "jussi", "hannu", "erkki", "seppo", "veikko",
    "leena", "tiina", "sari", "pirkko", "paula", "minna", "katariina", "aino"
}

DANISH_FIRST_NAMES: Set[str] = {
    "mikkel", "mads", "rasmus", "søren", "soren",
    "morten", "flemming", "bjarne", "torben", "freja"
}

SWEDISH_FIRST_NAMES: Set[str] = {
    "anders", "erik", "per", "magnus", "henrik", "fredrik", "gustav", "oskar",
    "björn", "bjorn", "sven", "leif", "nils", "arne", "astrid", "linnea", "saga", "ebba"
}

CROATIAN_FIRST_NAMES: Set[str] = {
    "marko", "josip", "ante", "tomislav", "stjepan", "lucija"
}

SLOVENIAN_FIRST_NAMES: Set[str] = {
    "nejc", "žan", "zan", "rok", "jaka", "matic", "anže", "anze", "nika"
}

PORTUGUESE_FIRST_NAMES: Set[str] = {
    "joao", "joão", "tiago", "diogo", "goncalo", "gonçalo", "rui", "inês", "ines",
    "beatriz", "catarina", "mariana"
}

SPANISH_FIRST_NAMES: Set[str] = {
    "javier", "alvaro", "álvaro", "ignacio", "gonzalo", "raul", "raúl",
    "rafael", "rocio", "rocío", "pilar"
}

ITALIAN_FIRST_NAMES: Set[str] = {
    "marco", "giovanni", "francesco", "matteo", "luca", "alessandro", "giuseppe",
    "lorenzo", "leonardo", "mattia", "gabriele", "riccardo", "davide",
    "federico", "simone", "stefano", "fabio", "gianluca", "paolo",
    "luigi", "angelo", "salvatore", "daniele", "massimo", "vincenzo", "alessio",
    "giorgio", "enrico", "michele", "fabrizio", "chiara", "francesca", "giulia",
    "alessia", "martina", "valentina", "silvia", "elisa", "eleonora"
}

DUTCH_FIRST_NAMES: Set[str] = {
    "pieter", "cornelis", "hendrik", "willem", "gerrit",
    "klaas", "adriaan", "jacobus", "arjen", "jeroen", "thijs", "daan",
    "bram", "sem", "luuk", "sander", "bas", "maarten", "koen", "stijn",
    "tess", "lieke", "sanne", "anouk", "femke", "fleur", "lotte", "marit"
}

GERMAN_FIRST_NAMES: Set[str] = {
    "niko", "nico", "hans", "wolfgang", "jürgen", "juergen", "klaus", "uwe",
    "dieter", "günther", "guenther", "werner", "gerhard", "helmut", "manfred",
    "heinz", "horst", "walter", "bernd", "joachim", "jörg", "joerg", "rolf",
    "ralf", "thorsten", "torsten", "olaf", "rainer", "holger", "florian",
    "sebastian", "maximilian", "felix", "moritz", "niklas", "philipp", "tobias",
    "ursula", "monika", "petra", "sabine", "renate", "helga", "karin", "ingrid",
    "brigitte", "susanne", "elke", "gisela", "christa", "birgit", "angelika",
    "heike", "astrid", "dagmar", "anja", "katja", "tanja", "stefanie", "stephanie",
    "franz", "friedrich", "heinrich", "otto", "ludwig", "wilhelm", "ernst",
    "nikolaus", "albrecht", "dietrich", "gernot", "hartmut"
}

FRENCH_FIRST_NAMES: Set[str] = {
    "gaelle", "gaëlle", "gael", "gaël", "philippe", "bernard", "jacques",
    "christophe", "nicolas", "laurent", "julien", "stephane", "stéphane",
    "sebastien", "sébastien", "frederic", "frédéric", "olivier", "pascal",
    "dominique", "vincent", "thierry", "guillaume", "antoine", "francois",
    "françois", "mathieu", "matthieu", "maxime", "clement", "clément",
    "romain", "damien", "jerome", "jérôme", "benoit", "benoît", "cedric",
    "cédric", "quentin", "sylvie", "francoise", "françoise", "valerie", "valérie",
    "sandrine", "celine", "céline", "aurelie", "aurélie", "virginie",
    "emilie", "émilie", "laetitia", "laëtitia", "elodie", "élodie",
    "chloe", "chloé", "amelie", "amélie", "delphine", "christelle",
    "veronique", "véronique", "helene", "hélène", "severine", "séverine",
    "agnes", "agnès", "genevieve", "geneviève", "chantal", "yves", "rene", "rené",
    "etienne", "étienne", "emile", "émile", "herve", "hervé", "didier", "arnaud", "yann"
}

IRISH_FIRST_NAMES: Set[str] = {
    "sean", "seán", "liam", "conor", "cian", "cillian", "declan", "padraig", "pádraig",
    "eoin", "cormac", "oisin", "oisín", "niall", "ronan", "donal", "cathal",
    "aoife", "saoirse", "ciara", "niamh", "roisin", "róisín", "aisling", "maeve", "sinéad", "sinead", "orla"
}

MALTESE_FIRST_NAMES: Set[str] = {
    "joseph", "carmen"
}

ENGLISH_FIRST_NAMES: Set[str] = {
    "john", "james", "david", "robert", "william", "richard", "charles", "george",
    "oliver", "jack", "harry", "jacob", "noah", "mason", "ethan", "logan",
    "jackson", "aiden", "henry", "samuel", "benjamin", "arthur", "freddie",
    "emily", "jessica", "sophia", "olivia", "isabella", "charlotte", "amelia",
    "mary", "jennifer", "linda", "elizabeth", "susan", "ashley", "kimberly",
    "sarah", "karen", "nancy", "lisa", "betty", "margaret", "donald", "steven",
    "kenneth", "joshua", "kevin", "brian", "anthony", "ronald", "timothy",
    "jason", "jeffrey", "ryan", "gary", "nicholas"
}


# ----------------- NORMALIZATION & DETECTION ENGINE -----------------
def normalize_token(text: str) -> str:
    """Strip, clean and lowercase a name token."""
    if not text:
        return ""
    return text.strip().lower()


def detect_nationality_and_language(
    first_name: str,
    last_name: str = "",
    context_text: str = ""
) -> Tuple[str, str]:
    """
    Detect expert's nationality and native language across all 24 EU member state languages + Turkish.
    Two-phase approach:
    Phase 1: High-confidence surname, distinctive suffix/prefix, and unique alphabet detection.
    Phase 2: Specific given-name detection if surname did not match.
    """
    fn = (first_name or "").strip()
    ln = (last_name or "").strip()
    full = f"{fn} {ln}".strip()
    ctx = (context_text or "").strip().lower()

    fn_norm = normalize_token(fn)
    ln_norm = normalize_token(ln)

    fn_tokens = [t.lower() for t in re.split(r"[\s\-\_]+", fn) if t.strip()]
    ln_tokens = [t.lower() for t in re.split(r"[\s\-\_]+", ln) if t.strip()]

    # ==============================================================
    # PHASE 1: SURNAMES, DISTINCTIVE PREFIXES / SUFFIXES & ALPHABETS
    # ==============================================================

    # 1. TÜRKÇE (TR)
    if any(ch in TURKISH_CHARS for ch in full):
        return ("Türkiye", "TR")
    if ln_norm.endswith(TURKISH_SURNAME_SUFFIXES) or any(t.endswith(TURKISH_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Türkiye", "TR")

    # 2. YUNANİSTAN / KIBRIS (EL)
    if any(ch in GREEK_CHARS for ch in full):
        return ("Yunanistan / Kıbrıs", "EL")
    if ln_norm.endswith(GREEK_SURNAME_SUFFIXES) or any(t.endswith(GREEK_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Yunanistan / Kıbrıs", "EL")

    # 3. BULGARİSTAN (BG)
    if any(ch in CYRILLIC_CHARS for ch in full):
        return ("Bulgaristan", "BG")
    if ln_norm.endswith(BULGARIAN_SURNAME_SUFFIXES):
        return ("Bulgaristan", "BG")

    # 4. MALTA (MT)
    if any(ch in MALTESE_CHARS for ch in full):
        return ("Malta", "MT")
    if ln_norm in MALTESE_SURNAMES or any(t in MALTESE_SURNAMES for t in ln_tokens):
        return ("Malta", "MT")

    # 5. POLONYA (PL)
    if any(ch in POLISH_CHARS for ch in full):
        return ("Polonya", "PL")
    if ln_norm.endswith(POLISH_SURNAME_SUFFIXES) or any(t.endswith(POLISH_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Polonya", "PL")

    # 6. MACARİSTAN (HU)
    if any(ch in HUNGARIAN_UNIQUE_CHARS for ch in full):
        return ("Macaristan", "HU")
    if ln_norm in HUNGARIAN_SURNAMES or any(t in HUNGARIAN_SURNAMES for t in ln_tokens):
        return ("Macaristan", "HU")
    if ln_norm.endswith(HUNGARIAN_SURNAME_SUFFIXES) or any(t.endswith(HUNGARIAN_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Macaristan", "HU")

    # 7. ÇEKYA (CS) vs SLOVAKYA (SK)
    if any(ch in SLOVAK_UNIQUE_CHARS for ch in full):
        return ("Slovakya", "SK")
    if ln_norm in SLOVAK_SURNAMES or any(t in SLOVAK_SURNAMES for t in ln_tokens):
        return ("Slovakya", "SK")
    if any(ch in CZECH_UNIQUE_CHARS for ch in full):
        return ("Çekya", "CS")
    if ln_norm in CZECH_SURNAMES or any(t in CZECH_SURNAMES for t in ln_tokens):
        return ("Çekya", "CS")
    if ln_norm.endswith(CZECH_SURNAME_SUFFIXES) or any(t.endswith(CZECH_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Çekya", "CS")

    # 8. ROMANYA (RO)
    if any(ch in ROMANIAN_CHARS for ch in full):
        return ("Romanya", "RO")
    if ln_norm in ROMANIAN_SURNAMES or any(t in ROMANIAN_SURNAMES for t in ln_tokens):
        return ("Romanya", "RO")
    if ln_norm.endswith(ROMANIAN_SURNAME_SUFFIXES) or any(t.endswith(ROMANIAN_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Romanya", "RO")

    # 9. BALTIK: LİTVANYA (LT), LETONYA (LV), ESTONYA (ET)
    if any(ch in LITHUANIAN_CHARS for ch in full):
        return ("Litvanya", "LT")
    if ln_norm in LITHUANIAN_SURNAMES or ln_norm.endswith(LITHUANIAN_SURNAME_SUFFIXES):
        return ("Litvanya", "LT")

    if any(ch in LATVIAN_CHARS for ch in full):
        return ("Letonya", "LV")
    if ln_norm in LATVIAN_SURNAMES or ln_norm.endswith(LATVIAN_SURNAME_SUFFIXES):
        return ("Letonya", "LV")

    if "õ" in full:
        return ("Estonya", "ET")
    if ln_norm in ESTONIAN_SURNAMES or ln_norm.endswith(ESTONIAN_SURNAME_SUFFIXES):
        return ("Estonya", "ET")

    # 10. HOLLANDA / FLEMENKÇE (NL)
    if ln_norm.startswith(DUTCH_SURNAME_PREFIXES) or any(t.startswith(DUTCH_SURNAME_PREFIXES) for t in ln_tokens):
        return ("Hollanda / Belçika", "NL")
    if ln_norm.endswith(DUTCH_SURNAME_SUFFIXES):
        return ("Hollanda / Belçika", "NL")

    # 11. SCANDINAVIA: DANİMARKA (DA), İSVEÇ (SV), FİNLANDİYA (FI)
    if ln_norm.endswith(FINNISH_SURNAME_SUFFIXES) or any(t.endswith(FINNISH_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Finlandiya", "FI")

    if any(ch in DANISH_CHARS for ch in full):
        return ("Danimarka", "DA")
    if ln_norm.endswith(DANISH_SURNAME_SUFFIXES) and not ln_norm.endswith("sson"):
        return ("Danimarka", "DA")

    if ln_norm.endswith(SWEDISH_SURNAME_SUFFIXES):
        return ("İsveç", "SV")

    # 12. GÜNEY SLAV: HIRVATİSTAN (HR) vs SLOVENYA (SL)
    if any(ch in CROATIAN_CHARS for ch in full):
        return ("Hırvatistan", "HR")
    if ln_norm in CROATIAN_SURNAMES or any(t in CROATIAN_SURNAMES for t in ln_tokens):
        return ("Hırvatistan", "HR")
    if ln_norm.endswith(CROATIAN_SURNAME_SUFFIXES) or any(t.endswith(CROATIAN_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Hırvatistan", "HR")
    if ln_norm in SLOVENIAN_SURNAMES or any(t in SLOVENIAN_SURNAMES for t in ln_tokens):
        return ("Slovenya", "SL")
    if ln_norm.endswith(SLOVENIAN_SURNAME_SUFFIXES):
        return ("Slovenya", "SL")

    # 13. İSPANYOLCA (ES) vs PORTEKİZCE (PT)
    if any(ch in SPANISH_UNIQUE_CHARS for ch in full):
        return ("İspanya", "ES")
    if ln_norm in SPANISH_SURNAMES or any(t in SPANISH_SURNAMES for t in ln_tokens):
        return ("İspanya", "ES")
    if (ln_norm.endswith(SPANISH_SURNAME_SUFFIXES) and len(ln_norm) > 4) or any(t.endswith(SPANISH_SURNAME_SUFFIXES) and len(t) > 4 for t in ln_tokens):
        return ("İspanya", "ES")

    if any(ch in PORTUGUESE_UNIQUE_CHARS for ch in full):
        return ("Portekiz", "PT")
    if ln_norm in PORTUGUESE_SURNAMES or any(t in PORTUGUESE_SURNAMES for t in ln_tokens):
        return ("Portekiz", "PT")
    if ln_norm.endswith(PORTUGUESE_SURNAME_SUFFIXES) or any(t.endswith(PORTUGUESE_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Portekiz", "PT")

    # 14. ALMANCA (DE)
    if any(city in ctx for city in ["zürih", "zurich", "zürich", "bern", "basel", "wien", "vienna", "berlin", "münchen", "munich", "frankfurt", "hamburg", "deutschland", "germany", "austria", "schweiz", "switzerland"]):
        return ("Almanya / Avusturya / İsviçre", "DE")
    if any(ch in GERMAN_UNIQUE_CHARS for ch in full):
        return ("Almanya / Avusturya / İsviçre", "DE")
    if ln_norm.endswith(GERMAN_SURNAME_SUFFIXES) or any(t.endswith(GERMAN_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Almanya / Avusturya / İsviçre", "DE")
    if ln_norm.startswith(GERMAN_SURNAME_PREFIXES):
        return ("Almanya / Avusturya / İsviçre", "DE")

    # 15. FRANSA (FR)
    if any(ch in FRENCH_LIGATURES for ch in full):
        return ("Fransa / Belçika", "FR")
    if ln_norm.startswith(FRENCH_SURNAME_PREFIXES) or any(t.startswith(FRENCH_SURNAME_PREFIXES) for t in ln_tokens):
        return ("Fransa / Belçika", "FR")
    if ln_norm.endswith(FRENCH_SURNAME_SUFFIXES) or any(t.endswith(FRENCH_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("Fransa / Belçika", "FR")

    # 16. İTALYA (IT)
    if ln_norm.endswith(ITALIAN_SURNAME_SUFFIXES) or any(t.endswith(ITALIAN_SURNAME_SUFFIXES) for t in ln_tokens):
        return ("İtalya", "IT")

    # 17. İRLANDA (GA)
    if ln_norm.startswith(IRISH_SURNAME_PREFIXES) or ln_norm in IRISH_SURNAMES:
        return ("İrlanda", "GA")


    # ==============================================================
    # PHASE 2: DISTINCTIVE GIVEN NAMES (FIRST NAMES)
    # ==============================================================
    if fn_norm in TURKISH_FIRST_NAMES or any(t in TURKISH_FIRST_NAMES for t in fn_tokens):
        return ("Türkiye", "TR")

    if fn_norm in GREEK_FIRST_NAMES or any(t in GREEK_FIRST_NAMES for t in fn_tokens):
        return ("Yunanistan / Kıbrıs", "EL")

    if fn_norm in BULGARIAN_FIRST_NAMES or any(t in BULGARIAN_FIRST_NAMES for t in fn_tokens):
        return ("Bulgaristan", "BG")

    if fn_norm in POLISH_FIRST_NAMES or any(t in POLISH_FIRST_NAMES for t in fn_tokens):
        return ("Polonya", "PL")

    if fn_norm in HUNGARIAN_FIRST_NAMES or any(t in HUNGARIAN_FIRST_NAMES for t in fn_tokens):
        return ("Macaristan", "HU")

    if fn_norm in SLOVAK_FIRST_NAMES or any(t in SLOVAK_FIRST_NAMES for t in fn_tokens):
        return ("Slovakya", "SK")

    if fn_norm in CZECH_FIRST_NAMES or any(t in CZECH_FIRST_NAMES for t in fn_tokens):
        return ("Çekya", "CS")

    if fn_norm in ROMANIAN_FIRST_NAMES or any(t in ROMANIAN_FIRST_NAMES for t in fn_tokens):
        return ("Romanya", "RO")

    if fn_norm in LITHUANIAN_FIRST_NAMES or any(t in LITHUANIAN_FIRST_NAMES for t in fn_tokens):
        return ("Litvanya", "LT")

    if fn_norm in LATVIAN_FIRST_NAMES or any(t in LATVIAN_FIRST_NAMES for t in fn_tokens):
        return ("Letonya", "LV")

    if fn_norm in ESTONIAN_FIRST_NAMES or any(t in ESTONIAN_FIRST_NAMES for t in fn_tokens):
        return ("Estonya", "ET")

    if fn_norm in FINNISH_FIRST_NAMES or any(t in FINNISH_FIRST_NAMES for t in fn_tokens):
        return ("Finlandiya", "FI")

    if fn_norm in DANISH_FIRST_NAMES or any(t in DANISH_FIRST_NAMES for t in fn_tokens):
        return ("Danimarka", "DA")

    if fn_norm in SWEDISH_FIRST_NAMES or any(t in SWEDISH_FIRST_NAMES for t in fn_tokens):
        return ("İsveç", "SV")

    if fn_norm in CROATIAN_FIRST_NAMES or any(t in CROATIAN_FIRST_NAMES for t in fn_tokens):
        return ("Hırvatistan", "HR")

    if fn_norm in SLOVENIAN_FIRST_NAMES or any(t in SLOVENIAN_FIRST_NAMES for t in fn_tokens):
        return ("Slovenya", "SL")

    if fn_norm in SPANISH_FIRST_NAMES or any(t in SPANISH_FIRST_NAMES for t in fn_tokens):
        return ("İspanya", "ES")

    if fn_norm in PORTUGUESE_FIRST_NAMES or any(t in PORTUGUESE_FIRST_NAMES for t in fn_tokens):
        return ("Portekiz", "PT")

    if fn_norm in ITALIAN_FIRST_NAMES or any(t in ITALIAN_FIRST_NAMES for t in fn_tokens):
        return ("İtalya", "IT")

    if fn_norm in GERMAN_FIRST_NAMES or any(t in GERMAN_FIRST_NAMES for t in fn_tokens):
        return ("Almanya / Avusturya / İsviçre", "DE")

    if fn_norm in DUTCH_FIRST_NAMES or any(t in DUTCH_FIRST_NAMES for t in fn_tokens):
        return ("Hollanda / Belçika", "NL")

    if fn_norm in FRENCH_FIRST_NAMES or any(t in FRENCH_FIRST_NAMES for t in fn_tokens):
        return ("Fransa / Belçika", "FR")

    if fn_norm in IRISH_FIRST_NAMES or any(t in IRISH_FIRST_NAMES for t in fn_tokens):
        return ("İrlanda", "GA")

    if fn_norm in MALTESE_FIRST_NAMES or any(t in MALTESE_FIRST_NAMES for t in fn_tokens):
        return ("Malta", "MT")

    if fn_norm in ENGLISH_FIRST_NAMES or any(t in ENGLISH_FIRST_NAMES for t in fn_tokens):
        return ("İngiltere / Uluslararası", "EN")

    # Fallback default
    return ("Uluslararası (Varsayılan)", "EN")


def detect_language(first_name: str, last_name: str = "", context_text: str = "") -> str:
    """Wrapper that returns language code."""
    _, lang = detect_nationality_and_language(first_name, last_name, context_text)
    return lang


def re_evaluate_all_expert_languages(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Re-evaluate and update both nationality (ulus) and native language (dil)
    for all experts in SQLite across all 24 EU languages + TR.
    """
    # Ensure 'ulus' column exists
    with conn:
        try:
            conn.execute("ALTER TABLE experts ADD COLUMN ulus TEXT DEFAULT 'Uluslararası'")
        except Exception:
            pass

    cursor = conn.cursor()
    cursor.execute("SELECT id, ad, soyad, uzmanlik FROM experts")
    rows = cursor.fetchall()

    updates = []
    lang_stats = {}
    ulus_stats = {}

    for r in rows:
        exp_id = r[0]
        ad = r[1]
        soyad = r[2]
        uzmanlik = r[3] or ""

        ulus, lang = detect_nationality_and_language(ad, soyad, context_text=uzmanlik)
        lang_stats[lang] = lang_stats.get(lang, 0) + 1
        ulus_stats[ulus] = ulus_stats.get(ulus, 0) + 1
        updates.append((ulus, lang, exp_id))

    with conn:
        conn.executemany("UPDATE experts SET ulus = ?, dil = ? WHERE id = ?", updates)

    return {
        "total": len(rows),
        "languages": lang_stats,
        "nationalities": ulus_stats
    }
