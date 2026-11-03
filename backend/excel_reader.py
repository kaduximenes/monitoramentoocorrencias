"""
excel_reader.py — Lê as planilhas de monitoramento de alarmes COR
e extrai os dados estruturados.

O layout é detectado automaticamente, sem depender de posições fixas:
  * a linha de cabeçalho é localizada procurando as colunas "Data", "Alarmes
    utilizados", "Ocorrência", "Equipe", "Endereço" e "Agência Validadora".
    Assim funcionam tanto o arquivo consolidado (cabeçalho na linha 3, colunas
    B–G) quanto as planilhas mensais (cabeçalho na linha 8, com "QTE" em A);
  * os meses do bloco de sumário são lidos dos rótulos (ABRIL, MAIO, ...), então
    um mês novo lançado na planilha aparece sozinho no painel.

Arquivos diferentes podem conter os mesmos registros (consolidado + mensal).
`carregar_todas_planilhas()` mantém apenas uma cópia de cada ocorrência.
"""
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional

import openpyxl


# --- Caminho da pasta de planilhas ---
PLANILHAS_DIR = Path(__file__).resolve().parent.parent / "Planilhas"

# Ordem canônica usada para ordenar os meses no painel
MESES_CANONICOS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

# Rótulos aceitos no bloco de sumário -> nome canônico do mês
MESES_ALIASES = {
    "jan": "Janeiro", "janeiro": "Janeiro",
    "fev": "Fevereiro", "fevereiro": "Fevereiro",
    "mar": "Março", "marco": "Março",
    "abr": "Abril", "abril": "Abril",
    "mai": "Maio", "maio": "Maio",
    "jun": "Junho", "junho": "Junho",
    "jul": "Julho", "julho": "Julho",
    "ago": "Agosto", "agosto": "Agosto",
    "set": "Setembro", "setembro": "Setembro",
    "out": "Outubro", "outubro": "Outubro",
    "nov": "Novembro", "novembro": "Novembro",
    "dez": "Dezembro", "dezembro": "Dezembro",
}

MESES_MAP = {
    4: "Abril", 5: "Maio", 6: "Junho",
    7: "Julho", 8: "Agosto", 9: "Setembro",
    10: "Outubro", 11: "Novembro", 12: "Dezembro",
    1: "Janeiro", 2: "Fevereiro", 3: "Março",
}

# Nomes de coluna aceitos no cabeçalho da tabela de ocorrências
COLUNAS_ALIASES = {
    "data": ("data",),
    "alarmes": ("alarmes utilizados", "alarmes"),
    "ocorrencia": ("ocorrencia",),
    "equipe": ("equipe",),
    "endereco": ("endereco",),
    "agencia": ("agencia validadora", "agencia"),
    "qte": ("qte", "qtd", "qtde"),
}

_KEYWORDS_SUMARIO = ("registradas", "capturadas", "capturada", "recebidas")


