"""
excel_reader.py — Lê as planilhas de monitoramento de alarmes COR
e extrai os dados estruturados.

Estrutura real da planilha (colunas 0-indexed):
  0 (A): vazia
  1 (B): Data (datetime)
  2 (C): Alarmes utilizados
  3 (D): Ocorrência
  4 (E): Equipe
  5 (F): Endereço
  6 (G): Agência Validadora
  7 (H): vazia
  8 (I): Label de sumário (ex: "total de ocorrencia registradas")
  9 (J): Valor ABRIL (sumário) / label de mês
  10 (K): Valor MAIO (sumário)
  11 (L): Valor JUNHO (sumário)
  12 (M): Valor JULHO (sumário) — opcional
"""
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import openpyxl


# --- Caminho da pasta de planilhas ---
PLANILHAS_DIR = Path(__file__).resolve().parent.parent / "Planilhas"

MESES_STATS = ["Abril", "Maio", "Junho", "Julho"]

MESES_MAP = {
    4: "Abril", 5: "Maio", 6: "Junho",
    7: "Julho", 8: "Agosto", 9: "Setembro",
    10: "Outubro", 11: "Novembro", 12: "Dezembro",
    1: "Janeiro", 2: "Fevereiro", 3: "Março",
}


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


def extrair_dados_xlsx(caminho: Path) -> tuple[list[dict], dict]:
    """Extrai dados e sumários. Retorna (lista_de_registros, sidebar_stats)."""
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb.active

    dados = []
    sidebar_stats = {
        "registradas": {"label": "Total registradas", "accent": "#F2A93B",
                        "months": {m: 0 for m in MESES_STATS}},
        "capturadas": {"label": "Total capturadas por alarmes", "accent": "#33C9B8",
                       "months": {m: 0 for m in MESES_STATS}},
        "pctCaptura": {"label": "% de captura", "accent": "#4C8DF0",
                       "months": {m: 0 for m in MESES_STATS}},
        "recebidas": {"label": "% recebidas (não capturadas)", "accent": "#7E8FA6",
                      "months": {m: 0 for m in MESES_STATS}},
    }

    seq = 0
    for i, row in enumerate(ws.iter_rows(min_row=4, values_only=True), start=4):
        if not row or all(c is None for c in row):
            continue

        col_b = row[1] if len(row) > 1 else None
        col_c = row[2] if len(row) > 2 else None
        col_d = row[3] if len(row) > 3 else None
        col_e = row[4] if len(row) > 4 else None
        col_f = row[5] if len(row) > 5 else None
        col_g = row[6] if len(row) > 6 else None
        col_i = row[8] if len(row) > 8 else None
        col_j = row[9] if len(row) > 9 else None
        col_k = row[10] if len(row) > 10 else None
        col_l = row[11] if len(row) > 11 else None
        col_m = row[12] if len(row) > 12 else None  # Julho (opcional)

        # Linha de sumário?
        if col_i and isinstance(col_i, str):
            label = col_i.strip().lower()
            try:
                vals = {
                    "Abril": float(str(col_j).replace(",", ".")) if col_j else 0,
                    "Maio": float(str(col_k).replace(",", ".")) if col_k else 0,
                    "Junho": float(str(col_l).replace(",", ".")) if col_l else 0,
                    "Julho": float(str(col_m).replace(",", ".")) if col_m else 0,
                }
            except (ValueError, TypeError):
                continue

            if "registradas" in label and "%" not in label and "captur" not in label:
                for m in MESES_STATS:
                    sidebar_stats["registradas"]["months"][m] = int(vals[m])
            elif "capturadas" in label or "captur" in label:
                # Pode ser contagem (valores > 1) ou percentual (valores < 1)
                if 0 < vals["Abril"] < 1:
                    # Percentual de captura
                    for m in MESES_STATS:
                        sidebar_stats["pctCaptura"]["months"][m] = round(vals[m] * 100, 2)
                else:
                    # Contagem de capturadas
                    for m in MESES_STATS:
                        sidebar_stats["capturadas"]["months"][m] = int(vals[m])
            elif "recebidas" in label:
                for m in MESES_STATS:
                    sidebar_stats["recebidas"]["months"][m] = round(vals[m] * 100, 2)
            continue

        # Linha de dados
        dt = parse_data(col_b)
        if dt is None:
            continue

        mes_nome = MESES_MAP.get(dt.month, f"Mês {dt.month}")
        dia = dt.day
        data_str = f"{dia:02d}/{dt.month:02d}"

        ocorrencia = str(col_d).strip() if col_d else ""
        endereco = str(col_f).strip() if col_f else ""
        equipe = str(col_e).strip() if col_e else ""
        alarmes = str(col_c).strip() if col_c else ""
        agencia = str(col_g).strip() if col_g else ""

        categoria = classificar_categoria(ocorrencia)
        zona = classificar_zona(endereco, ocorrencia)
        fonte = simplificar_fonte(alarmes)

        seq += 1
        registro = {
            "QTE": seq,
            "Mes": mes_nome,
            "Dia": dia,
            "DataStr": data_str,
            "Categoria": categoria,
            "Zona": zona,
            "Ocorrência": ocorrencia,
            "Equipe": equipe,
            "Endereço": endereco,
            "Agência Validadora": agencia,
            "Alarmes utilizados": alarmes,
            "Fonte": fonte,
        }
        dados.append(registro)

    wb.close()
    return dados, sidebar_stats


def carregar_todas_planilhas() -> tuple[list[dict], dict]:
    """Varre a pasta Planilhas/ e carrega todos os .xlsx encontrados."""
    if not PLANILHAS_DIR.exists():
        return [], {}

    todos_dados = []
    stats_final = {
        "registradas": {"label": "Total registradas", "accent": "#F2A93B",
                        "months": {m: 0 for m in MESES_STATS}},
        "capturadas": {"label": "Total capturadas por alarmes", "accent": "#33C9B8",
                       "months": {m: 0 for m in MESES_STATS}},
        "pctCaptura": {"label": "% de captura", "accent": "#4C8DF0",
                       "months": {m: 0 for m in MESES_STATS}},
        "recebidas": {"label": "% recebidas (não capturadas)", "accent": "#7E8FA6",
                      "months": {m: 0 for m in MESES_STATS}},
    }

    arquivos = sorted(PLANILHAS_DIR.glob("*.xlsx"))
    for arq in arquivos:
        try:
            dados, stats = extrair_dados_xlsx(arq)
            todos_dados.extend(dados)
            for key in stats_final:
                for m in MESES_STATS:
                    if stats[key]["months"][m]:
                        stats_final[key]["months"][m] = stats[key]["months"][m]
        except Exception as e:
            print(f"[ERRO] Falha ao ler {arq.name}: {e}")

    for i, d in enumerate(todos_dados, start=1):
        d["QTE"] = i

    return todos_dados, stats_final


if __name__ == "__main__":
    dados, stats = carregar_todas_planilhas()
    print(f"Total de registros: {len(dados)}")
    print(f"Stats: {stats}")
    if dados:
        print("Primeiro:", dados[0])
        print("Último:", dados[-1])
