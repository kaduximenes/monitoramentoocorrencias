/**
 * app.js — Painel COR de Ocorrências (Abr–Jul 2026)
 *
 * Busca os dados do backend via API REST e renderiza o dashboard.
 * O backend monitora a planilha automaticamente — ao recarregar a
 * página (F5) os dados mais recentes serão exibidos.
 *
 * Novidades:
 *  - Busca em tempo real na tabela de registros
 *  - Paginação da tabela (50 registros por página)
 *  - Botão de refresh manual dos dados
 *  - Auto-refresh configurável (padrão: 60s)
 */

// ============================================================
// Configuração da API
// ============================================================
// Quando servido pelo Flask, usa a mesma origem.
// Quando aberto via file://, tenta localhost:5000.
const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:5000'
  : window.location.origin;

// Intervalo de auto-refresh em segundos (0 = desabilitado)
const AUTO_REFRESH_INTERVAL = 60;

// ============================================================
// Design tokens
// ============================================================
const ZONE_COLOR = {
  'Zona Norte': '#4C8DF0',
  'Zona Sul': '#33C9B8',
  'Zona Oeste': '#F2A93B',
  'Centro': '#8E8CF0',
  'Não identificado': '#54637A',
  'Fora do Município / Rodovia': '#B08968',
};
const CAT_COLOR = {
  'Acidente de trânsito': '#E8636B',
  'Enguiço de veículo': '#F2A93B',
  'Operação Policial': '#4C8DF0',
  'Atropelamento': '#E85D5D',
  'Manutenção na via': '#8E8CF0',
  'Queda de moto/veículo': '#D98CD9',
  'Queda de carga na via': '#C97AE0',
  'Incêndio': '#FF7A45',
  'Ocorrência CBMERJ': '#33C9B8',
  'Capotamento de veículo': '#E0A83B',
  'Obra na via': '#6FA8DC',
  'Semáforo apagado': '#F2D43B',
  'Evento/Manifestação': '#B08968',
  'Risco/obstáculo na via': '#D9A05B',
  'Outros / não classificado': '#7E8FA6',
};
const catColor = c => CAT_COLOR[c] || '#7E8FA6';
const zoneColor = z => ZONE_COLOR[z] || '#7E8FA6';

const MESES_ORDER = ['Abril', 'Maio', 'Junho', 'Julho'];
const ZONAS_ORDER = ['Zona Norte', 'Zona Sul', 'Zona Oeste', 'Centro'];
const OTHER_ZONAS = ['Não identificado', 'Fora do Município / Rodovia'];

// ============================================================
// Estado global
// ============================================================
let RAW_DATA = [];
let SIDEBAR_STATS = null;

const state = {
  meses: new Set(),
  zonas: new Set(),
  categorias: new Set(),
  fontes: new Set(),
};

// Controle de busca e paginação
let searchQuery = '';
let logPage = 1;
const LOG_PAGE_SIZE = 50;
let autoRefreshTimer = null;

// ============================================================
// Inicialização — carrega dados da API
// ============================================================
async function init() {
  await loadData();
  setupEventListeners();
  startAutoRefresh();
}

