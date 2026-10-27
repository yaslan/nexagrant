#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d ".venv" ]; then
    echo "Sanal ortam (.venv) oluşturuluyor..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

echo "🚀 FonBridge Uzman Ulaşım Asistanı Başlatılıyor..."
echo "Tarayıcınızda açılıyor: http://localhost:8501"
.venv/bin/streamlit run app.py --server.port 8501
