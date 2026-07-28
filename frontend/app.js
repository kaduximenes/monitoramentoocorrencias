/**
 * app.js — Painel COR de Ocorrências (Abr–Jun 2026)
 *
 * Busca os dados do backend via API REST e renderiza o dashboard.
 * O backend monitora a planilha automaticamente — ao recarregar a
 * página (F5) os dados mais recentes serão exibidos.
 */

// ============================================================
// Configuração da API
// ============================================================
const API_BASE = window.location.origin;

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

const MESES_ORDER = ['Abril', 'Maio', 'Junho'];
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

// ============================================================
// Inicialização — carrega dados da API
// ============================================================
async function init() {
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
    document.querySelector('.status').innerHTML =
      `<span class="dot"></span> ${RAW_DATA.length} REGISTROS · API`;

  } catch (err) {
    console.error('[APP] Erro ao carregar dados:', err);
    document.querySelector('.status').innerHTML =
      `<span class="dot" style="background:var(--red);"></span> ERRO AO CARREGAR`;
    document.querySelector('.status').style.color = 'var(--red)';
    document.querySelector('.status').style.borderColor = 'rgba(232,99,107,0.3)';
    document.querySelector('.status').style.background = 'rgba(232,99,107,0.08)';
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
  const monthKeys = ['Abril', 'Maio', 'Junho'];
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
  document.getElementById('tag-sidebar').textContent = 'abr/jun 2026';
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
  const all = [
    ...[...state.meses].map(v => ({ v, type: 'mes' })),
    ...[...state.zonas].map(v => ({ v, type: 'zona' })),
    ...[...state.categorias].map(v => ({ v, type: 'categoria' })),
    ...[...state.fontes].map(v => ({ v, type: 'fonte' })),
  ];

  if (all.length === 0) {
    el.innerHTML = `<span style="color:var(--muted-2); font-size:12px;">
      Nenhum filtro ativo — exibindo todas as ${RAW_DATA.length} ocorrências
    </span>`;
    return;
  }

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

  const mesesGraf = ['Abril', 'Maio', 'Junho'];
  const totalMes = mesesGraf.map(m => SIDEBAR_STATS.registradas.months[m]);
  const capturadoMes = mesesGraf.map(m => SIDEBAR_STATS.capturadas.months[m]);
  const percMes = mesesGraf.map(m => SIDEBAR_STATS.pctCaptura.months[m]);

  makeOrUpdate('chart-captura-mes', {
    data: {
      labels: mesesGraf,
      datasets: [
        {
          type: 'bar',
          label: 'Total de Ocorrências',
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
      label: 'Total de ocorrências',
      value: total,
      sub: hasFilter
        ? 'com filtros aplicados'
        : `de ${RAW_DATA.length} registradas (abr–jun)`,
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
// Log table
// ============================================================
function renderLog() {
  const mesIdx = { Abril: 4, Maio: 5, Junho: 6 };
  const data = filteredData().sort(
    (a, b) =>
      (mesIdx[a.Mes] - mesIdx[b.Mes]) ||
      (a.Dia - b.Dia) ||
      (a.QTE - b.QTE)
  );
  const body = document.getElementById('log-body');
  document.getElementById('tag-log').textContent = `${data.length} registros`;

  if (data.length === 0) {
    body.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">Nenhuma ocorrência corresponde aos filtros selecionados.</div>
    </td></tr>`;
    return;
  }

  body.innerHTML = data
    .map(
      d => `
    <tr>
      <td class="mono">${d.QTE || ''}</td>
      <td class="mono">${d.Mes}</td>
      <td class="mono">${d.DataStr}</td>
      <td><span class="badge" style="background:${catColor(d.Categoria)}22; color:${catColor(d.Categoria)};">
        ${d.Categoria}</span></td>
      <td><span class="badge" style="background:${zoneColor(d.Zona)}22; color:${zoneColor(d.Zona)};">
        ${d.Zona}</span></td>
      <td style="color:var(--muted); font-size:11.5px;">${d.Endereço}</td>
      <td style="font-size:11px; color:var(--muted-2);">${d.Equipe}</td>
    </tr>`
    )
    .join('');
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
  renderLog();
}

// ============================================================
// Event listeners
// ============================================================
document.getElementById('reset-btn').addEventListener('click', () => {
  state.meses.clear();
  state.zonas.clear();
  state.categorias.clear();
  state.fontes.clear();
  render();
});

// ============================================================
// Bootstrap
// ============================================================
init();