async function loadData() {
  const statusEl = document.getElementById('status-badge');
  const refreshBtn = document.getElementById('refresh-btn');

  if (refreshBtn) {
    refreshBtn.classList.add('loading');
    refreshBtn.textContent = '⟳ Carregando...';
  }

  try {
    const [dadosRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/api/dados`),
      fetch(`${API_BASE}/api/stats`),
    ]);

    if (!dadosRes.ok) throw new Error(`API dados: ${dadosRes.status}`);
    if (!statsRes.ok) throw new Error(`API stats: ${statsRes.status}`);

    RAW_DATA = await dadosRes.json();
    SIDEBAR_STATS = await statsRes.json();

    console.log(`[APP] ${RAW_DATA.length} registros carregados da API`);

    // Processa Fonte (derivada de "Alarmes utilizados")
    RAW_DATA.forEach(d => {
      d.Fonte = simplifyFonte(d['Alarmes utilizados']);
    });

    render();
    statusEl.innerHTML =
      `<span class="dot"></span> ${RAW_DATA.length} REGISTROS · API`;

  } catch (err) {
    console.error('[APP] Erro ao carregar dados:', err);
    statusEl.innerHTML =
      `<span class="dot" style="background:var(--red);"></span> SEM CONEXÃO`;
    statusEl.style.color = 'var(--red)';
    statusEl.style.borderColor = 'rgba(232,99,107,0.3)';
    statusEl.style.background = 'rgba(232,99,107,0.08)';

    // Se já temos dados em cache, mantém o dashboard
    if (RAW_DATA.length > 0) {
      console.log('[APP] Usando dados em cache...');
      return;
    }

    // Mostra mensagem amigável no corpo
    document.querySelector('.wrap').innerHTML = `
      <div style="text-align:center; padding:60px 20px; max-width:520px; margin:0 auto;">
        <div style="font-family:'Space Grotesk',sans-serif; font-size:20px; color:var(--text); margin-bottom:12px;">
          ⚠️ Backend não encontrado
        </div>
        <div style="color:var(--muted); font-size:13px; line-height:1.7;">
          O servidor Flask precisa estar rodando para carregar os dados.<br>
          Execute no terminal:
        </div>
        <div style="background:var(--panel); border:1px solid var(--border); border-radius:6px;
                    padding:12px 18px; margin:16px 0; font-family:'IBM Plex Mono',monospace;
                    font-size:13px; color:var(--teal);">
          python backend/app.py
        </div>
        <div style="color:var(--muted-2); font-size:11.5px;">
          Depois acesse <span style="color:var(--blue);">http://localhost:5000</span>
        </div>
      </div>`;
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('loading');
      refreshBtn.textContent = '⟳ Atualizar dados';
    }
  }
}

function startAutoRefresh() {
  if (AUTO_REFRESH_INTERVAL > 0) {
    autoRefreshTimer = setInterval(async () => {
      console.log('[APP] Auto-refresh...');
      await loadData();
    }, AUTO_REFRESH_INTERVAL * 1000);
    console.log(`[APP] Auto-refresh configurado: ${AUTO_REFRESH_INTERVAL}s`);
  }
}

async function manualRefresh() {
  // Também força refresh no backend
  try {
    await fetch(`${API_BASE}/api/refresh`, { method: 'POST' });
  } catch (e) {
    // ignora se falhar, tenta carregar dados mesmo assim
  }
  await loadData();
}

function setupEventListeners() {
  // Reset filters
  document.getElementById('reset-btn').addEventListener('click', () => {
    state.meses.clear();
    state.zonas.clear();
    state.categorias.clear();
    state.fontes.clear();
    searchQuery = '';
    logPage = 1;
    const searchInput = document.getElementById('log-search');
    if (searchInput) searchInput.value = '';
    render();
  });

  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', manualRefresh);
  }

  // Search input
  const searchInput = document.getElementById('log-search');
  const searchClear = document.getElementById('search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      logPage = 1;
      if (searchClear) searchClear.style.display = searchQuery ? 'block' : 'none';
      renderLog();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchQuery = '';
      logPage = 1;
      if (searchInput) searchInput.value = '';
      searchClear.style.display = 'none';
      renderLog();
    });
  }
}

// ============================================================
// Helpers
// ============================================================
function simplifyFonte(f) {
  if (!f) return 'Não informado';
  const a = String(f).toLowerCase();
  if (a.includes('tixxi') && (a.includes('map') || a.includes('google'))) return 'Google Maps + Tixxi';
  if (a.includes('tixxi')) return 'Tixxi';
  if (a.includes('cbmerj')) return 'CBMERJ';
  if (a.includes('google') || a.includes('map')) return 'Google Maps';
  if (a.includes('hxgn') || a.includes('hxg')) return 'HxGN';
  if (a.includes('jarvis')) return 'Jarvis';
  if (a.includes('videowall') || a.includes('video wall')) return 'Videowall';
  return 'Outra fonte';
}

function uniqueSorted(field) {
  const counts = {};
  RAW_DATA.forEach(d => {
    counts[d[field]] = (counts[d[field]] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function passesNonZona(d) {
  return (
    (state.meses.size === 0 || state.meses.has(d.Mes)) &&
    (state.categorias.size === 0 || state.categorias.has(d.Categoria)) &&
    (state.fontes.size === 0 || state.fontes.has(d.Fonte))
  );
}

function filteredData() {
  return RAW_DATA.filter(
    d =>
      passesNonZona(d) &&
      (state.zonas.size === 0 || state.zonas.has(d.Zona))
  );
}

function toggle(setObj, val) {
  if (setObj.has(val)) setObj.delete(val);
  else setObj.add(val);
  render();
}

// ============================================================
// Sidebar (colunas I–L)
// ============================================================
function renderSidebar() {
  if (!SIDEBAR_STATS) return;

  const el = document.getElementById('sidebar-stats');
  const monthKeys = ['Abril', 'Maio', 'Junho', 'Julho'];
  let html = '';

  Object.entries(SIDEBAR_STATS).forEach(([key, stat]) => {
    const isPct = key === 'pctCaptura' || key === 'recebidas';
    html += `<div class="sidebar-stat" style="--ss-accent:${stat.accent}">
      <div class="sidebar-stat-label">${stat.label}</div>
      <div class="sidebar-stat-months">`;
    monthKeys.forEach(m => {
      const val = stat.months[m];
      const display = isPct ? val.toFixed(1) + '%' : val.toLocaleString();
      html += `<div class="sidebar-stat-month">
        <div class="mname">${m.substring(0, 3)}</div>
        <div class="mval" style="color:${stat.accent}">${display}</div>
      </div>`;
    });
    html += `</div></div>`;
  });

  // Barra de eficiência
  html += `<div class="sidebar-stat" style="--ss-accent:#8E8CF0">
    <div class="sidebar-stat-label">Eficiência de captura por mês</div>`;
  monthKeys.forEach(m => {
    const cap = SIDEBAR_STATS.capturadas.months[m];
    const tot = SIDEBAR_STATS.registradas.months[m];
    const pct = ((cap / tot) * 100).toFixed(1);
    html += `<div class="sidebar-perc-row">
      <span class="spr-label">${m.substring(0, 3)}</span>
      <div class="spr-bar-wrap">
        <div class="spr-bar" style="width:${pct}%; background:#8E8CF0;"></div>
      </div>
      <span class="spr-val" style="color:#8E8CF0">${pct}%</span>
    </div>`;
  });
  html += `</div>`;

  el.innerHTML = html;
  document.getElementById('tag-sidebar').textContent = 'abr/jul 2026';
}

// ============================================================
// Month row
// ============================================================
function renderMonths() {
  const el = document.getElementById('month-row');
  const counts = {};
  MESES_ORDER.forEach(m => (counts[m] = 0));
  RAW_DATA.forEach(d => {
    if (d.Mes in counts) counts[d.Mes]++;
  });

  el.innerHTML =
    MESES_ORDER.map(m => {
      const active = state.meses.has(m);
      return `<div class="month-chip ${active ? 'active' : ''}" data-mes="${m}">
        ${m} <span class="cnt">${counts[m]}</span>
      </div>`;
    }).join('') +
    `<div class="month-chip" id="all-months" style="opacity:.7; font-weight:400;">Todos os meses</div>`;

  MESES_ORDER.forEach(m => {
    el.querySelector(`[data-mes="${m}"]`).addEventListener('click', () =>
      toggle(state.meses, m)
    );
  });
  document.getElementById('all-months').addEventListener('click', () => {
    state.meses.clear();
    render();
  });
}

// ============================================================
// Zone map
// ============================================================
function renderZoneMap() {
  const el = document.getElementById('zonemap');
  const maxRef = {};
  ZONAS_ORDER.forEach(z => {
    maxRef[z] = RAW_DATA.filter(d => d.Zona === z && passesNonZona(d)).length;
  });
  const maxVal = Math.max(...Object.values(maxRef), 1);
  const ids = {
    'Zona Norte': 'z-norte',
    'Zona Oeste': 'z-oeste',
    'Centro': 'z-centro',
    'Zona Sul': 'z-sul',
  };

  el.innerHTML = ZONAS_ORDER.map(z => {
    const id = ids[z];
    const val = maxRef[z];
    const pct = Math.round((val / maxVal) * 100);
    const isActive = state.zonas.has(z);
    const isDim = state.zonas.size > 0 && !isActive;
    return `<div class="zcell ${isActive ? 'active' : ''} ${isDim ? 'dim' : ''}"
                 id="${id}" style="--zc:${zoneColor(z)}" data-zone="${z}">
      <div class="zname">${z}</div>
      <div class="zcount mono">${val}</div>
      <div class="zbar" style="width:${pct}%"></div>
    </div>`;
  }).join('');

  ZONAS_ORDER.forEach(z => {
    document.getElementById(ids[z]).addEventListener('click', () =>
      toggle(state.zonas, z)
    );
  });

  // Other zones
  const otherEl = document.getElementById('other-zones');
  const otherCounts = OTHER_ZONAS.map(z => [
    z,
    RAW_DATA.filter(d => d.Zona === z && passesNonZona(d)).length,
  ]);
  otherEl.innerHTML =
    'outras: ' +
    otherCounts
      .map(([z, c]) => {
        const active = state.zonas.has(z);
        return `<span class="chip-mini ${active ? 'active' : ''}" data-zone="${z}">${z} (${c})</span>`;
      })
      .join('');

  otherCounts.forEach(([z]) => {
    otherEl
      .querySelector(`[data-zone="${z.replace(/"/g, '')}"]`)
      ?.addEventListener('click', () => toggle(state.zonas, z));
  });
}

