"""
app.py — Servidor Flask para o painel COR de Ocorrências.

Fornece API REST com os dados das planilhas e monitora
automaticamente alterações nos arquivos .xlsx.
"""
import os
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

# Carrega variáveis do arquivo .env
load_dotenv()

# Adiciona o diretório do backend ao path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from excel_reader import carregar_todas_planilhas, PLANILHAS_DIR

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

# --- Cache em memória ---
_dados_cache: list[dict] = []
_stats_cache: dict = {}
_cache_lock = threading.Lock()
_ultimo_refresh: float = 0.0


def refresh_dados():
    """Recarrega os dados das planilhas no cache."""
    global _dados_cache, _stats_cache, _ultimo_refresh
    with _cache_lock:
        _dados_cache, _stats_cache = carregar_todas_planilhas()
        _ultimo_refresh = time.time()
    print(f"[APP] Dados recarregados: {len(_dados_cache)} registros")


def get_dados() -> list[dict]:
    """Retorna a cópia atual do cache (thread-safe)."""
    with _cache_lock:
        return list(_dados_cache)


def get_stats() -> dict:
    """Retorna os stats do cache (thread-safe)."""
    with _cache_lock:
        return dict(_stats_cache)


# ============================================================
# Rotas da API
# ============================================================

@app.route("/api/dados")
def api_dados():
    """Retorna todos os registros de ocorrências."""
    return jsonify(get_dados())


@app.route("/api/stats")
def api_stats():
    """Retorna os indicadores de captura (sidebar) lidos da planilha."""
    stats = get_stats()
    if not stats or not stats.get("registradas", {}).get("months", {}).get("Abril"):
        # Fallback para valores padrão se a planilha não tiver sumários
        return jsonify({
            "registradas": {"label": "Total registradas", "accent": "#F2A93B",
                            "months": {"Abril": 2286, "Maio": 2019, "Junho": 1877}},
            "capturadas": {"label": "Total capturadas por alarmes", "accent": "#33C9B8",
                           "months": {"Abril": 273, "Maio": 472, "Junho": 257}},
            "pctCaptura": {"label": "% de captura", "accent": "#4C8DF0",
                           "months": {"Abril": 11.94, "Maio": 23.38, "Junho": 13.69}},
            "recebidas": {"label": "% recebidas (não capturadas)", "accent": "#7E8FA6",
                          "months": {"Abril": 88.05, "Maio": 76.62, "Junho": 86.30}},
        })
    return jsonify(stats)


@app.route("/api/refresh", methods=["POST"])
def api_refresh():
    """Força o recarregamento imediato dos dados da planilha."""
    refresh_dados()
    return jsonify({"ok": True, "count": len(get_dados())})


@app.route("/api/status")
def api_status():
    """Status do servidor: quantidade de registros e timestamp do último refresh."""
    return jsonify({
        "count": len(get_dados()),
        "ultimo_refresh": _ultimo_refresh,
        "planilhas_dir": str(PLANILHAS_DIR),
    })


@app.route("/health")
def health():
    """Health check para Render."""
    return jsonify({"status": "ok", "count": len(get_dados())})


# ============================================================
# Servir arquivos estáticos do frontend
# ============================================================

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


# ============================================================
# Watcher: monitora alterações nos arquivos .xlsx
# ============================================================

class PlanilhaWatcher(threading.Thread):
    """Thread que verifica periodicamente se os arquivos .xlsx mudaram."""

    def __init__(self, intervalo_segundos=5):
        super().__init__(daemon=True)
        self.intervalo = intervalo_segundos
        self._ultimos_mtimes: dict[str, float] = {}
        self._inicializar()

    def _inicializar(self):
        if PLANILHAS_DIR.exists():
            for arq in PLANILHAS_DIR.glob("*.xlsx"):
                self._ultimos_mtimes[str(arq)] = arq.stat().st_mtime

    def _houve_mudanca(self) -> bool:
        if not PLANILHAS_DIR.exists():
            return False
        atuais = {}
        for arq in PLANILHAS_DIR.glob("*.xlsx"):
            atuais[str(arq)] = arq.stat().st_mtime

        # Detecta arquivos novos, removidos ou modificados
        todos = set(self._ultimos_mtimes.keys()) | set(atuais.keys())
        for path in todos:
            mtime_antigo = self._ultimos_mtimes.get(path, 0)
            mtime_novo = atuais.get(path, 0)
            if mtime_novo != mtime_antigo:
                return True
        return False

    def run(self):
        print(f"[WATCHER] Monitorando {PLANILHAS_DIR} a cada {self.intervalo}s...")
        while True:
            time.sleep(self.intervalo)
            try:
                if self._houve_mudanca():
                    print("[WATCHER] 🔄 Mudança detectada nas planilhas! Recarregando...")
                    refresh_dados()
                    # Atualiza o registro de mtimes
                    self._inicializar()
            except Exception as e:
                print(f"[WATCHER] Erro: {e}")


# ============================================================
# Inicialização
# ============================================================

if __name__ == "__main__":
    # Carrega dados iniciais
    print("[APP] Iniciando servidor COR — Painel de Ocorrências...")
    refresh_dados()

    # Inicia o watcher em background
    watcher = PlanilhaWatcher(intervalo_segundos=5)
    watcher.start()

    # Inicia o servidor Flask
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "0") == "1"
    print(f"[APP] Servidor rodando em http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
