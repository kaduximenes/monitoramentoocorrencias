# COR · Painel de Ocorrências Espontâneas

Dashboard interativo para monitoramento de alarmes apurado pela Coordenação COR (Centro de Operações Rio), com dados extraídos automaticamente de planilhas Excel.

---

## 🏗️ Arquitetura

```
Ocorrencias_Espontaneas/
├── backend/                  # Servidor Python (Flask)
│   ├── app.py                # API REST + watcher de planilhas
│   ├── excel_reader.py       # Leitor de .xlsx + classificador
│   └── requirements.txt      # Dependências Python
├── frontend/                 # Interface web
│   ├── index.html            # Estrutura HTML
│   ├── style.css             # Estilos (dark theme)
│   └── app.js                # Lógica + gráficos (Chart.js)
├── Planilhas/                # 📊 Pasta monitorada
│   └── *.xlsx                # Planilhas de ocorrências
└── README.md
```

## 🚀 Como executar

### 1. Instalar dependências

```powershell
pip install -r backend/requirements.txt
```

### 2. Iniciar o servidor

```powershell
python backend/app.py
```

### 3. Acessar o painel

Abra o navegador em **http://localhost:5000**

---

## 🔌 Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/dados` | Todos os registros de ocorrências (JSON) |
| `GET` | `/api/stats` | Indicadores de captura (sidebar) |
| `POST` | `/api/refresh` | Força recarregamento imediato da planilha |
| `GET` | `/api/status` | Status do servidor e contagem de registros |

---

## 🔄 Atualização automática da planilha

O backend monitora a pasta `Planilhas/` a cada **5 segundos**. Quando qualquer arquivo `.xlsx` é modificado ou adicionado, os dados são recarregados automaticamente em memória.

No frontend, basta **recarregar a página (F5)** para ver os dados mais recentes.

---

## 📊 Funcionalidades do painel

- **KPIs**: Total de ocorrências, zona mais afetada, tipo mais frequente, mês com mais registros
- **Filtros interativos**: por mês, zona da cidade, tipo de ocorrência e fonte do alarme
- **Mapa de zonas**: visualização das 4 zonas (Norte, Sul, Oeste, Centro)
- **Indicadores de captura**: totais registrados vs capturados por alarmes (%)
- **Gráficos**:
  - Ocorrências por tipo (barra horizontal)
  - Distribuição por zona (rosca)
  - Evolução diária (linha)
  - Equipes com mais ocorrências (barra)
  - Efetividade de captura por mês (barra + linha)
- **Tabela de registros**: lista completa e ordenável com scroll

---

## 📝 Classificação automática

O `excel_reader.py` classifica cada ocorrência automaticamente:

- **Categoria**: Acidente de trânsito, Enguiço de veículo, Operação Policial, Manutenção na via, etc.
- **Zona**: Zona Norte, Zona Sul, Zona Oeste, Centro (a partir do endereço)
- **Fonte do alarme**: Google Maps, Tixxi, Videowall, Wazer, HxGN, etc.

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Python 3, Flask, openpyxl, watchdog |
| Frontend | HTML5, CSS3, JavaScript (vanilla), Chart.js 4 |
| Dados | Excel (.xlsx) — leitura via openpyxl |