// ============================================================
// Chip rows
// ============================================================
function renderChips(containerId, field, setObj, colorFn) {
  const el = document.getElementById(containerId);
  const opts = uniqueSorted(field);
  el.innerHTML = opts
    .map(([val, count]) => {
      const active = setObj.has(val);
      const c = colorFn ? colorFn(val) : null;
      const style =
        active && c
          ? `background:${c}; border-color:${c}; color:#12100a;`
          : '';
      return `<div class="chip ${active ? 'active' : ''}" style="${style}"
                   data-val="${String(val).replace(/"/g, '&quot;')}">
        ${val} <span class="mono" style="opacity:.7">${count}</span>
      </div>`;
    })
    .join('');

  [...el.querySelectorAll('.chip')].forEach(chip => {
    chip.addEventListener('click', () => toggle(setObj, chip.dataset.val));
  });
}

// ============================================================
// Active filters
// ============================================================
function renderActiveFilters() {
  const el = document.getElementById('active-filters');
  const hint = document.getElementById('filters-hint');
  const all = [
    ...[...state.meses].map(v => ({ v, type: 'mes' })),
    ...[...state.zonas].map(v => ({ v, type: 'zona' })),
    ...[...state.categorias].map(v => ({ v, type: 'categoria' })),
    ...[...state.fontes].map(v => ({ v, type: 'fonte' })),
  ];

  if (all.length === 0) {
    el.innerHTML = '';
    hint.textContent = `Nenhum filtro ativo — exibindo todas as ${RAW_DATA.length} ocorrências`;
    return;
  }

  hint.textContent = `${all.length} filtro(s) ativo(s)`;
  el.innerHTML = all
    .map(
      ({ v, type }) =>
        `<div class="chip active" data-type="${type}"
             data-val="${String(v).replace(/"/g, '&quot;')}"
             style="background:var(--panel-2); color:var(--text); border-color:var(--muted-2);">
          ${v} ✕
        </div>`
    )
    .join('');

  [...el.querySelectorAll('.chip')].forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      const val = chip.dataset.val;
      const map = {
        zona: state.zonas,
        categoria: state.categorias,
        fonte: state.fontes,
        mes: state.meses,
      };
      map[type].delete(val);
      render();
    });
  });
}

