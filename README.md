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
├── render.yaml               # Configuração de deploy Render
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

### ☁️ Deploy no Render

O projeto está configurado para deploy como **Web Service** no [Render](https://render.com), que mantém o servidor Flask persistente e o watcher de planilhas ativo.

#### Deploy automático (Blueprint)

1. Conecte o repositório ao Render
2. O `render.yaml` é detectado automaticamente
3. Clique em **Apply** — o serviço será criado com todas as configurações

#### Deploy manual

1. Crie um novo **Web Service** no Render
2. Configure:
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `python backend/app.py`
   - **Health Check Path**: `/health`

```bash
# Variáveis de ambiente
PORT=10000
DEBUG=0
```

**Importante**: Para atualizar os dados, substitua o `.xlsx` na pasta `Planilhas/` e faça um novo deploy. O watcher detecta automaticamente mudanças em **produção**, mas novos arquivos só entram via deploy.

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
| Deploy | Render (Web Service persistente) |