def parse_data(valor) -> Optional[datetime]:
    """Converte valor de data (datetime ou string) para datetime."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor
    s = str(valor).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def classificar_categoria(ocorrencia: str) -> str:
    """Classifica a ocorrência em uma categoria padronizada."""
    if not ocorrencia:
        return "Outros / não classificado"
    o = str(ocorrencia).strip().lower()

    if re.match(r'ac\b', o) or 'ac ' in o or 'acidente' in o:
        return "Acidente de trânsito"
    if 'capotamento' in o:
        return "Capotamento de veículo"
    if 'atropelamento' in o:
        return "Atropelamento"
    if 'enguiço' in o or 'enguico' in o:
        return "Enguiço de veículo"
    if ('operacao' in o or 'operaçao' in o) and 'policial' in o:
        return "Operação Policial"
    if 'policia' in o or 'polícia' in o:
        return "Operação Policial"
    if 'manutenção' in o or 'manutencao' in o:
        return "Manutenção na via"
    if 'obra' in o and ('via' in o or 'pista' in o or 'asfalto' in o):
        return "Obra na via"
    if 'queda' in o and ('moto' in o or 'veiculo' in o or 'veículo' in o):
        return "Queda de moto/veículo"
    if 'queda' in o and 'carga' in o:
        return "Queda de carga na via"
    if 'incendio' in o or 'incêndio' in o:
        return "Incêndio"
    if 'cbmerj' in o:
        return "Ocorrência CBMERJ"
    if 'semáforo' in o or 'semaforo' in o:
        return "Semáforo apagado"
    if 'evento' in o or 'manifestação' in o or 'manifestacao' in o:
        return "Evento/Manifestação"
    if 'risco' in o or 'obstáculo' in o or 'obstaculo' in o:
        return "Risco/obstáculo na via"

    return "Outros / não classificado"


def classificar_zona(endereco: str, ocorrencia: str = "") -> str:
    """Tenta classificar a zona da cidade a partir do endereço."""
    if not endereco:
        return "Não identificado"
    e = str(endereco).strip().lower()

    zona_sul = [
        'leblon', 'ipanema', 'copacabana', 'botafogo', 'flamengo', 'laranjeiras',
        'lagoa', 'gávea', 'gavea', 'jardim botânico', 'jardim botanico',
        'são conrado', 'sao conrado', 'humaitá', 'humaita', 'cosme velho',
        'urca', 'leme', 'catete', 'glória', 'gloria', 'santa teresa',
        'padre leonel franca', 'borges de medeiros', 'epitácio pessoa',
        'barra da tijuca', 'recreio', 'joá', 'joa',
    ]
    zona_norte = [
        'tijuca', 'méier', 'meier', 'madureira', 'penha',
        'são cristóvão', 'sao cristovao', 'maracanã', 'maracana',
        'vila isabel', 'andaraí', 'andarai', 'grajaú', 'grajau',
        'caju', 'olaria', 'bonsucesso', 'ramos', 'del castilho',
        'inhuma', 'higienópolis', 'av. dom helder câmara', 'dom helder camara',
        'fundão', 'fundao', 'ilha do governador', 'galeão', 'galeao',
        'pastor martin luther king', 'cascadura', 'pilares', 'cavalcanti',
        'engenho novo', 'av brasil', 'passarela',
    ]
    zona_oeste = [
        'jacarepaguá', 'jacarepagua', 'guaratiba', 'santa cruz',
        'realengo', 'padre miguel', 'senador camará', 'camara',
        'senador vasconcelos', 'av. dom joão vi', 'dom joao vi',
        'estrada de jacarépagua', 'estrada de jacarepagua',
        'curicica', 'taquara', 'tanque', 'rio centro',
        'cesário de melo', 'cesario de melo', 'campinho',
        'bangu', 'vargem',
    ]
    centro_list = [
        'centro', 'lapa', 'rio comprido', 'estácio', 'estacio',
        'cidade nova', 'praça mauá', 'praca maua', 'praça xv',
        'praca xv', 'castelo', 'cinelândia', 'cinelandia',
        'presidente vargas', 'rio branco', 'saara',
        'paço imperial', 'paco imperial', 'portuária', 'portuaria',
        'gamboa', 'saúde', 'saude', 'francisco bicalho',
    ]

    for pat in zona_sul:
        if pat in e:
            return "Zona Sul"
    for pat in zona_norte:
        if pat in e:
            return "Zona Norte"
    for pat in zona_oeste:
        if pat in e:
            return "Zona Oeste"
    for pat in centro_list:
        if pat in e:
            return "Centro"

    # Fallback pela ocorrência
    if ocorrencia:
        o_lower = str(ocorrencia).lower()
        for pat in zona_sul:
            if pat in o_lower:
                return "Zona Sul"
        for pat in zona_norte:
            if pat in o_lower:
                return "Zona Norte"

    return "Não identificado"


def simplificar_fonte(raw: Optional[str]) -> str:
    """Classifica a coluna 'Alarmes utilizados' em categorias de fonte."""
    if not raw:
        return "Não informado"
    a = str(raw).lower()
    if "tixxi" in a and ("map" in a or "google" in a):
        return "Google Maps + Tixxi"
    if "tixxi" in a:
        return "Tixxi"
    if "cbmerj" in a:
        return "CBMERJ"
    if "google" in a or "map" in a:
        return "Google Maps"
    if "hxgn" in a or "hxg" in a:
        return "HxGN"
    if "jarvis" in a:
        return "Jarvis"
    if "videowall" in a or "video wall" in a:
        return "Videowall"
    if "wazer" in a:
        return "Wazer"
    return "Outra fonte"


# ============================================================
# Detecção de layout
# ============================================================

def _normalizar(valor) -> str:
    """Normaliza texto para comparação (minúsculas, sem acentos, espaços simples)."""
    if valor is None:
        return ""
    texto = unicodedata.normalize("NFKD", str(valor))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return " ".join(texto.lower().split()).strip(" .:-")


def _valor(row: tuple, col: Optional[int]):
    """Retorna row[col] com segurança (col pode ser None)."""
    if col is None or col < 0 or col >= len(row):
        return None
    return row[col]


def _localizar_cabecalho(ws, max_linhas: int = 40) -> tuple[Optional[int], dict]:
    """Encontra a linha de cabeçalho e o mapa campo -> índice de coluna."""
    limite = min(max_linhas, ws.max_row or max_linhas)
    for numero, row in enumerate(
        ws.iter_rows(min_row=1, max_row=limite, values_only=True), start=1
    ):
        mapa: dict[str, int] = {}
        for col, celula in enumerate(row):
            texto = _normalizar(celula)
            if not texto:
                continue
            for campo, aliases in COLUNAS_ALIASES.items():
                if campo not in mapa and texto in aliases:
                    mapa[campo] = col
        if "data" in mapa and len(mapa) >= 3:
            return numero, mapa
    return None, {}


def _localizar_meses(ws, max_linhas: int = 15) -> dict:
    """Mapeia índice de coluna -> nome do mês a partir dos rótulos do sumário."""
    limite = min(max_linhas, ws.max_row or max_linhas)
    meses: dict[int, str] = {}
    for row in ws.iter_rows(min_row=1, max_row=limite, values_only=True):
        for col, celula in enumerate(row):
            if isinstance(celula, str):
                nome = MESES_ALIASES.get(_normalizar(celula))
                if nome:
                    meses.setdefault(col, nome)
    return meses


def _linha_de_sumario(row: tuple) -> bool:
    """True quando a linha pertence ao bloco de sumário (e não aos dados)."""
    for celula in row:
        if isinstance(celula, str):
            texto = _normalizar(celula)
            if any(k in texto for k in _KEYWORDS_SUMARIO):
                return True
    return False


def _novo_stats() -> dict:
    """Estrutura base dos indicadores da sidebar (meses preenchidos depois)."""
    return {
        "registradas": {"label": "Total registradas", "accent": "#13335A", "months": {}},
        "capturadas": {"label": "Total capturadas por alarmes", "accent": "#2A688F", "months": {}},
        "pctCaptura": {"label": "% de captura", "accent": "#42B9EB", "months": {}},
        "recebidas": {"label": "% recebidas (não capturadas)", "accent": "#7D91A3", "months": {}},
    }


def _aplicar_percentual(stat: dict, valores: dict) -> None:
    """Converte frações (0–1) ou valores já em % para percentual."""
    for mes, valor in valores.items():
        stat["months"][mes] = round(valor * 100, 2) if valor <= 1.5 else round(valor, 2)


def _extrair_sumario(ws, meses_col: dict, stats: dict) -> None:
    """Preenche os indicadores a partir das linhas de sumário, se existirem."""
    if not meses_col:
        return

    for row in ws.iter_rows(values_only=True):
        if not row:
            continue

        label = ""
        for col, celula in enumerate(row):
            if col in meses_col or not isinstance(celula, str):
                continue
            texto = _normalizar(celula)
            if any(k in texto for k in _KEYWORDS_SUMARIO):
                label = texto
                break
        if not label:
            continue

        valores = {}
        for col, mes in meses_col.items():
            v = _valor(row, col)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                valores[mes] = float(v)
        if not valores:
            continue

        if "recebidas" in label:
            _aplicar_percentual(stats["recebidas"], valores)
        elif "registradas" in label:
            for mes, v in valores.items():
                stats["registradas"]["months"][mes] = int(round(v))
        elif "captur" in label:
            if all(0 < v <= 1.5 for v in valores.values()):
                _aplicar_percentual(stats["pctCaptura"], valores)
            else:
                for mes, v in valores.items():
                    stats["capturadas"]["months"][mes] = int(round(v))


def _chave_registro(reg: dict) -> tuple:
    """Chave para não repetir a mesma ocorrência vinda de arquivos diferentes."""
    return (
        reg.get("Mes", ""),
        reg.get("DataStr", ""),
        _normalizar(reg.get("Ocorrência", "")),
        _normalizar(reg.get("Endereço", "")),
        _normalizar(reg.get("Equipe", "")),
    )


def _ordenar_meses(meses) -> list[str]:
    """Ordena os meses presentes na ordem canônica do calendário."""
    conhecidos = [m for m in MESES_CANONICOS if m in meses]
    desconhecidos = sorted(m for m in meses if m not in MESES_CANONICOS)
    return conhecidos + desconhecidos


def extrair_dados_xlsx(caminho: Path) -> tuple[list[dict], dict]:
    """Extrai registros e sumário de uma planilha.

    O cabeçalho é detectado automaticamente, então a mesma função atende o
    arquivo consolidado e as planilhas mensais (layouts diferentes).
    """
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb.active
    stats = _novo_stats()

    try:
        header_row, mapa = _localizar_cabecalho(ws)
        if header_row is None:
            print(f"[AVISO] Cabeçalho não encontrado em {caminho.name}")
            return [], stats

        _extrair_sumario(ws, _localizar_meses(ws), stats)

        dados: list[dict] = []
        for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
            if not row or all(c is None for c in row):
                continue
            if _linha_de_sumario(row):
                continue

            dt = parse_data(_valor(row, mapa.get("data")))
            if dt is None:
                continue

            ocorrencia = str(_valor(row, mapa.get("ocorrencia")) or "").strip()
            endereco = str(_valor(row, mapa.get("endereco")) or "").strip()
            equipe = str(_valor(row, mapa.get("equipe")) or "").strip()
            alarmes = str(_valor(row, mapa.get("alarmes")) or "").strip()
            agencia = str(_valor(row, mapa.get("agencia")) or "").strip()

            dados.append({
                "QTE": 0,
                "Mes": MESES_MAP.get(dt.month, f"Mês {dt.month}"),
                "Dia": dt.day,
                "DataStr": f"{dt.day:02d}/{dt.month:02d}",
                "Categoria": classificar_categoria(ocorrencia),
                "Zona": classificar_zona(endereco, ocorrencia),
                "Ocorrência": ocorrencia,
                "Equipe": equipe,
                "Endereço": endereco,
                "Agência Validadora": agencia,
                "Alarmes utilizados": alarmes,
                "Fonte": simplificar_fonte(alarmes),
            })

        return dados, stats
    finally:
        wb.close()


def carregar_todas_planilhas() -> tuple[list[dict], dict]:
    """Varre a pasta Planilhas/ e consolida todos os .xlsx encontrados.

    Registros repetidos entre arquivos (ex.: consolidado + planilha mensal) são
    mantidos uma única vez; o primeiro arquivo em ordem alfabética prevalece,
    o que faz o consolidado ganhar das planilhas mensais.
    """
    if not PLANILHAS_DIR.exists():
        return [], {}

    todos_dados: list[dict] = []
    stats_final = _novo_stats()
    chaves_vistas: set[tuple] = set()

    for arq in sorted(PLANILHAS_DIR.glob("*.xlsx")):
        try:
            dados, stats_arq = extrair_dados_xlsx(arq)
        except Exception as e:
            print(f"[ERRO] Falha ao ler {arq.name}: {e}")
            continue

        novos: list[dict] = []
        chaves_arq: set[tuple] = set()
        for reg in dados:
            chave = _chave_registro(reg)
            if chave in chaves_vistas:
                continue
            novos.append(reg)
            chaves_arq.add(chave)

        ignorados = len(dados) - len(novos)
        if ignorados:
            print(f"[DEDUPE] {arq.name}: {ignorados} registro(s) repetido(s) ignorado(s)")

        chaves_vistas |= chaves_arq
        todos_dados.extend(novos)

        for key in stats_final:
            for mes, valor in stats_arq[key]["months"].items():
                if valor:
                    stats_final[key]["months"][mes] = valor

    # Quantidade de ocorrências por mês (fallback quando não há bloco de sumário)
    contagem: dict[str, int] = {}
    for reg in todos_dados:
        contagem[reg["Mes"]] = contagem.get(reg["Mes"], 0) + 1

    for mes, qtd in contagem.items():
        if not stats_final["capturadas"]["months"].get(mes):
            stats_final["capturadas"]["months"][mes] = qtd

    meses = _ordenar_meses(
        set(contagem) | {m for s in stats_final.values() for m, v in s["months"].items() if v}
    )
    for stat in stats_final.values():
        stat["months"] = {m: stat["months"].get(m, 0) for m in meses}

    for i, reg in enumerate(todos_dados, start=1):
        reg["QTE"] = i

    return todos_dados, stats_final


if __name__ == "__main__":
    dados, stats = carregar_todas_planilhas()
    print(f"Total de registros: {len(dados)}")
    print(f"Stats: {stats}")
    if dados:
        print("Primeiro:", dados[0])
        print("Último:", dados[-1])