// ============================================================
// Charts
// ============================================================
let charts = {};

function makeOrUpdate(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  charts[id] = new Chart(document.getElementById(id), config);
}

Chart.defaults.color = '#7E8FA6';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11.5;

function renderCharts() {
  const data = filteredData();

  // ── Tipo (bar horizontal) ──
  const tipoCounts = {};
  data.forEach(d => {
    tipoCounts[d.Categoria] = (tipoCounts[d.Categoria] || 0) + 1;
  });
  const tipoSorted = Object.entries(tipoCounts).sort((a, b) => b[1] - a[1]);
  document.getElementById('tag-tipo').textContent = `${tipoSorted.length} tipos`;

  makeOrUpdate('chart-tipo', {
    type: 'bar',
    data: {
      labels: tipoSorted.map(x => x[0]),
      datasets: [
        {
          data: tipoSorted.map(x => x[1]),
          backgroundColor: tipoSorted.map(x => catColor(x[0])),
          borderRadius: 4,
          maxBarThickness: 40,
          categoryPercentage: 0.8,
          barPercentage: 0.85,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#152233' }, ticks: { precision: 0 } },
        y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
      },
    },
  });

  // ── Zona (doughnut) ──
  const zonaCounts = {};
  ZONAS_ORDER.forEach(z => (zonaCounts[z] = 0));
  let outrasCount = 0;
  data.forEach(d => {
    if (ZONAS_ORDER.includes(d.Zona)) zonaCounts[d.Zona]++;
    else outrasCount++;
  });
  const zonaLabels = [...ZONAS_ORDER, 'Outras / não identificado'];
  const zonaVals = [...ZONAS_ORDER.map(z => zonaCounts[z]), outrasCount];
  const zonaColors = [...ZONAS_ORDER.map(zoneColor), '#54637A'];
  document.getElementById('tag-zona').textContent = `${data.length} ocorrências`;

  makeOrUpdate('chart-zona', {
    type: 'doughnut',
    data: {
      labels: zonaLabels,
      datasets: [
        {
          data: zonaVals,
          backgroundColor: zonaColors,
          borderColor: '#111E2E',
          borderWidth: 3,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 12, font: { size: 10.5 } },
        },
      },
      cutout: '62%',
    },
  });

  // ── Dia (line) ──
  const diaCounts = {};
  data.forEach(d => {
    diaCounts[d.Dia] = (diaCounts[d.Dia] || 0) + 1;
  });
  const diaLabels = Array.from({ length: 31 }, (_, i) => i + 1);
  const activeMonths = state.meses.size > 0 ? [...state.meses] : MESES_ORDER;
  document.getElementById('tag-dia').textContent =
    activeMonths.length === 1
      ? activeMonths[0]
      : 'dia do mês, todos os meses selecionados';

  makeOrUpdate('chart-dia', {
    type: 'line',
    data: {
      labels: diaLabels,
      datasets: [
        {
          data: diaLabels.map(d => diaCounts[d] || 0),
          borderColor: '#F2A93B',
          backgroundColor: 'rgba(242,169,59,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointBackgroundColor: '#F2A93B',
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 15 } },
        y: { grid: { color: '#152233' }, ticks: { precision: 0 } },
      },
    },
  });

  // ── Equipe (bar horizontal) ──
  const eqCounts = {};
  data
    .filter(d => {
      const eq = String(d.Equipe || '').trim().toUpperCase();
      return eq !== '' && eq !== 'NONE' && eq !== 'NULL' && eq !== 'NAN';
    })
    .forEach(d => {
      eqCounts[d.Equipe] = (eqCounts[d.Equipe] || 0) + 1;
    });

  const eqSorted = Object.entries(eqCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  makeOrUpdate('chart-equipe', {
    type: 'bar',
    data: {
      labels: eqSorted.map(x => x[0]),
      datasets: [
        {
          data: eqSorted.map(x => x[1]),
          backgroundColor: '#4C8DF0',
          borderRadius: 4,
          maxBarThickness: 50,
          categoryPercentage: 0.7,
          barPercentage: 0.8,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#152233' }, ticks: { precision: 0 } },
        y: { grid: { display: false }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

// ============================================================
// Efetividade de captura por mês
// ============================================================
function renderCapturaMes() {
  if (!SIDEBAR_STATS) return;

  const mesesGraf = ['Abril', 'Maio', 'Junho', 'Julho'];
  const totalMes = mesesGraf.map(m => SIDEBAR_STATS.registradas.months[m]);
  const capturadoMes = mesesGraf.map(m => SIDEBAR_STATS.capturadas.months[m]);
  const percMes = mesesGraf.map(m => SIDEBAR_STATS.pctCaptura.months[m]);

  makeOrUpdate('chart-captura-mes', {
    data: {
      labels: mesesGraf,
      datasets: [
        {
          type: 'bar',
          label: 'Total de Ocorrências capturadas',
          data: totalMes,
          yAxisID: 'y',
          backgroundColor: 'rgba(242,169,59,0.25)',
          borderColor: '#F2A93B',
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 80,
          categoryPercentage: 0.7,
          barPercentage: 0.8,
        },
        {
          type: 'line',
          label: '% de Captura',
          data: percMes,
          yAxisID: 'y1',
          tension: 0.3,
          fill: false,
          borderColor: '#33C9B8',
          backgroundColor: '#33C9B8',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#33C9B8',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 10, font: { size: 10.5 } },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              if (context.dataset.label === '% de Captura') {
                return context.raw + '%';
              }
              return context.dataset.label + ': ' + context.raw;
            },
          },
        },
      },
      scales: {
        y: {
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'Quantidade' },
          grid: { color: '#152233' },
          ticks: { precision: 0 },
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: { callback: value => value + '%' },
          title: { display: true, text: '% Captura' },
        },
      },
    },
  });
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs() {
  const data = filteredData();
  const el = document.getElementById('kpis');
  const total = data.length;

  const zonaCounts = {};
  data.forEach(d => {
    zonaCounts[d.Zona] = (zonaCounts[d.Zona] || 0) + 1;
  });
  const topZonaArr = Object.entries(zonaCounts)
    .filter(([z]) => ZONAS_ORDER.includes(z))
    .sort((a, b) => b[1] - a[1]);
  const topZona = topZonaArr[0];

  const catCounts = {};
  data.forEach(d => {
    catCounts[d.Categoria] = (catCounts[d.Categoria] || 0) + 1;
  });
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  const mesCounts = {};
  data.forEach(d => {
    mesCounts[d.Mes] = (mesCounts[d.Mes] || 0) + 1;
  });
  const topMes = Object.entries(mesCounts).sort((a, b) => b[1] - a[1])[0];

  const hasFilter =
    state.zonas.size ||
    state.categorias.size ||
    state.fontes.size ||
    state.meses.size;

  const cards = [
    {
      label: 'Total de ocorrências capturadas',
      value: total,
      sub: hasFilter
        ? 'com filtros aplicados'
        : `de ${RAW_DATA.length} registradas (abr–jul)`,
      accent: '#F2A93B',
    },
    {
      label: 'Zona mais afetada',
      value: topZona ? topZona[0] : '—',
      sub: topZona ? `${topZona[1]} ocorrências` : '',
      accent: topZona ? zoneColor(topZona[0]) : '#7E8FA6',
    },
    {
      label: 'Tipo mais frequente',
      value: topCat ? topCat[0] : '—',
      sub: topCat ? `${topCat[1]} registros` : '',
      accent: topCat ? catColor(topCat[0]) : '#7E8FA6',
    },
    {
      label: 'Mês com mais registros',
      value: topMes ? topMes[0] : '—',
      sub: topMes ? `${topMes[1]} ocorrências` : '',
      accent: '#33C9B8',
    },
  ];

  el.innerHTML = cards
    .map(
      c => `
    <div class="kpi" style="--kpi-accent:${c.accent}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value" style="font-size:${
        c.value.toString().length > 16 ? '15px' : '24px'
      }">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>`
    )
    .join('');
}

// ============================================================
// Log table (com busca e paginação)
// ============================================================
function renderLog() {
  const mesIdx = { Abril: 4, Maio: 5, Junho: 6, Julho: 7 };
  let data = filteredData().sort(
    (a, b) =>
      (mesIdx[a.Mes] - mesIdx[b.Mes]) ||
      (a.Dia - b.Dia) ||
      (a.QTE - b.QTE)
  );

  // Aplica busca textual
  if (searchQuery) {
    data = data.filter(d => {
      const campos = [
        d.Endereço, d.Ocorrência, d.Equipe, d.Categoria, d.Zona,
        d.Mes, d.DataStr, d.Fonte, d['Alarmes utilizados'],
        d['Agência Validadora'],
      ];
      return campos.some(c => c && String(c).toLowerCase().includes(searchQuery));
    });
  }

  const totalFiltered = data.length;
  const totalPages = Math.ceil(totalFiltered / LOG_PAGE_SIZE);

  // Ajusta página atual se necessário
  if (logPage > totalPages) logPage = Math.max(1, totalPages);

  const startIdx = (logPage - 1) * LOG_PAGE_SIZE;
  const pageData = data.slice(startIdx, startIdx + LOG_PAGE_SIZE);

  const body = document.getElementById('log-body');
  document.getElementById('tag-log').textContent =
    searchQuery
      ? `${totalFiltered} de ${filteredData().length} registros (busca)`
      : `${totalFiltered} registros`;

  if (pageData.length === 0) {
    body.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">Nenhuma ocorrência corresponde aos filtros ou à busca.</div>
    </td></tr>`;
    document.getElementById('log-pagination').style.display = 'none';
    return;
  }

  body.innerHTML = pageData
    .map(
      d => `
    <tr>
      <td class="mono">${d.QTE || ''}</td>
      <td class="mono">${d.Mes}</td>
      <td class="mono">${d.DataStr}</td>
      <td><span class="badge" style="background:${catColor(d.Categoria)}22; color:${catColor(d.Categoria)};">
        ${highlightMatch(d.Categoria)}</span></td>
      <td><span class="badge" style="background:${zoneColor(d.Zona)}22; color:${zoneColor(d.Zona)};">
        ${highlightMatch(d.Zona)}</span></td>
      <td style="color:var(--muted); font-size:11.5px;">${highlightMatch(d.Endereço)}</td>
      <td style="font-size:11px; color:var(--muted-2);">${highlightMatch(d.Equipe)}</td>
    </tr>`
    )
    .join('');

  // Paginação
  renderPagination(totalFiltered, totalPages);
}

function highlightMatch(text) {
  if (!searchQuery || !text) return text || '';
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return String(text).replace(regex, '<mark class="search-highlight">$1</mark>');
}

function renderPagination(totalFiltered, totalPages) {
  const pagEl = document.getElementById('log-pagination');
  if (totalPages <= 1) {
    pagEl.style.display = 'none';
    return;
  }

  pagEl.style.display = 'flex';

  let html = '';

  // Botão Anterior
  html += `<button ${logPage === 1 ? 'disabled' : ''} data-page="${logPage - 1}">← Anterior</button>`;

  // Páginas
  const maxButtons = 7;
  let startPage = Math.max(1, logPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  if (startPage > 1) {
    html += `<button data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="page-info">…</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === logPage ? 'active-page' : ''}" data-page="${i}">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="page-info">…</span>`;
    html += `<button data-page="${totalPages}">${totalPages}</button>`;
  }

  // Botão Próximo
  html += `<button ${logPage === totalPages ? 'disabled' : ''} data-page="${logPage + 1}">Próximo →</button>`;

  pagEl.innerHTML = html;

  // Event listeners
  pagEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages) {
        logPage = page;
        renderLog();
        // Scroll to top of log
        document.querySelector('.log-wrap').scrollTop = 0;
      }
    });
  });
}

// ============================================================
// Master render
// ============================================================
function render() {
  renderSidebar();
  renderMonths();
  renderZoneMap();
  renderChips('cat-chips', 'Categoria', state.categorias, catColor);
  renderChips('fonte-chips', 'Fonte', state.fontes, null);
  renderActiveFilters();
  renderCharts();
  renderCapturaMes();
  renderKPIs();
  logPage = 1; // reseta paginação ao mudar filtros
  renderLog();
}

// ============================================================
// Bootstrap
// ============================================================
init();
