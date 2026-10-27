from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"
BACKUP_DIR = DATA_DIR / "backups"

DB_PATH = DATA_DIR / "fonbridge.db"
ERROR_REPORT_PATH = OUTPUT_DIR / "hata_raporu.csv"

# Make sure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

# Default Business Settings
DEFAULT_DAILY_LIMIT = 50
DEFAULT_FOLLOWUP_DAYS = 7

# Status constants
STATUS_BEKLIYOR = "Bekliyor"
STATUS_GONDERILDI = "Gönderildi"
STATUS_YANIT_GELDI = "Yanıt geldi"
STATUS_ILGILENMIYOR = "İlgilenmiyor"
STATUS_BIR_DAHA_YAZMA = "Bir daha yazma"

ALL_STATUSES = [
    STATUS_BEKLIYOR,
    STATUS_GONDERILDI,
    STATUS_YANIT_GELDI,
    STATUS_ILGILENMIYOR,
    STATUS_BIR_DAHA_YAZMA,
]

# Role constants
ROLE_YONETICI = "yonetici"
ROLE_UYE = "uye"
