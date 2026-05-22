// NGCP Power Grid Reliability Dashboard & Compliance Controller

// Global App State
const state = {
  currentTab: 'overview',
  outages: [],          // Raw combined Luzon and Visayas outages
  marginalPlants: [],   // Raw WESM pricing intervals
  ngcpUpdates: [],      // NGCP bulletins
  gompOutages: [],      // GOMP calendar
  
  // Power Plants directory aggregated database
  powerPlants: [],
  
  // Outage Table Pagination & Filtering
  filters: {
    search: '',
    grid: 'all',
    tech: 'all',
    status: 'all',
  },
  pagination: {
    currentPage: 1,
    pageSize: 15,
  },

  // Power Plants Directory Filtering
  plantFilters: {
    search: '',
    grid: 'all',
    tech: 'all',
    status: 'all', // all, exceeded, ok, active
  },

  // Chart References
  charts: {
    techOutages: null,
    wesmPricing: null,
    conglomerate: null
  },

  // Map & Calendar state
  calendarDate: new Date(2026, 4, 15), // May 15, 2026 (outage peak)
  mapInstance: null,
  mapMarkers: [],
  mapPolylines: [], // Transmission line polyline references

  // Real-Time Playback Simulation state
  simPlaying: false,
  simCurrentHour: 0,
  simSpeed: 3, // Hours advanced per tick
  simInterval: null,
  simTimeline: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Load and combine data from data.js
  if (typeof DASHBOARD_DATA !== 'undefined') {
    state.outages = [
      ...DASHBOARD_DATA.luzon_outages.map(o => ({ ...o, grid: 'Luzon' })),
      ...DASHBOARD_DATA.visayas_outages.map(o => ({ ...o, grid: 'Visayas' }))
    ];
    state.marginalPlants = [
      ...DASHBOARD_DATA.luzon_marginal.map(m => ({ ...m, grid: 'Luzon' })),
      ...DASHBOARD_DATA.visayas_marginal.map(m => ({ ...m, grid: 'Visayas' }))
    ];
    state.ngcpUpdates = DASHBOARD_DATA.ngcp_updates;
    
    if (DASHBOARD_DATA.gomp_outages) {
      state.gompOutages = DASHBOARD_DATA.gomp_outages;
    }

    // Standardize and sanitize mixed date-time formatting inconsistencies on load
    sanitizeOutagesData();
    
    // Aggregate unique power plants registry
    compilePowerPlantsRegistry();
    
    // Append Mindanao plants
    if (DASHBOARD_DATA.mindanao_plants) {
      const minPlants = DASHBOARD_DATA.mindanao_plants.map(p => ({
        key: `${p.facility} | ${p.unit}`,
        facility: p.facility,
        unit: p.unit,
        genco: p.genco,
        technology: p.technology,
        grid: p.grid,
        capacity: p.capacity,
        accumulatedDays: 0,
        exceededDays: 0,
        tripEvents: 0,
        activeOutage: false,
        affiliates: '',
        parentConglomerate: p.genco,
        outagesList: []
      }));
      state.powerPlants = [...state.powerPlants, ...minPlants];
    }
  }

  const safeRun = (fn, name) => {
    try { fn(); } catch (e) { console.error(`Error initializing ${name}:`, e); }
  };

  // Setup Event Listeners
  safeRun(setupNavigation, 'setupNavigation');
  safeRun(setupMobileMenu, 'setupMobileMenu');
  safeRun(setupFilters, 'setupFilters');
  safeRun(setupPlantFilters, 'setupPlantFilters');
  safeRun(setupDrawer, 'setupDrawer');
  safeRun(setupReservesSimulator, 'setupReservesSimulator');
  safeRun(setupGlobalSearch, 'setupGlobalSearch');
  safeRun(setupCalendar, 'setupCalendar');
  safeRun(setupMap, 'setupMap');
  safeRun(setupGompCalendar, 'setupGompCalendar');
  safeRun(setupTopologySimulation, 'setupTopologySimulation');
  safeRun(setupStrategicAnalysisTab, 'setupStrategicAnalysisTab');
  
  // Run initial renders
  safeRun(updateLiveTicker, 'updateLiveTicker');
  safeRun(renderOverviewTab, 'renderOverviewTab');
  safeRun(renderPlantsTab, 'renderPlantsTab');
  safeRun(renderOutagesTab, 'renderOutagesTab');
  safeRun(renderMarketTab, 'renderMarketTab');
  safeRun(renderUpdatesTab, 'renderUpdatesTab');
  safeRun(renderMldTab, 'renderMldTab');
  safeRun(renderStrategicAnalysisTab, 'renderStrategicAnalysisTab');
});

// Helper: Extract Parent Conglomerate from raw Affiliation text
function getParentConglomerate(affiliates) {
  if (!affiliates) return 'Independent / Other';
  const firstLine = affiliates.split('\n')[0].trim();
  if (firstLine.startsWith('Under ')) {
    // Extract group name up to first comma, semicolon, period, or parenthesis
    const parts = firstLine.replace('Under ', '').split(/[,;.\(]/);
    let parent = parts[0].trim();
    if (parent.includes('Group')) return parent;
    if (parent.includes('Corporation')) return parent;
    return parent + ' Group';
  }
  if (firstLine.includes('Affiliation') || firstLine.includes('affiliations')) {
    return 'Affiliated GenCo';
  }
  return 'Independent / Other';
}

// 1. Compile Unique Power Plant Registry Database
function compilePowerPlantsRegistry() {
  const plantsMap = {};
  
  state.outages.forEach(o => {
    const key = `${o.facility.trim()} | ${o.unit.trim()}`;
    const cap = parseFloat(o.capacity) || 0;
    const accumDays = parseFloat(o.accumulated_days) || 0;
    const limitStatus = parseFloat(o.status) || 0;
    const isActive = o.actual_resumption_date === "";

    if (!plantsMap[key]) {
      plantsMap[key] = {
        key: key,
        facility: o.facility.trim(),
        unit: o.unit.trim(),
        genco: o.genco ? o.genco.trim() : 'Unknown GenCo',
        technology: o.technology || 'Other',
        grid: o.grid,
        capacity: cap,
        accumulatedDays: accumDays,
        exceededDays: limitStatus > 0 ? limitStatus : 0,
        tripEvents: 0,
        activeOutage: false,
        affiliates: o.affiliates || '',
        parentConglomerate: getParentConglomerate(o.affiliates),
        outagesList: []
      };
    }
    
    // Update variables
    plantsMap[key].tripEvents++;
    if (isActive) {
      plantsMap[key].activeOutage = true;
    }
    // Track maximum capacity declared
    if (cap > plantsMap[key].capacity) {
      plantsMap[key].capacity = cap;
    }
    // Track highest accumulated outage days and exceeded days
    if (accumDays > plantsMap[key].accumulatedDays) {
      plantsMap[key].accumulatedDays = accumDays;
    }
    if (limitStatus > 0 && limitStatus > plantsMap[key].exceededDays) {
      plantsMap[key].exceededDays = limitStatus;
    }
    
    // Append full record to this plant's timeline list
    plantsMap[key].outagesList.push(o);
  });

  // Sort outages inside each plant chronologically desc
  Object.keys(plantsMap).forEach(key => {
    plantsMap[key].outagesList.sort((a, b) => {
      const dateA = new Date(a.date_out);
      const dateB = new Date(b.date_out);
      return dateB.getTime() - dateA.getTime();
    });
  });

  state.powerPlants = Object.values(plantsMap).sort((a, b) => b.accumulatedDays - a.accumulatedDays);
}

// 2. Navigation & Tab Switching
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-menu .nav-item');
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Update Active Navigation Item
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update Tab Page Visibility
      const tabId = button.getAttribute('data-tab');
      state.currentTab = tabId;
      
      const pages = document.querySelectorAll('.tab-page');
      pages.forEach(page => page.classList.remove('active'));
      
      const activePage = document.getElementById(`${tabId}-tab`);
      if (activePage) {
        activePage.classList.add('active');
      }

      // Close mobile drawer menu
      closeMobileMenu();

      // Re-trigger visual updates or refits for active tabs (especially charts)
      if (tabId === 'overview') {
        setTimeout(() => {
          Object.values(state.charts).forEach(chart => {
            if (chart) chart.update();
          });
        }, 100);
      } else if (tabId === 'map') {
        setTimeout(() => {
          initLeafletMap();
        }, 150);
      } else if (tabId === 'calendar') {
        renderCalendarGrid();
      } else if (tabId === 'gomp') {
        renderGompGrid();
      } else if (tabId === 'topology') {
        renderTopologyView();
      } else if (tabId === 'compliance-analysis') {
        renderStrategicAnalysisTab();
      }
    });
  });
}

// Mobile Responsive Drawer menu toggles
function setupMobileMenu() {
  const hamburger = document.getElementById('mobile-hamburger-btn');
  const closeBtn = document.getElementById('mobile-sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');
  
  if (hamburger) {
    hamburger.addEventListener('click', openMobileMenu);
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMobileMenu);
  }
  if (backdrop) {
    backdrop.addEventListener('click', closeMobileMenu);
  }
}

function openMobileMenu() {
  const drawer = document.getElementById('sidebar-drawer');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeMobileMenu() {
  const drawer = document.getElementById('sidebar-drawer');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// 3. Live Grid Alerts Ticker in Header
function updateLiveTicker() {
  const tickerContainer = document.getElementById('grid-ticker');
  const pulseDot = document.getElementById('grid-pulse-dot');
  
  // Find the latest red or yellow alert in updates
  const activeAlerts = state.ngcpUpdates.filter(u => u.type === 'Red Alert' || u.type === 'Yellow Alert');
  
  if (activeAlerts.length > 0) {
    const latest = activeAlerts[0];
    const isRed = latest.type === 'Red Alert';
    
    if (pulseDot) pulseDot.className = `pulse-dot ${isRed ? 'danger' : 'warning'}`;
    
    // Parse brief summary from message
    let summary = latest.message.split('\n')[0] || latest.message;
    if (summary.length > 80) summary = summary.substring(0, 80) + '...';
    
    if (tickerContainer) tickerContainer.innerHTML = `<span class="ticker-text" style="color: ${isRed ? 'var(--status-red)' : 'var(--status-yellow)'}; font-weight: 700;">LIVE SYSTEM ALERT:</span> ${summary} (${latest.timestamp})`;
  } else {
    if (pulseDot) pulseDot.className = 'pulse-dot normal';
    if (tickerContainer) tickerContainer.innerHTML = 'GRID STATUS NORMAL: System reserves are currently adequate across Luzon and Visayas.';
  }
}

// 4. System Overview Tab Renderer
function renderOverviewTab() {
  // A. Calculate Metrics
  const totalOutagesCount = state.outages.length;
  let totalActiveCapacity = 0;
  let totalExceededAllowanceCount = 0;
  let peakWesmPrice = 0;
  
  state.outages.forEach(o => {
    const cap = parseFloat(o.capacity) || 0;
    const isRestored = o.actual_resumption_date !== "";
    
    if (!isRestored) {
      totalActiveCapacity += cap;
    }
    
    const limitStatus = parseFloat(o.status) || 0;
    if (limitStatus > 0) {
      totalExceededAllowanceCount++;
    }
  });

  // WESM Price Calculation
  state.marginalPlants.forEach(m => {
    let p = m.price === 'AP' ? parseFloat(m.indicative_ap) : parseFloat(m.price);
    if (p > peakWesmPrice) {
      peakWesmPrice = p;
    }
  });

  // B. Write Metrics to UI
  document.getElementById('metric-active-outage').textContent = `${Math.round(totalActiveCapacity).toLocaleString()} MW`;
  document.getElementById('metric-total-outages').textContent = totalOutagesCount.toString();
  document.getElementById('metric-exceeded-limits').textContent = totalExceededAllowanceCount.toString();
  document.getElementById('metric-peak-price').textContent = `${Math.round(peakWesmPrice).toLocaleString()} ₱/MWh`;

  const exceededCard = document.getElementById('exceeded-limits-card');
  if (totalExceededAllowanceCount > 25) {
    exceededCard.className = "metric-card danger";
  } else if (totalExceededAllowanceCount > 0) {
    exceededCard.className = "metric-card warning";
  } else {
    exceededCard.className = "metric-card normal";
  }

  // C. Setup Technology Breakdown Chart & List
  setupTechBreakdown();

  // D. Setup WESM Pricing Line Chart
  setupWesmLineChart();

  // E. Setup Conglomerate Monopoly Explorer Chart
  setupConglomerateChart();

  // F. Setup ERC Exceedance Leaderboard
  setupExceededLeaderboard();
}

function setupTechBreakdown() {
  const techMap = {};
  state.outages.forEach(o => {
    const tech = o.technology || 'Other';
    const cap = parseFloat(o.capacity) || 0;
    if (!techMap[tech]) techMap[tech] = { count: 0, capacity: 0 };
    techMap[tech].count++;
    techMap[tech].capacity += cap;
  });

  const sortedTechs = Object.keys(techMap).map(tech => ({
    name: tech,
    ...techMap[tech]
  })).sort((a, b) => b.capacity - a.capacity);

  const container = document.getElementById('tech-progress-list');
  container.innerHTML = '';
  
  const colors = {
    'Coal-Fired': '#475569',
    'Combined-Cycle': '#3b82f6',
    'Hydroelectric': '#0ea5e9',
    'Geothermal': '#10b981',
    'Biomass': '#84cc16',
    'Diesel': '#f59e0b',
    'Oil-Fired Thermal': '#ef4444'
  };

  const totalCap = sortedTechs.reduce((acc, t) => acc + t.capacity, 0);

  sortedTechs.forEach(t => {
    const pct = totalCap > 0 ? (t.capacity / totalCap) * 100 : 0;
    const color = colors[t.name] || '#8b5cf6';
    
    const itemHtml = `
      <div class="progress-item">
        <div class="progress-label-row">
          <div class="progress-label-left">
            <span class="progress-dot-icon" style="background-color: ${color}"></span>
            <span>${t.name}</span>
          </div>
          <span style="font-weight:600;">${Math.round(t.capacity).toLocaleString()} MW (${Math.round(pct)}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });

  // Doughnut Chart
  const ctx = document.getElementById('techOutagesChart').getContext('2d');
  if (state.charts.techOutages) {
    state.charts.techOutages.destroy();
  }

  state.charts.techOutages = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sortedTechs.map(t => t.name),
      datasets: [{
        data: sortedTechs.map(t => Math.round(t.capacity)),
        backgroundColor: sortedTechs.map(t => colors[t.name] || '#8b5cf6'),
        borderWidth: 1,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return ` ${label}: ${value.toLocaleString()} MW`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

function setupWesmLineChart() {
  const sortMarginal = (arr) => {
    return [...arr].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return parseInt(a.hour) - parseInt(b.hour);
    });
  };

  const luzonData = sortMarginal(state.marginalPlants.filter(m => m.grid === 'Luzon'));
  const visayasData = sortMarginal(state.marginalPlants.filter(m => m.grid === 'Visayas'));

  const getLabel = (item) => {
    if (!item.date) return `Hour ${item.hour}`;
    const d = new Date(item.date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateStr} H${item.hour}`;
  };

  const allLabels = [];
  const mapLuzon = {};
  const mapVisayas = {};

  luzonData.forEach(item => {
    const lbl = getLabel(item);
    if (!allLabels.includes(lbl)) allLabels.push(lbl);
    const p = item.price === 'AP' ? parseFloat(item.indicative_ap) : parseFloat(item.price);
    mapLuzon[lbl] = p || null;
  });

  visayasData.forEach(item => {
    const lbl = getLabel(item);
    if (!allLabels.includes(lbl)) allLabels.push(lbl);
    const p = item.price === 'AP' ? parseFloat(item.indicative_ap) : parseFloat(item.price);
    mapVisayas[lbl] = p || null;
  });

  const labelsToShow = allLabels.slice(-20); // last 20

  const ctx = document.getElementById('wesmPricingChart').getContext('2d');
  if (state.charts.wesmPricing) {
    state.charts.wesmPricing.destroy();
  }

  state.charts.wesmPricing = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labelsToShow,
      datasets: [
        {
          label: 'Luzon Grid Price',
          data: labelsToShow.map(lbl => mapLuzon[lbl]),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.04)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#4f46e5',
          tension: 0.15,
          fill: true
        },
        {
          label: 'Visayas Grid Price',
          data: labelsToShow.map(lbl => mapVisayas[lbl]),
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.04)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#7c3aed',
          tension: 0.15,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Inter', size: 11, weight: 500 }, color: '#475569' }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              return ` ${label}: ₱${Math.round(value).toLocaleString()}/MWh`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' }
        },
        y: {
          ticks: {
            font: { family: 'Inter', size: 10 },
            color: '#94a3b8',
            callback: function(value) {
              return '₱' + (value / 1000) + 'k';
            }
          },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// Conglomerate Offline Capacity Share horizontal bar chart
function setupConglomerateChart() {
  const activeOutages = state.outages.filter(o => o.actual_resumption_date === "");
  const conglomerateMap = {};

  activeOutages.forEach(o => {
    const parent = getParentConglomerate(o.affiliates);
    const cap = parseFloat(o.capacity) || 0;
    conglomerateMap[parent] = (conglomerateMap[parent] || 0) + cap;
  });

  const sortedConglomerates = Object.keys(conglomerateMap).map(parent => ({
    name: parent,
    capacity: conglomerateMap[parent]
  })).sort((a, b) => b.capacity - a.capacity);

  const ctx = document.getElementById('conglomerateChart').getContext('2d');
  if (state.charts.conglomerate) {
    state.charts.conglomerate.destroy();
  }

  const corporateColors = {
    'Aboitiz Equity Ventures': '#4f46e5',
    'First Gen Corporation': '#0ea5e9',
    'Union Equities, Inc. Group': '#f59e0b',
    'Chan Group': '#84cc16',
    'San Miguel Global Power': '#ef4444',
    'Independent / Other': '#64748b'
  };

  state.charts.conglomerate = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedConglomerates.map(c => c.name),
      datasets: [{
        label: 'Offline Capacity (MW)',
        data: sortedConglomerates.map(c => Math.round(c.capacity)),
        backgroundColor: sortedConglomerates.map(c => corporateColors[c.name] || '#8b5cf6'),
        borderRadius: 6,
        barThickness: 16
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.parsed.x.toLocaleString()} MW offline`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { family: 'Inter', size: 10 }, color: '#94a3b8' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11, weight: 500 }, color: '#475569' }
        }
      }
    }
  });
}

function setupExceededLeaderboard() {
  const exceededList = state.outages
    .map(o => {
      const statusDays = parseFloat(o.status) || 0;
      return { ...o, statusDays };
    })
    .filter(o => o.statusDays > 0)
    .sort((a, b) => b.statusDays - a.statusDays)
    .slice(0, 5); // top 5

  const container = document.getElementById('leaderboard-list');
  container.innerHTML = '';
  
  if (exceededList.length === 0) {
    container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding: 20px;">No outage has exceeded the ERC allowance.</div>';
    return;
  }

  exceededList.forEach(o => {
    const parent = getParentConglomerate(o.affiliates);
    const itemHtml = `
      <div class="list-item">
        <div>
          <div class="list-item-title">${o.facility} (${o.unit})</div>
          <div class="list-item-sub">${o.genco} • <span style="font-weight:600; color:var(--accent-color);">${parent}</span></div>
        </div>
        <div class="list-item-value" style="color:var(--status-red)">
          +${Math.round(o.statusDays)} Days Out
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// 5. Power Plants Directory Tab
function setupPlantFilters() {
  const searchInput = document.getElementById('plants-search');
  const gridSelect = document.getElementById('plants-grid-filter');
  const techSelect = document.getElementById('plants-tech-filter');
  const statusSelect = document.getElementById('plants-status-filter');
  const resetBtn = document.getElementById('plants-reset');

  searchInput.addEventListener('input', (e) => {
    state.plantFilters.search = e.target.value.toLowerCase();
    renderPlantsTab();
  });

  gridSelect.addEventListener('change', (e) => {
    state.plantFilters.grid = e.target.value;
    renderPlantsTab();
  });

  techSelect.addEventListener('change', (e) => {
    state.plantFilters.tech = e.target.value;
    renderPlantsTab();
  });

  statusSelect.addEventListener('change', (e) => {
    state.plantFilters.status = e.target.value;
    renderPlantsTab();
  });

  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    gridSelect.value = 'all';
    techSelect.value = 'all';
    statusSelect.value = 'all';
    
    state.plantFilters.search = '';
    state.plantFilters.grid = 'all';
    state.plantFilters.tech = 'all';
    state.plantFilters.status = 'all';
    
    renderPlantsTab();
  });

  // Dynamic values in dropdowns
  const uniqueTechs = [...new Set(state.powerPlants.map(p => p.technology).filter(Boolean))].sort();
  techSelect.innerHTML = '<option value="all">All Technologies</option>';
  uniqueTechs.forEach(t => {
    techSelect.insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`);
  });

  // ERC Calculator event listeners
  const costInput = document.getElementById('calc-replacement-cost');
  const penaltyInput = document.getElementById('calc-penalty-rate');
  if (costInput) {
    costInput.addEventListener('input', updateErcCalculator);
  }
  if (penaltyInput) {
    penaltyInput.addEventListener('input', updateErcCalculator);
  }
}

function renderPlantsTab() {
  // Update grid-wide overview widgets
  updateErcCalculator();
  renderTechScorecard();

  const container = document.getElementById('plants-grid-container');
  container.innerHTML = '';

  const filtered = state.powerPlants.filter(p => {
    const combinedName = `${p.facility} ${p.unit}`.toLowerCase();
    const searchMatch = !state.plantFilters.search ||
      combinedName.includes(state.plantFilters.search) ||
      p.facility.toLowerCase().includes(state.plantFilters.search) ||
      p.unit.toLowerCase().includes(state.plantFilters.search) ||
      p.genco.toLowerCase().includes(state.plantFilters.search) ||
      p.parentConglomerate.toLowerCase().includes(state.plantFilters.search);
      
    // 2. Grid Filter
    const gridMatch = state.plantFilters.grid === 'all' || p.grid === state.plantFilters.grid;
    
    // 3. Tech Filter
    const techMatch = state.plantFilters.tech === 'all' || p.technology === state.plantFilters.tech;
    
    // 4. Compliance/Active Status Filter
    let statusMatch = true;
    if (state.plantFilters.status === 'exceeded') {
      statusMatch = p.exceededDays > 0;
    } else if (state.plantFilters.status === 'ok') {
      statusMatch = p.exceededDays === 0;
    } else if (state.plantFilters.status === 'active') {
      statusMatch = p.activeOutage;
    }

    return searchMatch && gridMatch && techMatch && statusMatch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 3; text-align: center; padding: 40px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius:12px;">
        No generating powerplants matching your query filters were found in our directory registry.
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const isOffline = p.activeOutage;
    const gridBadge = `<span class="badge ${p.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}">${p.grid}</span>`;
    const complianceBadge = p.exceededDays > 0 ?
      `<span class="badge badge-compliance-exceeded">+${Math.round(p.exceededDays)}d Limit Breach</span>` :
      `<span class="badge badge-compliance-ok">Compliant</span>`;

    const statusPill = isOffline ?
      `<span class="badge badge-status-active">OFFLINE</span>` :
      `<span class="badge badge-status-restored">RESTORED / ONLINE</span>`;

    const card = document.createElement('div');
    card.className = 'plant-card';
    card.innerHTML = `
      <div class="plant-card-header">
        <div>
          <div class="plant-card-title">${p.facility} (${p.unit})</div>
          <div class="plant-card-owner">${p.genco}</div>
        </div>
        ${statusPill}
      </div>
      <div class="plant-card-body">
        <div class="plant-card-row">
          <span class="plant-card-label">Conglomerate Parent:</span>
          <span class="plant-card-value" style="color:var(--accent-color);">${p.parentConglomerate}</span>
        </div>
        <div class="plant-card-row">
          <span class="plant-card-label">Technology Fuel:</span>
          <span class="plant-card-value">${p.technology}</span>
        </div>
        <div class="plant-card-row">
          <span class="plant-card-label">Generating Sector:</span>
          <span>${gridBadge}</span>
        </div>
        <div class="plant-card-row">
          <span class="plant-card-label">Max Outage Capacity:</span>
          <span class="plant-card-value" style="font-family:var(--font-title); font-weight:700; color:var(--text-primary);">${Math.round(p.capacity)} MW</span>
        </div>
        <div class="plant-card-row">
          <span class="plant-card-label">Outage Frequency:</span>
          <span class="plant-card-value" style="color:var(--status-info);">${p.tripEvents} Trip Events</span>
        </div>
      </div>
      <div class="plant-card-footer">
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:10px; color:var(--text-muted);">Accumulated Outage</span>
          <span style="font-weight:700; color:var(--text-secondary); font-size:13px;">${p.accumulatedDays.toFixed(1)} Days</span>
        </div>
        ${complianceBadge}
      </div>
    `;

    // Click handler: find the latest outage record of this powerplant and open drawer details
    card.addEventListener('click', () => {
      if (p.outagesList && p.outagesList.length > 0) {
        openDrawer(p.outagesList[0]);
      }
    });
    container.appendChild(card);
  });
}

// 6. Outages Explorer Tab
function setupFilters() {
  const searchInput = document.getElementById('outages-search');
  const gridSelect = document.getElementById('outages-grid-filter');
  const techSelect = document.getElementById('outages-tech-filter');
  const statusSelect = document.getElementById('outages-status-filter');
  const resetBtn = document.getElementById('outages-reset');

  searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    state.pagination.currentPage = 1;
    renderOutagesTab();
  });

  gridSelect.addEventListener('change', (e) => {
    state.filters.grid = e.target.value;
    state.pagination.currentPage = 1;
    renderOutagesTab();
  });

  techSelect.addEventListener('change', (e) => {
    state.filters.tech = e.target.value;
    state.pagination.currentPage = 1;
    renderOutagesTab();
  });

  statusSelect.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    state.pagination.currentPage = 1;
    renderOutagesTab();
  });

  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    gridSelect.value = 'all';
    techSelect.value = 'all';
    statusSelect.value = 'all';
    
    state.filters.search = '';
    state.filters.grid = 'all';
    state.filters.tech = 'all';
    state.filters.status = 'all';
    state.pagination.currentPage = 1;
    
    renderOutagesTab();
  });

  // Dynamic values in dropdowns
  const uniqueTechs = [...new Set(state.outages.map(o => o.technology).filter(Boolean))].sort();
  techSelect.innerHTML = '<option value="all">All Technologies</option>';
  uniqueTechs.forEach(t => {
    techSelect.insertAdjacentHTML('beforeend', `<option value="${t}">${t}</option>`);
  });
}

function renderOutagesTab() {
  let filtered = state.outages.filter(o => {
    const combinedName = `${o.facility} ${o.unit}`.toLowerCase();
    const searchMatch = !state.filters.search || 
      combinedName.includes(state.filters.search) ||
      (o.genco && o.genco.toLowerCase().includes(state.filters.search)) ||
      (o.facility && o.facility.toLowerCase().includes(state.filters.search)) ||
      (o.unit && o.unit.toLowerCase().includes(state.filters.search)) ||
      (o.reason && o.reason.toLowerCase().includes(state.filters.search)) ||
      (o.technology && o.technology.toLowerCase().includes(state.filters.search));
      
    const gridMatch = state.filters.grid === 'all' || o.grid === state.filters.grid;
    const techMatch = state.filters.tech === 'all' || o.technology === state.filters.tech;
    
    let statusMatch = true;
    const isRestored = o.actual_resumption_date !== "";
    const statusVal = parseFloat(o.status) || 0;
    
    if (state.filters.status === 'active') {
      statusMatch = !isRestored;
    } else if (state.filters.status === 'restored') {
      statusMatch = isRestored;
    } else if (state.filters.status === 'exceeded') {
      statusMatch = statusVal > 0;
    } else if (state.filters.status === 'ok') {
      statusMatch = statusVal <= 0;
    }

    return searchMatch && gridMatch && techMatch && statusMatch;
  });

  // Sort: active outages on top, then sort by date out descending
  filtered.sort((a, b) => {
    const isRestoredA = a.actual_resumption_date !== "";
    const isRestoredB = b.actual_resumption_date !== "";
    
    if (isRestoredA !== isRestoredB) {
      return isRestoredA ? 1 : -1;
    }
    
    const dateA = new Date(a.date_out + "T" + (a.time_out || "00:00"));
    const dateB = new Date(b.date_out + "T" + (b.time_out || "00:00"));
    return dateB.getTime() - dateA.getTime();
  });

  // Paginate
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / state.pagination.pageSize) || 1;
  
  if (state.pagination.currentPage > totalPages) {
    state.pagination.currentPage = totalPages;
  }
  
  const startIdx = (state.pagination.currentPage - 1) * state.pagination.pageSize;
  const endIdx = Math.min(startIdx + state.pagination.pageSize, totalItems);
  const paginated = filtered.slice(startIdx, endIdx);

  const tableBody = document.getElementById('outages-table-body');
  tableBody.innerHTML = '';

  if (paginated.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
          No power grid outages found matching active filters.
        </td>
      </tr>
    `;
    updatePaginationControls(0, 0, 0, 1);
    return;
  }

  paginated.forEach(o => {
    const isRestored = o.actual_resumption_date !== "";
    const cap = parseFloat(o.capacity) || 0;
    const statusVal = parseFloat(o.status) || 0;
    
    const gridBadge = `<span class="badge ${o.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}">${o.grid}</span>`;
    const statusBadge = isRestored ? 
      `<span class="badge badge-status-restored">Restored</span>` : 
      `<span class="badge badge-status-active">Active</span>`;
      
    let complianceBadge = '';
    if (statusVal > 0) {
      complianceBadge = `<span class="badge badge-compliance-exceeded">+${Math.round(statusVal)}d Limit Breach</span>`;
    } else {
      complianceBadge = `<span class="badge badge-compliance-ok">Compliant</span>`;
    }

    const dateOutStr = o.date_out ? new Date(o.date_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
    const timeOutStr = o.time_out ? o.time_out.substring(0, 5) : '';

    let timingFlag = '';
    let repeatFlag = '';
    
    // Check Peak Timing (10:00-14:00 or 17:00-21:00)
    if (o.time_out) {
      const hour = parseInt(o.time_out.split(':')[0], 10);
      if ((hour >= 10 && hour <= 14) || (hour >= 17 && hour <= 21)) {
        timingFlag = `<div class="badge badge-flag-suspicious" style="margin-top: 4px;">STRATEGIC TIMING FLAG</div>`;
      }
    }
    
    // Check Repeat Offender
    const plant = state.powerPlants.find(p => p.facility === o.facility.trim() && p.unit === o.unit.trim());
    if (plant && plant.tripEvents > 1) {
      repeatFlag = `<div class="badge badge-repeat-offender" style="margin-top: 4px;">REPEAT OFFENDER (${plant.tripEvents} TRIPS)</div>`;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${gridBadge}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${o.facility}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${o.genco}</div>
        ${repeatFlag}
      </td>
      <td><span class="badge badge-tech">${o.technology || 'Other'}</span></td>
      <td style="font-weight:600; font-family:var(--font-title);">${Math.round(cap)} MW</td>
      <td>
        <div>${dateOutStr}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${timeOutStr}</div>
        ${timingFlag}
      </td>
      <td>${statusBadge}</td>
      <td>${complianceBadge}</td>
    `;
    
    row.addEventListener('click', () => openDrawer(o));
    tableBody.appendChild(row);
  });

  updatePaginationControls(startIdx + 1, endIdx, totalItems, totalPages);
}

function updatePaginationControls(start, end, total, totalPages) {
  document.getElementById('pagination-info').textContent = total > 0 ? 
    `Showing ${start} to ${end} of ${total} entries` : 'Showing 0 to 0 of 0 entries';
    
  const prevBtn = document.getElementById('pagination-prev');
  const nextBtn = document.getElementById('pagination-next');
  
  prevBtn.disabled = state.pagination.currentPage === 1;
  nextBtn.disabled = state.pagination.currentPage === totalPages || totalPages === 0;
  
  prevBtn.onclick = () => {
    if (state.pagination.currentPage > 1) {
      state.pagination.currentPage--;
      renderOutagesTab();
    }
  };
  
  nextBtn.onclick = () => {
    if (state.pagination.currentPage < totalPages) {
      state.pagination.currentPage++;
      renderOutagesTab();
    }
  };
}

// 7. Drawer Slide-Over Detail Panel & Sibling Units lookup
function setupDrawer() {
  const backdrop = document.getElementById('detail-drawer-backdrop');
  const drawer = document.getElementById('detail-drawer');
  const closeBtn = document.getElementById('drawer-close-btn');

  const close = () => {
    backdrop.classList.remove('open');
    drawer.classList.remove('open');
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function openDrawer(o) {
  const backdrop = document.getElementById('detail-drawer-backdrop');
  const drawer = document.getElementById('detail-drawer');
  
  document.getElementById('drawer-facility-title').textContent = `${o.facility} - ${o.unit}`;
  document.getElementById('drawer-genco').textContent = o.genco;
  document.getElementById('drawer-grid').textContent = o.grid;
  document.getElementById('drawer-tech').textContent = o.technology || 'Other';
  document.getElementById('drawer-capacity').textContent = `${parseFloat(o.capacity).toLocaleString()} MW`;
  
  const dateOutStr = o.date_out ? new Date(o.date_out).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
  const timeOutStr = o.time_out ? o.time_out.substring(0, 5) : '';
  document.getElementById('drawer-date-out').textContent = `${dateOutStr} at ${timeOutStr}`;
  document.getElementById('drawer-duration').textContent = o.duration ? (parseFloat(o.duration) ? parseFloat(o.duration).toFixed(2) + " Days" : o.duration) : '-';

  const estDateStr = o.est_resumption_date ? new Date(o.est_resumption_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD';
  const estTimeStr = o.est_resumption_time ? o.est_resumption_time.substring(0, 5) : '';
  document.getElementById('drawer-est-date').textContent = o.est_resumption_date ? `${estDateStr} at ${estTimeStr}` : 'To Be Determined (TBD)';

  const isRestored = o.actual_resumption_date !== "";
  if (isRestored) {
    const dateInStr = new Date(o.actual_resumption_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timeInStr = o.actual_resumption_time ? o.actual_resumption_time.substring(0, 5) : '';
    document.getElementById('drawer-act-date').textContent = `${dateInStr} at ${timeInStr}`;
    document.getElementById('drawer-act-date').style.color = 'var(--status-normal)';
  } else {
    document.getElementById('drawer-act-date').textContent = 'Active Outage';
    document.getElementById('drawer-act-date').style.color = 'var(--status-red)';
  }

  document.getElementById('drawer-reason').textContent = o.reason || 'No specific technical reason was logged by grid operators.';

  // Flags for Drawer
  let flagsHtml = '';
  if (o.time_out) {
    const hour = parseInt(o.time_out.split(':')[0], 10);
    if ((hour >= 10 && hour <= 14) || (hour >= 17 && hour <= 21)) {
      flagsHtml += `<div class="badge badge-flag-suspicious">STRATEGIC TIMING FLAG</div>`;
    }
  }
  const plant = state.powerPlants.find(p => p.facility === o.facility.trim() && p.unit === o.unit.trim());
  if (plant && plant.tripEvents > 1) {
    flagsHtml += `<div class="badge badge-repeat-offender">REPEAT OFFENDER (${plant.tripEvents} TRIPS)</div>`;
  }
  document.getElementById('drawer-flags-container').innerHTML = flagsHtml;
  
  // Export Regulatory Dossier Logic
  const exportBtn = document.getElementById('btn-export-dossier');
  exportBtn.onclick = () => {
    let dossierContent = `REGULATORY COMPLIANCE DOSSIER\n`;
    dossierContent += `=================================================\n`;
    dossierContent += `Facility: ${o.facility} - ${o.unit}\n`;
    dossierContent += `GenCo: ${o.genco}\n`;
    dossierContent += `Grid: ${o.grid}\n`;
    dossierContent += `Technology: ${o.technology || 'Other'}\n`;
    dossierContent += `Capacity: ${o.capacity} MW\n`;
    dossierContent += `Date Out: ${dateOutStr} ${timeOutStr}\n`;
    dossierContent += `Reason: ${o.reason || 'No specific technical reason was logged.'}\n\n`;
    dossierContent += `COMPLIANCE STATUS\n`;
    dossierContent += `-------------------------------------------------\n`;
    const allowance = parseFloat(o.outage_allowance) || 0;
    const accumulated = parseFloat(o.accumulated_days) || 0;
    const breach = parseFloat(o.status) || 0;
    dossierContent += `ERC Allowable Outage Days: ${allowance > 0 ? allowance : 'N/A'}\n`;
    dossierContent += `Accumulated Outage Days: ${accumulated > 0 ? accumulated.toFixed(2) : 'N/A'}\n`;
    if (breach > 0) {
      dossierContent += `Status: LIMIT BREACHED (+${breach.toFixed(2)} Days Exceeded)\n`;
      const penalty = breach * parseFloat(o.capacity) * 24 * 150000;
      dossierContent += `Estimated Penalty Exposure: PHP ${penalty.toLocaleString()}\n`;
    } else {
      dossierContent += `Status: COMPLIANT\n`;
    }
    dossierContent += `\nCONTRACTUAL PROFILE\n`;
    dossierContent += `-------------------------------------------------\n`;
    dossierContent += `PSA Off-Taker: ${o.psa_offtaker || 'N/A'}\n`;
    dossierContent += `PSA Capacity: ${o.psa_capacity || 'N/A'}\n`;
    dossierContent += `ASPA Type: ${o.aspa_type || 'N/A'}\n`;
    dossierContent += `ASPA Capacity: ${o.aspa_capacity || 'N/A'}\n\n`;
    dossierContent += `Generated automatically from Grid Operations Dashboard.\n`;
    
    const blob = new Blob([dossierContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dossier_${o.facility.replace(/\\s+/g, '_')}_${o.unit.replace(/\\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const allowance = parseFloat(o.outage_allowance) || 0;
  const accumulated = parseFloat(o.accumulated_days) || 0;
  const breach = parseFloat(o.status) || 0;

  document.getElementById('drawer-allowance').textContent = allowance > 0 ? `${allowance} Days` : 'N/A';
  document.getElementById('drawer-accumulated').textContent = accumulated > 0 ? `${accumulated.toFixed(2)} Days` : 'N/A';
  
  // WESM Contract and ASPA data population
  document.getElementById('drawer-offtaker').textContent = o.psa_offtaker || 'N/A';
  document.getElementById('drawer-psa-cap').textContent = o.psa_capacity || 'N/A';
  document.getElementById('drawer-aspa-type').textContent = o.aspa_type || 'N/A';
  document.getElementById('drawer-aspa-cap').textContent = o.aspa_capacity || 'N/A';
  
  const complianceStatusEl = document.getElementById('drawer-compliance-status');
  if (breach > 0) {
    complianceStatusEl.innerHTML = `<span style="color:var(--status-red); font-weight:700;">LIMIT BREACHED (+${breach.toFixed(2)} Days Exceeded)</span>`;
  } else if (allowance > 0) {
    complianceStatusEl.innerHTML = `<span style="color:var(--status-normal); font-weight:700;">COMPLIANT (${(allowance - accumulated).toFixed(2)} Days Remaining)</span>`;
  } else {
    complianceStatusEl.innerHTML = `<span style="color:var(--text-muted);">NOT TRACKED</span>`;
  }

  // Corporate Sibling / Sister Units Lookup Explorer
  const affiliatesEl = document.getElementById('drawer-affiliates');
  const parentGroup = getParentConglomerate(o.affiliates);
  
  // Find all unique plants owned by the same Conglomerate (excluding current unit)
  const siblings = state.powerPlants.filter(p => {
    return p.parentConglomerate === parentGroup && `${p.facility} | ${p.unit}` !== `${o.facility.trim()} | ${o.unit.trim()}`;
  });

  let siblingsHtml = `<div style="font-weight:700; color:var(--text-primary); margin-bottom: 6px;">Corporate Group: <span style="color:var(--accent-color);">${parentGroup}</span></div>`;
  if (o.affiliates) {
    siblingsHtml += `<div style="margin-bottom:12px; font-size:11.5px; color:var(--text-muted); font-style:italic;">"${o.affiliates.split('\n')[0]}"</div>`;
  }

  if (siblings.length > 0) {
    siblingsHtml += `<div style="font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:6px;">Sister Power Plant Units:</div>`;
    siblingsHtml += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    siblings.forEach(sib => {
      const isOff = sib.activeOutage;
      const statusColor = isOff ? 'border-color: var(--status-red); color: var(--status-red);' : 'border-color: var(--status-normal); color: var(--status-normal);';
      siblingsHtml += `
        <button onclick="drawerHopToPlant('${sib.facility}', '${sib.unit}')" class="badge" style="background:#ffffff; border:1.5px solid #e2e8f0; font-size:11px; padding:4px 8px; cursor:pointer; font-weight:600; text-align:left; ${statusColor}">
          ${sib.facility} (${sib.unit}) — ${Math.round(sib.capacity)}MW
        </button>
      `;
    });
    siblingsHtml += `</div>`;
  } else {
    siblingsHtml += `<div style="font-size:11px; color:var(--text-muted);">No other sister generating plant units are logged under this conglomerate in our system directory.</div>`;
  }

  affiliatesEl.innerHTML = siblingsHtml;

  // Open backdrop
  backdrop.classList.add('open');
  drawer.classList.add('open');
}

// Click listener to hop directly from one sister plant to another within the drawer
window.drawerHopToPlant = function(facility, unit) {
  const plantKey = `${facility} | ${unit}`;
  const target = state.powerPlants.find(p => p.key === plantKey);
  if (target && target.outagesList && target.outagesList.length > 0) {
    openDrawer(target.outagesList[0]);
  }
};

// 8. WESM Marginal Pricing Tab
function renderMarketTab() {
  const gridFilter = document.getElementById('market-grid-filter');
  const alertFilter = document.getElementById('market-alert-filter');
  const tableBody = document.getElementById('market-table-body');

  const updateTable = () => {
    const gridVal = gridFilter.value;
    const alertVal = alertFilter.value;

    let filtered = state.marginalPlants.filter(m => {
      const gridMatch = gridVal === 'all' || m.grid === gridVal;
      const alertMatch = alertVal === 'all' || m.alert === alertVal;
      return gridMatch && alertMatch;
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB.getTime() - dateA.getTime();
      }
      return parseInt(b.hour) - parseInt(a.hour);
    });

    tableBody.innerHTML = '';

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No WESM market alerts match active filters.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(m => {
      const dateStr = m.date ? new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
      
      const gridBadge = `<span class="badge ${m.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}">${m.grid}</span>`;
      const alertBadge = m.alert === 'RED' ? 
        `<span class="badge badge-status-active">RED ALERT</span>` : 
        `<span class="badge badge-status-active" style="background-color: var(--status-yellow-bg); color: var(--status-yellow); border-color: var(--status-yellow-border);">YELLOW ALERT</span>`;

      let priceHtml = '';
      if (m.price === 'AP') {
        const ind = parseFloat(m.indicative_ap) || 0;
        priceHtml = `
          <div><span style="font-weight: 700; color:var(--accent-color);">AP Active</span></div>
          <div style="font-size:11px; color:var(--text-muted);">Indicative: ₱${Math.round(ind).toLocaleString()}/MWh</div>
        `;
      } else {
        const p = parseFloat(m.price) || 0;
        priceHtml = `<span style="font-weight:700;">₱${p.toLocaleString()}/MWh</span>`;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${dateStr}</td>
        <td>Hour ${m.hour}</td>
        <td>${gridBadge}</td>
        <td>${alertBadge}</td>
        <td>${priceHtml}</td>
        <td><span style="font-weight: 600; color:var(--text-primary);">${m.marginal_plant || 'System Reserve'}</span></td>
      `;
      tableBody.appendChild(row);
    });
  };

  gridFilter.addEventListener('change', updateTable);
  alertFilter.addEventListener('change', updateTable);
  updateTable();
}

// 9. Chronological Bulletins Feed
function renderUpdatesTab() {
  const container = document.getElementById('timeline-container');
  container.innerHTML = '';

  state.ngcpUpdates.forEach(u => {
    let alertClass = 'normal';
    if (u.type === 'Red Alert') alertClass = 'red-alert';
    if (u.type === 'Yellow Alert') alertClass = 'yellow-alert';
    if (u.type === 'Manual Load Dropping') alertClass = 'mld';

    let badgeColor = 'var(--text-muted)';
    if (u.type === 'Red Alert') badgeColor = 'var(--status-red)';
    if (u.type === 'Yellow Alert') badgeColor = 'var(--status-yellow)';
    if (u.type === 'Manual Load Dropping') badgeColor = 'var(--status-info)';

    const itemHtml = `
      <div class="timeline-item ${alertClass}" id="bulletin-node-${u.timestamp.replace(/\s+/g, '-')}">
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-time">${u.timestamp}</span>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="badge" style="border: 1px solid ${badgeColor}; color: ${badgeColor}; font-weight:700; font-size:10px;">${u.type.toUpperCase()}</span>
              <span class="timeline-sender">${u.sender}</span>
            </div>
          </div>
          <div class="timeline-message">${u.message}</div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// 10. Manual Load Dropping Tab
function renderMldTab() {
  const mldSearchInput = document.getElementById('mld-search');
  const mldResults = document.getElementById('mld-search-results');

  const mldSchedules = [
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '2:00 PM - 3:00 PM',
      areas: ['LUELCO (La Union)', 'ISELCO I (Santiago City)', 'ISELCO II (City of Ilagan)', 'CELCOR (Cabanatuan City)', 'AEC (Angeles City)', 'OEDC (Olongapo City)', 'IEC (Batangas)', 'ALECO (Albay)', 'MERALCO (Metro Manila)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '3:00 PM - 4:00 PM',
      areas: ['LUELCO (La Union)', 'ABRECO (Abra)', 'PANELCO III (Pangasinan)', 'CAGELCO 2 (Cagayan)', 'OEDC (Olongapo City)', 'CELCOR (Cabanatuan City)', 'AEC (Angeles City)', 'MERALCO (Metro Manila)', 'BATELEC I (Batangas)', 'QUEZELCO I (Quezon)', 'ALECO (Albay)', 'CANORECO (Camarines Norte)']
    },
    {
      grid: 'Visayas',
      date: 'May 15, 2026',
      hour: '3:00 PM - 10:00 PM',
      areas: ['VECO (Visayas Elec)', 'MECO (Mactan Elec)', 'CEBECO I (Cebu)', 'CEBECO II (Cebu)', 'CEBECO III (Cebu)', 'NEPC (Negros Elec)', 'NOCECO (Negros Occ)', 'NORECO I (Negros Or)', 'NORECO II (Negros Or)', 'NONECO (Negros Occ)', 'MORE (Iloilo City)', 'AKELCO (Aklan)', 'ANTECO (Antique)', 'CAPELCO (Capiz)', 'ILECO I (Iloilo)', 'ILECO II (Iloilo)', 'ILECO III (Iloilo)', 'GUIMELCO (Guimaras)', 'LEYECO II (Leyte)', 'SOLECO (Southern Leyte)', 'DORELCO (Leyte)', 'LEYECO III (Leyte)', 'LEYECO IV (Leyte)', 'LEYECO V (Leyte)', 'ESAMELCO (Eastern Samar)', 'BILECO (Biliran)', 'NORSAMELCO (Northern Samar)', 'SAMELCO I (Samar)', 'SAMELCO II (Samar)', 'BLCI (Bohol)', 'BOHECO I (Bohol)', 'BOHECO II (Bohol)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '4:00 PM - 5:00 PM',
      areas: ['LUELCO (La Union)', 'ABRECO (Abra)', 'PANELCO III (Pangasinan)', 'CAGELCO II (Cagayan)', 'OEDC (Olongapo City)', 'CELCOR (Cabanatuan City)', 'AEC (Angeles City)', 'MERALCO (Metro Manila)', 'QUEZELCO I (Quezon)', 'ALECO (Albay)', 'BATELEC I (Batangas)', 'CANORECO (Camarines Norte)', 'TARELCO II (Tarlac & Pampanga)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '5:00 PM - 6:00 PM',
      areas: ['INEC (Ilocos Norte)', 'ISECO (Ilocos Sur)', 'LUECO (La Union)', 'DECORP (Dagupan City)', 'PANELCO III (Pangasinan)', 'NUVELCO (Nueva Vizcaya)', 'TARELCO II (Tarlac & Pampanga)', 'PELCO I (Pampanga)', 'PELCO II (Pampanga)', 'SFELAPCO (Pampanga)', 'BATELEC I (Batangas)', 'CANORECO (Camarines Norte)', 'CASURECO II (Camarines Sur)', 'QUEZELCO I (Quezon)', 'MERALCO (Metro Manila)', 'ZAMECO II (Zambales)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '6:00 PM - 7:00 PM',
      areas: ['INEC (Ilocos Norte)', 'ISECO (Ilocos Sur)', 'LUECO (La Union)', 'DECORP (Dagupan City)', 'PANELCO III (Pangasinan)', 'NUVELCO (Nueva Vizcaya)', 'TARELCO II (Tarlac & Pampanga)', 'PELCO I (Pampanga)', 'PELCO II (Pampanga)', 'SFELAPCO (Pampanga)', 'ZAMECO II (Zambales)', 'BATELEC II (Batangas)', 'CASURECO II (Camarines Sur)', 'MERALCO (Metro Manila)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '7:00 PM - 8:00 PM',
      areas: ['LUELCO (La Union)', 'ISELCO I (Isabela)', 'TARELCO II (Tarlac & Pampanga)', 'PELCO I (Pampanga)', 'PELCO II (Pampanga)', 'SFELAPCO (Pampanga)', 'ZAMECO II (Zambales)', 'BATELEC I & II (Batangas)', 'CASURECO II (Camarines Sur)', 'MERALCO (Metro Manila)', 'CENPELCO (Pangasinan)', 'DECORP (Dagupan City)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '8:00 PM - 9:00 PM',
      areas: ['LUELCO (La Union)', 'CENPELCO (Pangasinan)', 'DECORP (Dagupan City)', 'ISELCO I (Isabela)', 'PENELCO (Bataan)', 'TARELCO I (Tarlac & Nueva Ecija)', 'BATELEC I & II (Batangas)', 'CASURECO III & IV (Camarines Sur)', 'MERALCO (Metro Manila)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '9:00 PM - 10:00 PM',
      areas: ['ISECO (Ilocos Sur)', 'ISELCO I (Isabela)', 'QUIRELCO (Quirino)', 'CAGELCO II (Cagayan & Apayao)', 'PENELCO (Bataan)', 'TARELCO I (Tarlac & Nueva Ecija)', 'BATELEC II (Batangas)', 'CASURECO III & IV (Camarines Sur)', 'MERALCO (Metro Manila)']
    },
    {
      grid: 'Luzon',
      date: 'May 15, 2026',
      hour: '10:00 PM - 11:00 PM',
      areas: ['ISECO (Ilocos Sur)', 'ISELCO I (Isabela)', 'QUIRELCO (Quirino)', 'CAGELCO II (Cagayan & Apayao)', 'TARELCO I (Tarlac & Nueva Ecija)', 'PENELCO (Bataan)', 'BATELEC II (Batangas)', 'CASURECO III & IV (Camarines Sur)', 'MERALCO (Metro Manila)']
    }
  ];

  const timelineView = document.getElementById('mld-timeline-view');
  timelineView.innerHTML = '';
  
  mldSchedules.forEach(sched => {
    const gridBadge = `<span class="badge ${sched.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}" style="font-size:10px; padding: 2px 6px;">${sched.grid}</span>`;
    
    let areaTagsHtml = '';
    sched.areas.forEach(area => {
      areaTagsHtml += `<span class="mld-area-tag">${area}</span>`;
    });

    const blockHtml = `
      <div class="mld-hour-block">
        <div class="mld-hour-header">
          <span>${sched.hour}</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <span style="font-size:11px; font-weight:500; color:var(--text-muted);">${sched.date}</span>
            ${gridBadge}
          </div>
        </div>
        <div class="mld-hour-body">
          <div class="mld-area-list">
            ${areaTagsHtml}
          </div>
        </div>
      </div>
    `;
    timelineView.insertAdjacentHTML('beforeend', blockHtml);
  });

  const handleSearch = () => {
    const q = mldSearchInput.value.trim().toLowerCase();
    mldResults.innerHTML = '';

    if (!q) {
      mldResults.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 20px; font-size:13px;">Type your electric cooperative (e.g. Meralco, Casureco, Boheco) or province/city above to check your schedule.</div>';
      return;
    }

    const matches = [];
    mldSchedules.forEach(sched => {
      sched.areas.forEach(area => {
        if (area.toLowerCase().includes(q)) {
          matches.push({
            area: area,
            grid: sched.grid,
            hour: sched.hour,
            date: sched.date
          });
        }
      });
    });

    if (matches.length === 0) {
      mldResults.innerHTML = `
        <div style="text-align:center; padding: 20px; border: 1px dashed var(--border-color); border-radius:12px; background-color:var(--bg-secondary);">
          <div style="font-weight:600; color:var(--text-primary); font-size:14px; margin-bottom:4px;">No Scheduled Load Shedding Found</div>
          <div style="color:var(--text-muted); font-size:12px;">"${mldSearchInput.value}" is not listed in today's Manual Load Dropping schedules.</div>
        </div>
      `;
      return;
    }

    matches.forEach(m => {
      const gridBadge = `<span class="badge ${m.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}">${m.grid}</span>`;
      const resultHtml = `
        <div class="list-item" style="border-left: 4px solid var(--status-info); background-color: #f0f9ff; border-color: var(--status-info);">
          <div>
            <div class="list-item-title" style="font-size:14px;">${m.area}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Scheduled outage on ${m.date}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-title); font-weight:700; font-size:13px; color:var(--text-primary);">${m.hour}</div>
            <div style="margin-top:2px;">${gridBadge}</div>
          </div>
        </div>
      `;
      mldResults.insertAdjacentHTML('beforeend', resultHtml);
    });
  };

  mldSearchInput.addEventListener('input', handleSearch);
  handleSearch();
}

// 11. Interactive Grid Reserves Margin Simulator (Luzon)
function setupReservesSimulator() {
  const gnpd = document.getElementById('sim-restore-gnpd');
  const tvi1 = document.getElementById('sim-restore-tvi1');
  const tvi2 = document.getElementById('sim-restore-tvi2');
  const pedc = document.getElementById('sim-restore-pedc');

  const runSimulation = () => {
    // Peak Demand: 13,881 MW
    // Base Available Capacity: 13,508 MW
    let restoredMW = 0;
    if (gnpd.checked) restoredMW += 668;
    if (tvi1.checked) restoredMW += 169;
    if (tvi2.checked) restoredMW += 169;
    if (pedc.checked) restoredMW += 150;

    const baseCapacity = 13508;
    const peakDemand = 13881;
    const simulatedCapacity = baseCapacity + restoredMW;
    const simulatedMargin = simulatedCapacity - peakDemand;
    const simulatedPercent = (simulatedMargin / peakDemand) * 100;

    // DOM Elements
    const statusCard = document.getElementById('sim-grid-status-card');
    const statusTitle = document.getElementById('sim-status-title');
    const statusDesc = document.getElementById('sim-status-desc');
    const marginBadge = document.getElementById('sim-margin-badge');
    const marginPercent = document.getElementById('sim-margin-percent');
    const marginBar = document.getElementById('sim-margin-bar');
    const wesmPrice = document.getElementById('sim-wesm-price');

    // Update available details
    statusDesc.innerHTML = `Available Luzon: ${simulatedCapacity.toLocaleString()} MW • Peak Demand: ${peakDemand.toLocaleString()} MW`;
    marginBadge.textContent = `${simulatedMargin > 0 ? '+' : ''}${Math.round(simulatedMargin).toLocaleString()} MW Margin`;

    // Alert levels: Red, Yellow, Normal
    let alertState = 'RED';
    if (simulatedMargin >= 250) {
      alertState = 'NORMAL';
    } else if (simulatedMargin >= -100) {
      alertState = 'YELLOW';
    }

    if (alertState === 'RED') {
      statusCard.style.borderColor = 'var(--status-red)';
      statusCard.style.backgroundColor = '#fee2e2';
      statusTitle.textContent = 'SYSTEM RED ALERT (Supply Deficit)';
      statusTitle.style.color = 'var(--status-red)';
      
      marginBadge.style.backgroundColor = 'var(--status-red-bg)';
      marginBadge.style.color = 'var(--status-red)';
      marginBadge.style.borderColor = 'var(--status-red-border)';

      marginBar.style.backgroundColor = 'var(--status-red)';
      wesmPrice.textContent = '₱32,000 / MWh';
      wesmPrice.style.color = 'var(--status-red)';
    } else if (alertState === 'YELLOW') {
      statusCard.style.borderColor = 'var(--status-yellow)';
      statusCard.style.backgroundColor = '#fef3c7';
      statusTitle.textContent = 'SYSTEM YELLOW ALERT (Contingency Deficit)';
      statusTitle.style.color = 'var(--status-yellow)';

      marginBadge.style.backgroundColor = 'var(--status-yellow-bg)';
      marginBadge.style.color = 'var(--status-yellow)';
      marginBadge.style.borderColor = 'var(--status-yellow-border)';

      marginBar.style.backgroundColor = 'var(--status-yellow)';
      wesmPrice.textContent = '₱21,180 / MWh';
      wesmPrice.style.color = 'var(--status-yellow)';
    } else {
      statusCard.style.borderColor = 'var(--status-normal)';
      statusCard.style.backgroundColor = '#d1fae5';
      statusTitle.textContent = 'SYSTEM NORMAL (Adequate Spare Reserves)';
      statusTitle.style.color = 'var(--status-normal)';

      marginBadge.style.backgroundColor = 'var(--status-normal-bg)';
      marginBadge.style.color = 'var(--status-normal)';
      marginBadge.style.borderColor = 'var(--status-normal-border)';

      marginBar.style.backgroundColor = 'var(--status-normal)';
      wesmPrice.textContent = '₱6,800 / MWh';
      wesmPrice.style.color = 'var(--status-normal)';
    }

    // Gauge Percent Calculations
    marginPercent.textContent = `${simulatedPercent > 0 ? '+' : ''}${simulatedPercent.toFixed(1)}% Spare Margin`;
    
    // Map -5% to +10% into 0% - 100% width
    const progressWidth = Math.max(0, Math.min(100, ((simulatedPercent + 5) / 15) * 100));
    marginBar.style.width = `${progressWidth}%`;
  };

  [gnpd, tvi1, tvi2, pedc].forEach(el => {
    if (el) el.addEventListener('change', runSimulation);
  });
  
  // Initial run
  runSimulation();
}

// 12. Floating Universal Global Search Panel logic
function setupGlobalSearch() {
  const globalInput = document.getElementById('global-search');
  const resultsContainer = document.getElementById('global-search-results');

  const performSearch = () => {
    const q = globalInput.value.trim().toLowerCase();
    resultsContainer.innerHTML = '';
    
    if (!q) {
      resultsContainer.style.display = 'none';
      return;
    }

    const matches = [];

    // Category A: Power Plants Registry (Max 3)
    let plantHits = 0;
    state.powerPlants.forEach(p => {
      if (plantHits < 3 && (
        p.facility.toLowerCase().includes(q) ||
        p.unit.toLowerCase().includes(q) ||
        p.genco.toLowerCase().includes(q) ||
        p.parentConglomerate.toLowerCase().includes(q)
      )) {
        matches.push({
          category: 'Power Plant Registry',
          title: `${p.facility} (${p.unit})`,
          desc: `${p.genco} • ${p.parentConglomerate} • ${Math.round(p.capacity)}MW`,
          action: () => {
            if (p.outagesList && p.outagesList.length > 0) {
              openDrawer(p.outagesList[0]);
            }
          }
        });
        plantHits++;
      }
    });

    // Category B: Outages logs (Max 3)
    let outageHits = 0;
    state.outages.forEach(o => {
      if (outageHits < 3 && (
        (o.facility && o.facility.toLowerCase().includes(q)) ||
        (o.genco && o.genco.toLowerCase().includes(q)) ||
        (o.reason && o.reason.toLowerCase().includes(q))
      )) {
        const isRestored = o.actual_resumption_date !== "";
        matches.push({
          category: 'Grid Outage Event Log',
          title: `${o.facility} (${o.unit}) — ${Math.round(o.capacity)} MW`,
          desc: `${o.grid} • ${isRestored ? 'Restored' : 'Active forced trip'} due to ${o.reason || 'unlogged trip'}`,
          action: () => {
            openDrawer(o);
          }
        });
        outageHits++;
      }
    });

    // Category C: Electrical Cooperatives MLD schedule (Max 2)
    let coopHits = 0;
    const allAreas = [
      { name: 'MERALCO (Metro Manila)', coop: 'meralco' },
      { name: 'VECO (Visayas Elec)', coop: 'veco' },
      { name: 'CEBECO I & II (Cebu)', coop: 'cebeco' },
      { name: 'LUELCO (La Union)', coop: 'luelco' },
      { name: 'BATELEC I & II (Batangas)', coop: 'batelec' },
      { name: 'ISELCO I & II (Isabela)', coop: 'iselco' },
      { name: 'ALECO (Albay)', coop: 'aleco' }
    ];

    allAreas.forEach(area => {
      if (coopHits < 2 && area.name.toLowerCase().includes(q)) {
        matches.push({
          category: 'Manual Load Dropping (MLD)',
          title: area.name,
          desc: 'Rolling scheduled power interruption cooperative block',
          action: () => {
            const tabBtn = document.querySelector('[data-tab="mld"]');
            if (tabBtn) tabBtn.click();
            
            const mldSearchInput = document.getElementById('mld-search');
            mldSearchInput.value = area.coop;
            
            // Dispatch input event to fire cooperative lookups
            mldSearchInput.dispatchEvent(new Event('input'));
          }
        });
        coopHits++;
      }
    });

    // Category D: Bulletins (Max 2)
    let bulletinHits = 0;
    state.ngcpUpdates.forEach(u => {
      if (bulletinHits < 2 && u.message.toLowerCase().includes(q)) {
        matches.push({
          category: 'NGCP System Telegram Update',
          title: `${u.type} (${u.timestamp})`,
          desc: u.message.substring(0, 70) + '...',
          action: () => {
            const tabBtn = document.querySelector('[data-tab="updates"]');
            if (tabBtn) tabBtn.click();
            
            // Scroll to the timeline node item
            const nodeId = `bulletin-node-${u.timestamp.replace(/\s+/g, '-')}`;
            const targetEl = document.getElementById(nodeId);
            if (targetEl) {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              targetEl.style.backgroundColor = 'var(--accent-light)';
              setTimeout(() => {
                targetEl.style.backgroundColor = '';
              }, 2500);
            }
          }
        });
        bulletinHits++;
      }
    });

    // Render hits in the floating results panel
    if (matches.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 16px; text-align:center; color:var(--text-muted); font-size:12.5px;">
          No matching profiles or logs found in the power system databases.
        </div>
      `;
    } else {
      matches.forEach(m => {
        const item = document.createElement('div');
        item.className = 'global-search-item';
        item.innerHTML = `
          <div class="global-search-category">${m.category}</div>
          <div class="global-search-title">${m.title}</div>
          <div class="global-search-desc">${m.desc}</div>
        `;
        
        item.addEventListener('mousedown', () => {
          m.action();
          resultsContainer.style.display = 'none';
          globalInput.value = '';
        });
        resultsContainer.appendChild(item);
      });
    }

    resultsContainer.style.display = 'block';
  };

  globalInput.addEventListener('input', performSearch);
  
  // Close dropdown on blur
  globalInput.addEventListener('blur', () => {
    // Delay slightly to allow click handlers on items to register
    setTimeout(() => {
      resultsContainer.style.display = 'none';
    }, 200);
  });

  globalInput.addEventListener('focus', () => {
    if (globalInput.value) {
      resultsContainer.style.display = 'block';
    }
  });
}

// 13. ERC Penalty & Risk Calculator logic
function updateErcCalculator() {
  const costInput = document.getElementById('calc-replacement-cost');
  const penaltyInput = document.getElementById('calc-penalty-rate');
  
  if (!costInput || !penaltyInput) return;
  
  const replacementCost = parseFloat(costInput.value) || 0;
  const penaltyRate = parseFloat(penaltyInput.value) || 0;
  
  let totalPenalties = 0;
  let totalReplacementExposure = 0;
  
  state.outages.forEach(o => {
    const statusVal = parseFloat(o.status) || 0; // Exceeded days
    if (statusVal > 0) {
      totalPenalties += statusVal * penaltyRate;
      const capacity = parseFloat(o.capacity) || 0;
      // Exposure = Exceeded Days * 24 Hours * Outage Capacity * Replacement Cost
      totalReplacementExposure += statusVal * 24 * capacity * replacementCost;
    }
  });
  
  const penaltiesEl = document.getElementById('out-total-penalties');
  const replacementEl = document.getElementById('out-total-replacement');
  
  if (penaltiesEl) {
    penaltiesEl.textContent = `₱${Math.round(totalPenalties).toLocaleString()}`;
  }
  if (replacementEl) {
    replacementEl.textContent = `₱${Math.round(totalReplacementExposure).toLocaleString()}`;
  }
}

// 14. Technology Reliability Scorecard logic
function renderTechScorecard() {
  const body = document.getElementById('tech-scorecard-body');
  if (!body) return;
  
  const techStats = {};
  state.outages.forEach(o => {
    const tech = o.technology || 'Other';
    const duration = parseFloat(o.accumulated_days) || 0;
    
    if (!techStats[tech]) {
      techStats[tech] = { count: 0, totalDuration: 0 };
    }
    techStats[tech].count++;
    techStats[tech].totalDuration += duration;
  });
  
  const sorted = Object.keys(techStats).map(tech => {
    const count = techStats[tech].count;
    const avgDuration = count > 0 ? techStats[tech].totalDuration / count : 0;
    
    let riskGrade = 'LOW RISK';
    let riskColor = 'var(--status-normal)';
    
    if (count > 25 && avgDuration > 10) {
      riskGrade = 'CRITICAL';
      riskColor = 'var(--status-red)';
    } else if (count > 10 || avgDuration > 8) {
      riskGrade = 'HIGH RISK';
      riskColor = 'var(--status-yellow)';
    } else if (count > 3) {
      riskGrade = 'MED RISK';
      riskColor = '#64748b';
    }
    
    return { tech, count, avgDuration, riskGrade, riskColor };
  }).sort((a, b) => b.count - a.count);
  
  body.innerHTML = '';
  sorted.forEach(s => {
    const row = `
      <tr>
        <td style="font-weight:600; padding:10px; color:var(--text-secondary); border-bottom: 1px solid var(--border-light);">${s.tech}</td>
        <td style="text-align:center; padding:10px; font-weight:700; border-bottom: 1px solid var(--border-light);">${s.count} Trips</td>
        <td style="text-align:right; padding:10px; font-family:var(--font-title); font-weight:600; border-bottom: 1px solid var(--border-light);">${s.avgDuration.toFixed(1)} Days</td>
        <td style="text-align:center; padding:10px; border-bottom: 1px solid var(--border-light);">
          <span class="badge" style="border:none; background-color:${s.riskColor}15; color:${s.riskColor}; font-weight:800; font-size:9.5px; padding:2px 6px;">${s.riskGrade}</span>
        </td>
      </tr>
    `;
    body.insertAdjacentHTML('beforeend', row);
  });
}

function openDetailDrawer(p) {
  if (p && p.outagesList && p.outagesList.length > 0) {
    openDrawer(p.outagesList[0]);
  }
}

// 15. Chronological Outage Calendar Heatmap Controller
function setupCalendar() {
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
      renderCalendarGrid();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
      renderCalendarGrid();
    });
  }
}

function parseOutageDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Clean text patterns from Viber logs
  const lower = dateStr.toLowerCase();
  if (lower.includes('may 12') || lower.includes('12 may')) return new Date(2026, 4, 12);
  if (lower.includes('may 13') || lower.includes('13 may')) return new Date(2026, 4, 13);
  if (lower.includes('may 14') || lower.includes('14 may')) return new Date(2026, 4, 14);
  if (lower.includes('may 15') || lower.includes('15 may')) return new Date(2026, 4, 15);
  if (lower.includes('may 16') || lower.includes('16 may')) return new Date(2026, 4, 16);
  if (lower.includes('may 17') || lower.includes('17 may')) return new Date(2026, 4, 17);
  if (lower.includes('may 18') || lower.includes('18 may')) return new Date(2026, 4, 18);
  if (lower.includes('may 19') || lower.includes('19 may')) return new Date(2026, 4, 19);
  
  return null;
}

function renderCalendarGrid() {
  const grid = document.getElementById('calendar-days-grid');
  const title = document.getElementById('cal-month-year');
  if (!grid || !title) return;
  
  const targetYear = state.calendarDate.getFullYear();
  const targetMonth = state.calendarDate.getMonth(); // 0-11
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  title.textContent = `${monthNames[targetMonth]} ${targetYear}`;
  grid.innerHTML = '';
  
  // Add Day Labels
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  daysOfWeek.forEach(day => {
    grid.insertAdjacentHTML('beforeend', `<div class="calendar-day-label">${day}</div>`);
  });
  
  // Calculate Calendar boundaries
  const firstDayIndex = new Date(targetYear, targetMonth, 1).getDay();
  const totalDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  
  // Gather all outages on each date of this month
  const dailyTrips = {};
  state.outages.forEach(o => {
    const oDate = parseOutageDate(o.date_out);
    if (oDate && oDate.getFullYear() === targetYear && oDate.getMonth() === targetMonth) {
      const dateNum = oDate.getDate();
      if (!dailyTrips[dateNum]) {
        dailyTrips[dateNum] = [];
      }
      dailyTrips[dateNum].push(o);
    }
  });
  
  // Spacer cells for previous month
  for (let i = 0; i < firstDayIndex; i++) {
    grid.insertAdjacentHTML('beforeend', `<div class="calendar-cell other-month"></div>`);
  }
  
  // Day grids
  for (let day = 1; day <= totalDays; day++) {
    const outages = dailyTrips[day] || [];
    const count = outages.length;
    let totalMw = 0;
    outages.forEach(o => { totalMw += parseFloat(o.capacity) || 0; });
    
    // Choose density level
    let densityClass = 'density-level-0';
    if (count >= 12) densityClass = 'density-level-4';
    else if (count >= 6) densityClass = 'density-level-3';
    else if (count >= 3) densityClass = 'density-level-2';
    else if (count >= 1) densityClass = 'density-level-1';
    
    const cellId = `cal-cell-${day}`;
    const cellHtml = `
      <div class="calendar-cell ${densityClass}" id="${cellId}" data-day="${day}">
        <span class="calendar-date-num">${day}</span>
        ${count > 0 ? `<span class="calendar-cell-trips">${count} Trips</span>` : ''}
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', cellHtml);
    
    const cellElement = document.getElementById(cellId);
    if (cellElement) {
      cellElement.addEventListener('click', () => {
        // Highlight active day
        document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('active-day'));
        cellElement.classList.add('active-day');
        showOutagesForDate(targetYear, targetMonth, day, outages);
      });
    }
  }
  
  // Auto-select May 15, 2026 on initial calendar load
  if (targetYear === 2026 && targetMonth === 4) {
    const targetCell = document.getElementById('cal-cell-15');
    if (targetCell) {
      targetCell.click();
    }
  } else {
    // Select first day of month if not May
    const firstCell = document.getElementById('cal-cell-1');
    if (firstCell) {
      firstCell.click();
    }
  }
}

function showOutagesForDate(year, month, day, outages) {
  const dateStrEl = document.getElementById('calendar-selected-date-str');
  const listEl = document.getElementById('calendar-date-outages-list');
  if (!dateStrEl || !listEl) return;
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  dateStrEl.textContent = `${monthNames[month]} ${day}, ${year}`;
  listEl.innerHTML = '';
  
  if (outages.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding: 30px; color:var(--text-muted); font-size:12px; border:1px dashed var(--border-color); border-radius:8px;">
        No generator forced trippings were logged on this date.
      </div>
    `;
    return;
  }
  
  outages.forEach(o => {
    const card = document.createElement('div');
    card.className = 'list-item';
    card.style.cursor = 'pointer';
    card.style.borderLeft = `4px solid ${o.grid === 'Luzon' ? '#4f46e5' : '#10b981'}`;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:12.5px; color:var(--text-primary);">${o.facility} (${o.unit})</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${o.technology} • ${o.genco}</div>
        </div>
        <span class="badge" style="font-family:var(--font-title); font-weight:700; font-size:11px; color:var(--status-red); background-color:rgba(239, 68, 68, 0.1); border:none;">-${Math.round(o.capacity)} MW</span>
      </div>
      <div style="font-size:11.5px; color:var(--text-secondary); margin-top:6px; line-height:1.4; font-style:italic;">
        "${o.reason || 'Cause not specified'}"
      </div>
    `;
    
    // Bind drawer click shortcut
    card.addEventListener('click', () => {
      // Find matching plant profile in registry to open drawer
      const plantProfile = state.powerPlants.find(p => p.facility === o.facility && p.unit === o.unit);
      if (plantProfile) {
        openDetailDrawer(plantProfile);
      }
    });
    
    listEl.appendChild(card);
  });
}

// 16. Leaflet Map Geographic Explorer Controller
// Dictionary of major Philippine power plants coordinates
const plantCoordinates = [
  { name: 'GNPD CFPP', lat: 14.4371, lng: 120.5367 },
  { name: 'TVI', lat: 10.3797, lng: 123.6367 },
  { name: 'PEDC', lat: 10.7022, lng: 122.6103 },
  { name: 'Masinloc Power Plant', lat: 15.5417, lng: 119.9572 },
  { name: 'Sta. Rita Power Plant', lat: 13.7744, lng: 121.0264 },
  { name: 'Calaca Power Plant', lat: 13.9264, lng: 120.7936 },
  { name: 'Sual Power Plant', lat: 16.1260, lng: 120.1017 },
  { name: 'Kepco-SPC', lat: 10.2106, lng: 123.7550 },
  { name: 'Palimpinon Geothermal', lat: 9.2889, lng: 123.1814 },
  { name: 'Tongonan Geothermal', lat: 11.1442, lng: 124.6339 },
  { name: 'Ilijan CCPP', lat: 13.6264, lng: 121.0964 }
];

// Dictionary of regional Philippine distribution utilities / coops coordinates (Extensive List)
const utilityCoordinates = [
  // Luzon Grid Utilities
  { name: 'MERALCO', sector: 'Luzon', lat: 14.5878, lng: 121.0625 },
  { name: 'Dasmariñas Substation', sector: 'Luzon', lat: 14.3292, lng: 120.9367 },
  { name: 'Tayabas Substation', sector: 'Luzon', lat: 14.0247, lng: 121.5833 },
  { name: 'BENECO (Benguet)', sector: 'Luzon', lat: 16.4164, lng: 120.5931 },
  { name: 'PANELCO I (Pangasinan)', sector: 'Luzon', lat: 16.0270, lng: 119.9806 },
  { name: 'CAGELCO I (Cagayan)', sector: 'Luzon', lat: 17.6132, lng: 121.7270 },
  { name: 'ISELCO I (Isabela)', sector: 'Luzon', lat: 16.9749, lng: 121.7709 },
  { name: 'NECO (Nueva Ecija)', sector: 'Luzon', lat: 15.4855, lng: 120.9674 },
  { name: 'PELCO I (Pampanga)', sector: 'Luzon', lat: 15.0083, lng: 120.6975 },
  { name: 'PENELCO (Bataan)', sector: 'Luzon', lat: 14.6792, lng: 120.5412 },
  { name: 'TARLAC II (Tarlac)', sector: 'Luzon', lat: 15.4802, lng: 120.5979 },
  { name: 'ZAMECO I (Zambales)', sector: 'Luzon', lat: 15.3256, lng: 120.0811 },
  { name: 'QUEZELCO I (Quezon)', sector: 'Luzon', lat: 13.9372, lng: 121.6146 },
  { name: 'CASURECO II (Camarines Sur)', sector: 'Luzon', lat: 13.6218, lng: 123.1948 },
  { name: 'ALECO (Albay)', sector: 'Luzon', lat: 13.1437, lng: 123.7438 },
  { name: 'SORECO I (Sorsogon)', sector: 'Luzon', lat: 12.9620, lng: 123.9930 },
  { name: 'BATELEC I (Batangas)', sector: 'Luzon', lat: 13.7565, lng: 121.0583 },
  { name: 'ORMECO (Oriental Mindoro)', sector: 'Luzon', lat: 13.4115, lng: 121.1802 },
  { name: 'BISELCO (Biliran)', sector: 'Luzon', lat: 11.5976, lng: 124.4754 },

  // Visayas Grid Utilities
  { name: 'VECO (Metro Cebu)', sector: 'Visayas', lat: 10.3204, lng: 123.9056 },
  { name: 'CEBECO I (Cebu South)', sector: 'Visayas', lat: 10.0135, lng: 123.5410 },
  { name: 'CEBECO II (Cebu North)', sector: 'Visayas', lat: 10.7989, lng: 124.0150 },
  { name: 'ILECO I (Iloilo South)', sector: 'Visayas', lat: 10.7811, lng: 122.5639 },
  { name: 'ILECO II (Iloilo Central)', sector: 'Visayas', lat: 10.9984, lng: 122.6841 },
  { name: 'AKELCO (Aklan)', sector: 'Visayas', lat: 11.7058, lng: 122.3608 },
  { name: 'ANTECO (Antique)', sector: 'Visayas', lat: 11.0028, lng: 122.0461 },
  { name: 'CAPELCO (Capiz)', sector: 'Visayas', lat: 11.5853, lng: 122.7554 },
  { name: 'NONECO (Negros Occ North)', sector: 'Visayas', lat: 10.9022, lng: 123.3644 },
  { name: 'CENECO (Bacolod)', sector: 'Visayas', lat: 10.6765, lng: 122.9509 },
  { name: 'NORECO I (Negros Or North)', sector: 'Visayas', lat: 9.7153, lng: 123.1554 },
  { name: 'NORECO II (Negros Or South)', sector: 'Visayas', lat: 9.3084, lng: 123.3077 },
  { name: 'LEYECO II (Tacloban)', sector: 'Visayas', lat: 11.2432, lng: 125.0042 },
  { name: 'LEYECO V (Leyte West)', sector: 'Visayas', lat: 11.0022, lng: 124.4444 },
  { name: 'SAMELCO I (Samar West)', sector: 'Visayas', lat: 12.0620, lng: 124.5930 },
  { name: 'SAMELCO II (Samar East)', sector: 'Visayas', lat: 11.7011, lng: 125.0644 },
  { name: 'SOLECO (Southern Leyte)', sector: 'Visayas', lat: 10.1378, lng: 124.9988 }
];

function setupMap() {
  const fitLuzon = document.getElementById('map-fit-luzon');
  const fitVisayas = document.getElementById('map-fit-visayas');
  const fitAll = document.getElementById('map-fit-all');
  
  if (fitLuzon) {
    fitLuzon.addEventListener('click', () => {
      if (state.mapInstance) state.mapInstance.setView([15.2, 121.0], 7);
    });
  }
  if (fitVisayas) {
    fitVisayas.addEventListener('click', () => {
      if (state.mapInstance) state.mapInstance.setView([10.6, 123.5], 8);
    });
  }
  if (fitAll) {
    fitAll.addEventListener('click', () => {
      if (state.mapInstance) state.mapInstance.setView([13.0, 122.0], 6);
    });
  }
}

// Global popup helper
window.mapOpenDrawer = function(facility, unit) {
  const plantProfile = state.powerPlants.find(p => p.facility === facility && p.unit === unit);
  if (plantProfile) {
    openDetailDrawer(plantProfile);
  }
};

// Dictionary of major high-voltage transmission lines (Luzon and Visayas backbone)
const transmissionLines = [
  { name: 'Masinloc - MERALCO 230kV Evacuation Line', startPlant: 'Masinloc Power Plant', endUtility: 'MERALCO' },
  { name: 'Masinloc - ZAMECO I 69kV Line', startPlant: 'Masinloc Power Plant', endUtility: 'ZAMECO I (Zambales)' },
  { name: 'Sual - BENECO 230kV TransCo Trunk Line', startPlant: 'Sual Power Plant', endUtility: 'BENECO (Benguet)' },
  { name: 'Sual - PANELCO I 115kV Transmission Line', startPlant: 'Sual Power Plant', endUtility: 'PANELCO I (Pangasinan)' },
  { name: 'GNPD - PENELCO 230kV Evacuation Line', startPlant: 'GNPD CFPP', endUtility: 'PENELCO (Bataan)' },
  { name: 'Calaca - BATELEC I 115kV Evacuation Line', startPlant: 'Calaca Power Plant', endUtility: 'BATELEC I (Batangas)' },
  { name: 'Sta. Rita - MERALCO 230kV Evacuation Line', startPlant: 'Sta. Rita Power Plant', endUtility: 'MERALCO' },
  { name: 'Sta. Rita - BATELEC I 115kV Line', startPlant: 'Sta. Rita Power Plant', endUtility: 'BATELEC I (Batangas)' },
  { name: 'Tongonan - LEYECO II 138kV Line', startPlant: 'Tongonan Geothermal', endUtility: 'LEYECO II (Tacloban)' },
  { name: 'Tongonan - VECO Leyte-Cebu Interconnection Cable', startPlant: 'Tongonan Geothermal', endUtility: 'VECO (Metro Cebu)' },
  { name: 'Palimpinon - NORECO II 138kV Line', startPlant: 'Palimpinon Geothermal', endUtility: 'NORECO II (Negros Or South)' },
  { name: 'PEDC - ILECO I Panay 138kV Backbone Line', startPlant: 'PEDC', endUtility: 'ILECO I (Iloilo South)' },
  { name: 'PEDC - AKELCO Panay-Aklan 138kV Line', startPlant: 'PEDC', endUtility: 'AKELCO (Aklan)' },
  { name: 'TVI Toledo - VECO Cebu 138kV Backbone Link', startPlant: 'TVI', endUtility: 'VECO (Metro Cebu)' },
  { name: 'TVI Toledo - CEBECO I 69kV Line', startPlant: 'TVI', endUtility: 'CEBECO I (Cebu South)' },
  { name: 'Kepco-SPC Naga - VECO Cebu 138kV Line', startPlant: 'Kepco-SPC', endUtility: 'VECO (Metro Cebu)' },
  { name: 'Ilijan - Dasmariñas 500kV Transmission Line', startPlant: 'Ilijan CCPP', endUtility: 'Dasmariñas Substation' },
  { name: 'Ilijan - Tayabas 500kV Transmission Line', startPlant: 'Ilijan CCPP', endUtility: 'Tayabas Substation' }
];

function initLeafletMap() {
  const mapContainer = document.getElementById('grid-leaflet-map');
  if (!mapContainer || state.mapInstance) {
    if (state.mapInstance) {
      state.mapInstance.invalidateSize();
    }
    return;
  }
  
  // Create map instance
  state.mapInstance = L.map('grid-leaflet-map').setView([13.0, 122.0], 6);
  
  // Sleek Positron Light Tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 18
  }).addTo(state.mapInstance);
  
  // Reset and draw Transmission Polylines (Underneath markers)
  state.mapPolylines = [];
  transmissionLines.forEach(line => {
    const startCoord = plantCoordinates.find(c => c.name === line.startPlant);
    const endCoord = utilityCoordinates.find(c => c.name === line.endUtility);
    
    if (startCoord && endCoord) {
      const polyline = L.polyline([[startCoord.lat, startCoord.lng], [endCoord.lat, endCoord.lng]], {
        color: '#10b981', // Safe energize green
        weight: 3.5,
        opacity: 0.8,
        dashArray: 'none'
      }).addTo(state.mapInstance);
      
      const popupHtml = `
        <div style="font-family: var(--font-body); width: 220px;">
          <div style="font-weight:700; font-size:13px; color:var(--text-primary);">${line.name}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Type: High-Voltage Transmission Line Grid evacuated</div>
          <div style="font-size:11.5px; margin-top:6px; line-height: 1.4;">
            <strong>Evacuation Station:</strong> ${line.startPlant}<br>
            <strong>Distribution Coop:</strong> ${line.endUtility}<br>
            <strong id="line-popup-status-${line.name.replace(/\s+/g, '')}">Operational Status:</strong> <span style="color:#10b981; font-weight:700;">ENERGIZED</span>
          </div>
        </div>
      `;
      polyline.bindPopup(popupHtml);
      
      polyline.startPlant = line.startPlant;
      polyline.endUtility = line.endUtility;
      polyline.lineName = line.name;
      
      state.mapPolylines.push(polyline);
    }
  });
  
  // Populate Plant Markers
  state.powerPlants.forEach(p => {
    let coord = plantCoordinates.find(c => p.facility.startsWith(c.name));
    if (!coord) {
      if (p.grid === 'Luzon') {
        coord = { lat: 14.5 + (Math.random() - 0.5) * 1.5, lng: 121.0 + (Math.random() - 0.5) * 1.0 };
      } else {
        coord = { lat: 10.5 + (Math.random() - 0.5) * 1.2, lng: 123.5 + (Math.random() - 0.5) * 1.2 };
      }
    }
    
    const isOffline = p.activeOutage;
    const color = isOffline ? '#ef4444' : '#10b981';
    
    const marker = L.circleMarker([coord.lat, coord.lng], {
      radius: 9,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.95
    }).addTo(state.mapInstance);
    
    const popupHtml = `
      <div style="font-family: var(--font-body); width: 200px;">
        <div style="font-weight:700; font-size:13px; color:var(--text-primary);">${p.facility} (${p.unit})</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Owner: ${p.genco}</div>
        <div style="font-size:11.5px; margin-top:6px; line-height: 1.4;">
          <strong>Fuel Technology:</strong> ${p.technology}<br>
          <strong>Max Capacity:</strong> ${Math.round(p.capacity)} MW<br>
          <strong>Outage Days:</strong> ${p.accumulatedDays.toFixed(1)} Days<br>
          <strong id="pop-status-${p.facility.replace(/\s+/g, '')}-${p.unit.replace(/\s+/g, '')}">Status:</strong> ${isOffline ? '<span style="color:#ef4444; font-weight:700;">OFFLINE</span>' : '<span style="color:#10b981; font-weight:700;">RESTORED</span>'}
        </div>
        <div style="margin-top:10px;">
          <button class="reset-button" onclick="window.mapOpenDrawer('${p.facility.replace(/'/g, "\\'")}', '${p.unit.replace(/'/g, "\\'")}')" style="width:100%; text-align:center; padding: 5px 8px; font-size:11px; cursor:pointer;">View Plant History</button>
        </div>
      </div>
    `;
    
    marker.bindPopup(popupHtml);
    
    // Tag marker properties for simulation
    marker.isPlant = true;
    marker.facilityKey = `${p.facility.trim()} | ${p.unit.trim()}`;
    marker.plantName = `${p.facility.trim()} (${p.unit.trim()})`;
    marker.capacity = p.capacity;
    
    state.mapMarkers.push(marker);
  });
  
  // Populate Distribution Utility / Coop Markers
  utilityCoordinates.forEach(u => {
    const marker = L.circleMarker([u.lat, u.lng], {
      radius: 8,
      fillColor: '#4f46e5', // Indigo
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.9
    }).addTo(state.mapInstance);
    
    const popupHtml = `
      <div style="font-family: var(--font-body); width: 180px;">
        <div style="font-weight:700; font-size:13px; color:var(--text-primary);">${u.name}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Grid Sector: ${u.sector}</div>
        <div style="font-size:11.5px; margin-top:6px; line-height: 1.4;">
          <strong>Rotational Shedding:</strong> Active MLD Schedule<br>
          <strong>Interruption Duration:</strong> 2 to 3 hour cycles
        </div>
      </div>
    `;
    
    marker.bindPopup(popupHtml);
    
    // Tag marker properties for simulation
    marker.isCoop = true;
    marker.coopName = u.name;
    marker.sector = u.sector;
    
    state.mapMarkers.push(marker);
  });

  // Precompute and initialize simulated timeline controllers
  precomputeSimulationTimeline();
  initSimulation();
}

// 17. Programmatic Chronological Playback Outage Simulator Controller
function precomputeSimulationTimeline() {
  const startTime = new Date(2026, 4, 12, 0, 0, 0); // May 12, 2026 00:00 (Start of outages logs)
  state.simTimeline = [];
  
  for (let hour = 0; hour < 168; hour++) {
    const simTime = new Date(startTime.getTime() + hour * 60 * 60 * 1000);
    
    // 1. Gather active outages at this hour
    const activeOutages = state.outages.filter(o => {
      if (!o.date_out) return false;
      const outDate = new Date(o.date_out + "T" + (o.time_out || "00:00"));
      if (isNaN(outDate.getTime())) return false;
      if (outDate > simTime) return false; // Tripped after this simulated hour
      
      // If no resumption date, it's still offline
      if (!o.actual_resumption_date) return true;
      
      const inDate = new Date(o.actual_resumption_date + "T" + (o.actual_resumption_time || "00:00"));
      if (isNaN(inDate.getTime())) return true;
      
      return inDate > simTime; // Synced after this simulated hour
    });
    
    // 2. Identify new trips exactly in this hour
    const trips = state.outages.filter(o => {
      if (!o.date_out) return false;
      const outDate = new Date(o.date_out + "T" + (o.time_out || "00:00"));
      if (isNaN(outDate.getTime())) return false;
      return outDate.getFullYear() === simTime.getFullYear() &&
             outDate.getMonth() === simTime.getMonth() &&
             outDate.getDate() === simTime.getDate() &&
             outDate.getHours() === simTime.getHours();
    });
    
    // 3. Identify new restorations synchronized exactly in this hour
    const restorations = state.outages.filter(o => {
      if (!o.actual_resumption_date) return false;
      const inDate = new Date(o.actual_resumption_date + "T" + (o.actual_resumption_time || "00:00"));
      if (isNaN(inDate.getTime())) return false;
      return inDate.getFullYear() === simTime.getFullYear() &&
             inDate.getMonth() === simTime.getMonth() &&
             inDate.getDate() === simTime.getDate() &&
             inDate.getHours() === simTime.getHours();
    });
    
    state.simTimeline.push({
      hourIndex: hour,
      timestamp: simTime,
      activeOutages: activeOutages,
      trips: trips,
      restorations: restorations
    });
  }
}

function initSimulation() {
  const playPauseBtn = document.getElementById('sim-play-pause-btn');
  const playIcon = document.getElementById('sim-play-icon');
  const pauseIcon = document.getElementById('sim-pause-icon');
  const resetBtn = document.getElementById('sim-reset-btn');
  const timeSlider = document.getElementById('sim-time-slider');
  const speedSlider = document.getElementById('sim-speed-slider');
  const speedLabel = document.getElementById('sim-speed-label');
  const simBadge = document.getElementById('sim-badge');
  
  if (!playPauseBtn || !timeSlider) return;
  
  // Reset simulation state
  state.simPlaying = false;
  state.simCurrentHour = 0;
  if (state.simInterval) {
    clearInterval(state.simInterval);
  }
  
  // Sync sliders
  timeSlider.value = 0;
  speedSlider.value = state.simSpeed;
  speedLabel.textContent = `${state.simSpeed} hrs/sec`;
  
  // Set initial simulated display hour
  setSimulationHour(0);
  
  // Play / Pause toggle listener
  playPauseBtn.addEventListener('click', () => {
    if (state.simPlaying) {
      pauseSimulation();
    } else {
      startSimulation();
    }
  });
  
  // Reset listener
  resetBtn.addEventListener('click', () => {
    resetSimulation();
  });
  
  // Timeline scrubbing slider listener
  timeSlider.addEventListener('input', (e) => {
    if (state.simPlaying) pauseSimulation();
    setSimulationHour(parseInt(e.target.value));
  });
  
  // Speed slider listener
  speedSlider.addEventListener('input', (e) => {
    state.simSpeed = parseInt(e.target.value);
    speedLabel.textContent = `${state.simSpeed} ${state.simSpeed === 1 ? 'hr' : 'hrs'}/sec`;
    
    // Restart simulation loop dynamically if active
    if (state.simPlaying) {
      pauseSimulation();
      startSimulation();
    }
  });
}

function startSimulation() {
  const playIcon = document.getElementById('sim-play-icon');
  const pauseIcon = document.getElementById('sim-pause-icon');
  const simBadge = document.getElementById('sim-badge');
  
  state.simPlaying = true;
  if (playIcon) playIcon.style.display = 'none';
  if (pauseIcon) pauseIcon.style.display = 'block';
  if (simBadge) {
    simBadge.style.display = 'flex';
    simBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
    simBadge.style.color = '#ef4444';
  }
  
  // Tick every 1000ms
  state.simInterval = setInterval(() => {
    state.simCurrentHour += state.simSpeed;
    if (state.simCurrentHour >= 167) {
      state.simCurrentHour = 167;
      setSimulationHour(state.simCurrentHour);
      pauseSimulation();
    } else {
      setSimulationHour(state.simCurrentHour);
    }
  }, 1000);
}

function pauseSimulation() {
  const playIcon = document.getElementById('sim-play-icon');
  const pauseIcon = document.getElementById('sim-pause-icon');
  
  state.simPlaying = false;
  if (playIcon) playIcon.style.display = 'block';
  if (pauseIcon) pauseIcon.style.display = 'none';
  
  if (state.simInterval) {
    clearInterval(state.simInterval);
  }
}

function resetSimulation() {
  pauseSimulation();
  state.simCurrentHour = 0;
  
  const timeSlider = document.getElementById('sim-time-slider');
  if (timeSlider) timeSlider.value = 0;
  
  const simBadge = document.getElementById('sim-badge');
  if (simBadge) simBadge.style.display = 'none';
  
  // Clear feed
  const tickerEl = document.getElementById('sim-event-ticker');
  if (tickerEl) {
    tickerEl.innerHTML = `
      <div id="sim-event-empty" style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-style: italic;">
        Start playback to stream live grid occurrences...
      </div>
    `;
  }
  
  setSimulationHour(0);
}

function setSimulationHour(hourIndex) {
  state.simCurrentHour = hourIndex;
  
  const timeSlider = document.getElementById('sim-time-slider');
  if (timeSlider) timeSlider.value = hourIndex;
  
  updateSimulationUI(hourIndex);
}

function updateSimulationUI(hourIndex) {
  const h = state.simTimeline[hourIndex];
  if (!h) return;
  
  // 1. Format clock display (e.g. May 15, 2026 02:00 PM)
  const clockEl = document.getElementById('sim-clock-display');
  if (clockEl) {
    const dtStr = h.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const tmStr = h.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    clockEl.textContent = `${dtStr} at ${tmStr}`;
  }
  
  // 2. Count active capacities and trip events
  let activeCapLost = 0;
  let activeTripsCount = 0;
  
  h.activeOutages.forEach(o => {
    activeCapLost += parseFloat(o.capacity) || 0;
    activeTripsCount++;
  });
  
  const mwEl = document.getElementById('sim-mw-offline');
  const countEl = document.getElementById('sim-trips-count');
  const consumersEl = document.getElementById('sim-consumers-affected');
  
  if (mwEl) mwEl.textContent = `${Math.round(activeCapLost).toLocaleString()} MW`;
  if (countEl) countEl.textContent = `${activeTripsCount} ${activeTripsCount === 1 ? 'Unit' : 'Units'}`;
  
  // Calculate estimated consumers affected (Philippine Grid Standard: ~1,150 consumers per MW)
  const estConsumers = activeCapLost > 0 ? Math.round(activeCapLost * 1150) : 0;
  if (consumersEl) {
    consumersEl.textContent = estConsumers.toLocaleString();
  }
  
  // 3. Set simulated Grid Status badge
  const gridStatusEl = document.getElementById('sim-grid-status');
  if (gridStatusEl) {
    if (activeCapLost > 2500) {
      gridStatusEl.textContent = 'RED ALERT';
      gridStatusEl.style.backgroundColor = '#ffeeef';
      gridStatusEl.style.color = '#ef4444';
      gridStatusEl.style.borderColor = '#fca5a5';
    } else if (activeCapLost > 1500) {
      gridStatusEl.textContent = 'YELLOW ALERT';
      gridStatusEl.style.backgroundColor = '#fffbeb';
      gridStatusEl.style.color = '#d97706';
      gridStatusEl.style.borderColor = '#fcd34d';
    } else {
      gridStatusEl.textContent = 'NORMAL';
      gridStatusEl.style.backgroundColor = '#dcfce7';
      gridStatusEl.style.color = '#15803d';
      gridStatusEl.style.borderColor = '#bbf7d0';
    }
  }
  
  // 4. Color code Leaflet map markers and transmission lines
  state.mapPolylines.forEach(polyline => {
    // Check if the generating station connected to this line has any active unit outage
    let isTrip = h.activeOutages.some(o => o.facility.trim().startsWith(polyline.startPlant));
    
    // Custom historical restoration overrides for Ilijan 500kV Lines:
    const simTime = h.timestamp;
    if (polyline.lineName === 'Ilijan - Tayabas 500kV Transmission Line') {
      const tripStart = new Date(2026, 4, 13, 6, 30);
      const tripEnd = new Date(2026, 4, 13, 14, 44);
      if (simTime >= tripStart && simTime < tripEnd) {
        isTrip = true;
      } else if (simTime >= tripEnd) {
        isTrip = false; // Restored at 2:44 PM
      }
    } else if (polyline.lineName === 'Ilijan - Dasmariñas 500kV Transmission Line') {
      const tripStart = new Date(2026, 4, 13, 4, 46);
      const tripEnd = new Date(2026, 4, 13, 16, 52);
      if (simTime >= tripStart && simTime < tripEnd) {
        isTrip = true;
      } else if (simTime >= tripEnd) {
        isTrip = false; // Restored at 4:52 PM
      }
    }
    
    const color = isTrip ? '#ef4444' : '#10b981'; // Tripped red, energized green
    const weight = isTrip ? 2.5 : 3.5;
    const dashPattern = isTrip ? '5, 8' : 'none';
    
    polyline.setStyle({
      color: color,
      weight: weight,
      dashArray: dashPattern
    });
    
    const popup = polyline.getPopup();
    if (popup) {
      let content = popup.getContent();
      if (content) {
        if (isTrip) {
          content = content.replace('ENERGIZED', 'TRIPPED (DE-ENERGIZED)').replace('#10b981', '#ef4444');
        } else {
          content = content.replace('TRIPPED (DE-ENERGIZED)', 'ENERGIZED').replace('#ef4444', '#10b981');
        }
        popup.setContent(content);
      }
    }
  });

  state.mapMarkers.forEach(marker => {
    if (marker.isPlant) {
      // Check if this plant unit has an active outage at this hour
      const isOut = h.activeOutages.some(o => `${o.facility.trim()} | ${o.unit.trim()}` === marker.facilityKey);
      const color = isOut ? '#ef4444' : '#10b981';
      
      marker.setStyle({ fillColor: color });
      
      // Update bound popup text dynamically
      const popup = marker.getPopup();
      if (popup) {
        let content = popup.getContent();
        if (content) {
          if (isOut) {
            content = content.replace('RESTORED', 'OFFLINE').replace('#10b981', '#ef4444');
          } else {
            content = content.replace('OFFLINE', 'RESTORED').replace('#ef4444', '#10b981');
          }
          popup.setContent(content);
        }
      }
    } else if (marker.isCoop) {
      // If grid under stress, highlight coops in warning orange to show MLD threat
      if (activeCapLost > 2500) {
        marker.setStyle({ fillColor: '#ef4444' }); // Red for high blackout stress
      } else if (activeCapLost > 1500) {
        marker.setStyle({ fillColor: '#f59e0b' }); // Orange for load shedding warning
      } else {
        marker.setStyle({ fillColor: '#4f46e5' }); // Safe Indigo
      }
    }
  });
  
  // 5. Append occurrences into Scrolling Events Feed
  const tickerEl = document.getElementById('sim-event-ticker');
  const emptyEl = document.getElementById('sim-event-empty');
  
  if (tickerEl) {
    if (emptyEl && (h.trips.length > 0 || h.restorations.length > 0)) {
      emptyEl.remove();
    }
    
    const timeStr = h.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = h.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    // Add trips
    h.trips.forEach(o => {
      const el = document.createElement('div');
      el.className = 'sim-event-card';
      el.style.padding = '8px';
      el.style.borderLeft = '3px solid #ef4444';
      el.style.backgroundColor = '#fff5f5';
      el.style.borderRadius = '4px';
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
      el.style.lineHeight = '1.3';
      el.style.animation = 'fadeIn 0.3s ease-out';
      
      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:10px; color:#c53030;">
          <span>⚠️ UNIT TRIP DETECTED</span>
          <span>${dateStr} • ${timeStr}</span>
        </div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:3px; font-size:11px;">
          ${o.facility} (${o.unit})
        </div>
        <div style="color:var(--text-secondary); font-size:10.5px; margin-top:2px;">
          Capacity Lost: <strong>-${Math.round(o.capacity)} MW</strong><br>
          Reason: <em>"${o.reason || 'Technical trip logged'}"</em>
        </div>
      `;
      tickerEl.appendChild(el);
      tickerEl.scrollTop = tickerEl.scrollHeight;
    });
    
    // Add restorations
    h.restorations.forEach(o => {
      const el = document.createElement('div');
      el.className = 'sim-event-card';
      el.style.padding = '8px';
      el.style.borderLeft = '3px solid #10b981';
      el.style.backgroundColor = '#f0fdf4';
      el.style.borderRadius = '4px';
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
      el.style.lineHeight = '1.3';
      el.style.animation = 'fadeIn 0.3s ease-out';
      
      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:10px; color:#15803d;">
          <span>✅ UNIT SYNCHRONIZED</span>
          <span>${dateStr} • ${timeStr}</span>
        </div>
        <div style="font-weight:700; color:var(--text-primary); margin-top:3px; font-size:11px;">
          ${o.facility} (${o.unit})
        </div>
        <div style="color:var(--text-secondary); font-size:10.5px; margin-top:2px;">
          Restored Capacity: <strong>+${Math.round(o.capacity)} MW</strong> back online.
        </div>
      `;
      tickerEl.appendChild(el);
      tickerEl.scrollTop = tickerEl.scrollHeight;
    });
  }
}

// 17. Client-Side Data Scrubbing & Sanitization Engine
function sanitizeOutagesData() {
  state.outages.forEach(o => {
    // 1. Sanitize time values (Excel fractional day floats like "0.1243" to proper "HH:MM")
    o.time_out = formatTimeVal(o.time_out);
    o.actual_resumption_time = formatTimeVal(o.actual_resumption_time);
    o.est_resumption_time = formatTimeVal(o.est_resumption_time);
    
    // 2. Sanitize date formats (non-standard strings like "TBD", "May 15, 2026" to standard "YYYY-MM-DD")
    o.date_out = formatDateVal(o.date_out);
    o.actual_resumption_date = formatDateVal(o.actual_resumption_date);
    o.est_resumption_date = formatDateVal(o.est_resumption_date);
  });
}

function formatTimeVal(val) {
  if (!val) return "";
  val = String(val).trim();
  if (val === "" || val === "-" || val.toUpperCase() === "N/A" || val.toUpperCase() === "NULL") return "";
  
  // If already standard HH:MM or HH:MM:SS format
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
    const parts = val.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  }
  
  // Convert Excel fractional day decimal floats (e.g. 0.12430555555555556)
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  return val;
}

function formatDateVal(val) {
  if (!val) return "";
  val = String(val).trim();
  if (val === "" || val === "-" || val.toUpperCase() === "TBD" || val.toUpperCase() === "N/A" || val.toUpperCase() === "NULL") return "";
  
  // If already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val;
  }
  
  // Soft parsing fallback for textual dates (e.g. "May 15, 2026")
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  return val;
}

// 18. Strategic Compliance & Affiliate Market Power Loop Controller
window.openDrawerByPlantKey = function(facility, unit) {
  const p = state.powerPlants.find(x => x.facility.toLowerCase().includes(facility.toLowerCase()) && x.unit.toLowerCase().includes(unit.toLowerCase()));
  if (p && p.outagesList && p.outagesList.length > 0) {
    openDrawer(p.outagesList[0]);
  } else {
    // Fallback: search raw outages
    const o = state.outages.find(x => x.facility.toLowerCase().includes(facility.toLowerCase()) && x.unit.toLowerCase().includes(unit.toLowerCase()));
    if (o) openDrawer(o);
  }
};

function setupStrategicAnalysisTab() {
  const container = document.getElementById('conglomerate-selectors');
  if (!container) return;
  const buttons = container.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active-conglom-btn'));
      btn.classList.add('active-conglom-btn');
      const group = btn.getAttribute('data-group');
      renderConglomerateMatrix(group);
    });
  });
}

function renderComplianceBreachLeaderboard() {
  const tbody = document.getElementById('compliance-breach-leaderboard-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Filter power plants that have exceeded their allowable outage days (exceededDays > 0)
  const breachers = state.powerPlants.filter(p => p.exceededDays > 0);
  
  // Sort descending by exceededDays
  breachers.sort((a, b) => b.exceededDays - a.exceededDays);

  if (breachers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">
          No power plant units have exceeded the annual unplanned ERC compliance limits during this period.
        </td>
      </tr>
    `;
    return;
  }

  breachers.forEach(p => {
    const allowance = p.outagesList && p.outagesList.length > 0 ? parseFloat(p.outagesList[0].outage_allowance) || 0 : 0;
    const accumulated = p.accumulatedDays;
    const exceeded = p.exceededDays;

    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.style.transition = 'background-color 0.2s';
    
    row.addEventListener('mouseover', () => {
      row.style.backgroundColor = 'var(--bg-secondary)';
    });
    row.addEventListener('mouseout', () => {
      row.style.backgroundColor = '';
    });

    row.addEventListener('click', () => {
      if (p.outagesList && p.outagesList.length > 0) {
        openDrawer(p.outagesList[0]);
      }
    });

    row.innerHTML = `
      <td style="padding: 12px 14px; font-weight: 500;">
        <span class="badge ${p.grid === 'Luzon' ? 'badge-grid-luzon' : 'badge-grid-visayas'}">${p.grid}</span>
      </td>
      <td style="padding: 12px 14px;">
        <div style="font-weight: 800; color: var(--text-primary);">${p.facility} (${p.unit})</div>
        <div style="font-size: 10px; color: var(--text-muted);">${p.genco}</div>
      </td>
      <td style="padding: 12px 14px; text-align: center; font-weight: 600; color: var(--text-secondary);">
        ${Math.round(p.capacity)}
      </td>
      <td style="padding: 12px 14px; text-align: center; font-weight: 500; color: var(--text-muted);">
        ${allowance.toFixed(1)}
      </td>
      <td style="padding: 12px 14px; text-align: center; font-weight: 600; color: var(--text-secondary);">
        ${accumulated.toFixed(1)}
      </td>
      <td style="padding: 12px 14px; text-align: right; font-weight: 800; color: var(--status-red);">
        +${exceeded.toFixed(1)}d
      </td>
      <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: var(--text-primary);">
        ₱${(100000 + (50000 * exceeded) + (1000 * p.capacity * exceeded)).toLocaleString('en-US', {maximumFractionDigits:0})}
      </td>
    `;
    tbody.appendChild(row);
  });
}

function renderConglomerateMatrix(filterGroup) {
  const container = document.getElementById('conglomerates-matrix-container');
  if (!container) return;
  container.innerHTML = '';
  
  const groups = [
    {
      id: 'aboitiz',
      className: 'aboitiz',
      title: 'Aboitiz Power (AP) Loop',
      badgeText: 'COAL TO DIESEL ARBITRAGE',
      badgeColor: '#f97316',
      plantSearch: { facility: 'TVI CFPP', unit: 'Unit 2' },
      plantName: 'TVI CFPP Units 1 & 2',
      technology: 'Coal Baseload',
      grid: 'Visayas Grid',
      capacity: '338',
      exceeded: '56.3',
      offtakers: 'VECO, NEPC, AEC, INEC, CEBECO I',
      contractedLevel: '109 MW Bilateral Capacity Allocations',
      contractImpact: 'Forced CEBECO & VECO utilities to purchase expensive replacement power from WESM.',
      peakerName: 'Therma Mobile (TMO) Units 1 & 2',
      peakerTech: '100 MW Oil Peaking Plants (Merchant)',
      description: '<strong>Economic Dynamic:</strong> TVI (Aboitiz) coal forced outages reduced Visayas reserve margins, triggering Red/Yellow alerts. Sibling Therma Mobile peaking units (also Aboitiz Power) were dispatched in WESM, setting the price at the <strong>₱32,000/MWh cap</strong> on multiple occasions (e.g. May 14, 15, and 16). While the group suffered capacity limits on baseload contracts, its merchant peaking assets captured massive windfall revenues from the spot market ceiling, paid for by retail consumers.'
    },
    {
      id: 'smc',
      className: 'smc',
      title: 'San Miguel Corporation (SMC) Loop',
      badgeText: 'GAS TO BESS DYNAMIC',
      badgeColor: '#3b82f6',
      plantSearch: { facility: 'Batangas CCPP', unit: 'Unit 1' },
      plantName: 'Batangas CCPP Unit 1 (EERI)',
      technology: 'Natural Gas Baseload',
      grid: 'Luzon Grid',
      capacity: '440',
      exceeded: '75.9',
      offtakers: 'MERALCO (Manila Electric Co.)',
      contractedLevel: '1,200 MW Meralco Power Supply Agreement',
      contractImpact: 'EERI outage directly exposed Meralco to massive replacement power purchase requirements in WESM.',
      peakerName: 'Jasaan, Villanueva, Kabankalan BESS',
      peakerTech: 'SMC Battery Energy Storage Systems (Merchant)',
      description: '<strong>Economic Dynamic:</strong> Excellent Energy Resources Inc. (EERI) Unit 1 suffered a prolonged outage in Luzon, restricting grid reserves and triggering Yellow/Red alerts. During these peak hours, SMC\'s strategically deployed Battery Energy Storage Systems (BESS) — Villanueva BESS, Jasaan BESS, and Kabankalan BESS — were dispatched to provide fast-acting reserves, repeatedly setting the WESM MCP at the <strong>₱32,000/MWh cap</strong>. SMC battery storage assets, with near-zero fuel costs, captured maximum spot market revenues, offsetting contract penalty exposures elsewhere in the conglomerate.'
    },
    {
      id: 'firstgen',
      className: 'firstgen',
      title: 'First Gen / EDC Loop',
      badgeText: 'GEOTHERMAL TO BESS DYNAMIC',
      badgeColor: '#10b981',
      plantSearch: { facility: 'Mahanagdong', unit: 'Unit 1' },
      plantName: 'Mahanagdong & Upper Mahiao Geothermal',
      technology: 'Geothermal Baseload',
      grid: 'Visayas Grid',
      capacity: '53',
      exceeded: '57.5',
      offtakers: 'LEYECO III/IV/V, ESAMELCO, DORELCO, BILECO',
      contractedLevel: '19 MW Electric Coop Allocations',
      contractImpact: 'Pushed local cooperatives in Leyte and Samar to experience rotational brownouts or buy spot power.',
      peakerName: 'Southern Negros BESS',
      peakerTech: 'EDC / First Gen Battery Storage (Merchant)',
      description: '<strong>Economic Dynamic:</strong> Multiple EDC geothermal units in the Visayas went on forced outage (exceeding annual limits by over 50+ days), contributing to regional capacity deficits. During these peak shortfall intervals (especially on May 13), First Gen\'s <strong>Southern Negros BESS</strong> set the WESM MCP at the <strong>₱32,000/MWh cap</strong> to support grid frequency. The geothermal shortfalls in capacity commitments were thus economically offset by sister battery spot market price-setting capture.'
    },
    {
      id: 'spc',
      className: 'spc',
      title: 'SPC Power Loop',
      badgeText: 'SUB-GRID ISLANDING PREMIUM',
      badgeColor: '#8b5cf6',
      plantSearch: { facility: 'Bohol DPP', unit: 'DG 1' },
      plantName: 'Bohol DPP Units 1, 2, 3',
      technology: 'Diesel Baseload',
      grid: 'Visayas Sub-Grid',
      capacity: '18',
      exceeded: '31.4',
      offtakers: 'Bilateral Cooperatives (Bohol)',
      contractedLevel: '18 MW Island Support Allocations',
      contractImpact: 'Islands experienced severe capacity deficits, requiring emergency local generation support.',
      peakerName: 'Bohol DPP Unit 4, PB 101/104',
      peakerTech: 'Bohol In-island DPP / Power Barges (Merchant)',
      description: '<strong>Economic Dynamic:</strong> With Bohol diesel units on forced outage, sister peaking units (Bohol DPP Unit 4, Bohol In-island DPP, and Power Barges 101/104) were run at full capacity to cover the local island deficit. During these sub-grid islanding events, these sister peaking plants set the WESM prices at the peak cap of <strong>₱32,000/MWh</strong>, capturing highly lucrative islanding premiums under localized market rules.'
    }
  ];

  const filtered = filterGroup === 'all' ? groups : groups.filter(g => g.id === filterGroup);
  
  filtered.forEach(g => {
    const card = document.createElement('div');
    card.className = `conglomerate-loop-card ${g.className}`;
    card.innerHTML = `
      <div class="loop-title-row">
        <div class="loop-title">${g.title}</div>
        <span class="badge" style="background-color: ${g.badgeColor}22; color: ${g.badgeColor}; border: 1px solid ${g.badgeColor}44; font-weight:800; font-size:11px;">
          ${g.badgeText}
        </span>
      </div>
      
      <div class="loop-visual-flow">
        <!-- Node 1: Baseload Outage -->
        <div class="loop-node" style="cursor: pointer;" onclick="openDrawerByPlantKey('${g.plantSearch.facility}', '${g.plantSearch.unit}')">
          <div class="loop-node-title" style="color:var(--status-red); border-bottom-color: #fee2e2;">Baseload Outage Asset</div>
          <div class="loop-node-content">
            <div style="font-weight:800; color:var(--text-primary); font-size:13px;">${g.plantName}</div>
            <div style="font-size:11px; color:var(--text-muted);">${g.technology} • ${g.grid}</div>
            <div style="font-size:11px; font-weight:700; margin-top:2px; color:var(--status-red);">Capacity Lost: -${g.capacity} MW</div>
            <div style="font-size:11px; color:#ef4444; font-weight:700; margin-top:1px;">+${g.exceeded} Days Limit Breach</div>
            <div style="font-size:9.5px; color:var(--accent-color); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:2px;">
              <span>🔍 Click to inspect outages</span>
            </div>
          </div>
        </div>
        
        <!-- Arrow 1 -->
        <div class="loop-arrow">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
        
        <!-- Node 2: Bilateral PSA Exposure -->
        <div class="loop-node">
          <div class="loop-node-title" style="color:var(--status-info); border-bottom-color: #e0f2fe;">Bilateral PSA Exposure</div>
          <div class="loop-node-content">
            <div style="font-weight:800; color:var(--text-primary); font-size:13px;">${g.offtakers}</div>
            <div style="font-size:11px; color:var(--text-muted);">${g.contractedLevel}</div>
            <div style="font-size:11.5px; line-height:1.4; margin-top:3px; color:var(--text-secondary);">${g.contractImpact}</div>
          </div>
        </div>
        
        <!-- Arrow 2 -->
        <div class="loop-arrow">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
        
        <!-- Node 3: Sibling Peaking Price-Setter -->
        <div class="loop-node">
          <div class="loop-node-title" style="color:#a855f7; border-bottom-color: #f3e8ff;">Affiliate Price-Setter</div>
          <div class="loop-node-content">
            <div style="font-weight:800; color:var(--text-primary); font-size:13px;">${g.peakerName}</div>
            <div style="font-size:11px; color:var(--text-muted);">${g.peakerTech}</div>
            <div style="font-size:11px; font-weight:700; color:#a855f7; margin-top:2px;">WESM Spot Peak Capture</div>
            <div style="font-size:12px; color:var(--accent-hover); font-weight:800; margin-top:1px;">₱32,000/MWh Price Cap</div>
          </div>
        </div>
      </div>
      
      <div class="loop-description">
        ${g.description}
      </div>
    `;
    container.appendChild(card);
  });
}

function renderStrategicAnalysisTab() {
  renderComplianceBreachLeaderboard();
  
  let activeGroup = 'all';
  const activeBtn = document.querySelector('#conglomerate-selectors button.active-conglom-btn');
  if (activeBtn) {
    activeGroup = activeBtn.getAttribute('data-group');
  }
  
  renderConglomerateMatrix(activeGroup);
  renderConglomerateViolationIndex();
  renderPenaltyWindfallAnalyzer();
  renderViolationHeatmap();
}

function renderConglomerateViolationIndex() {
  const container = document.getElementById('conglomerate-violation-index-container');
  if (!container) return;
  
  const groups = {};
  state.powerPlants.forEach(p => {
    if (p.exceededDays > 0) {
      if (!groups[p.parentConglomerate]) {
        groups[p.parentConglomerate] = { capacity: 0, penalty: 0 };
      }
      groups[p.parentConglomerate].capacity += parseFloat(p.capacity) || 0;
      groups[p.parentConglomerate].penalty += p.exceededDays * parseFloat(p.capacity) * 24 * 150000;
    }
  });

  const sortedGroups = Object.entries(groups).sort((a, b) => b[1].penalty - a[1].penalty);
  
  let html = '';
  sortedGroups.forEach(([name, data], idx) => {
    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-secondary); border-radius:8px; border-left:4px solid ${idx === 0 ? 'var(--status-red)' : 'var(--border-color)'};">
        <div>
          <div style="font-weight:700; color:var(--text-primary); font-size:13px;">${name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${data.capacity.toFixed(0)} MW Breached Capacity</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--font-title); font-weight:800; color:var(--status-red); font-size:14px;">PHP ${(data.penalty / 1e6).toFixed(1)}M</div>
          <div style="font-size:10px; color:var(--text-muted);">Est. Penalty Exposure</div>
        </div>
      </div>
    `;
  });
  
  if (sortedGroups.length === 0) html = '<div style="color:var(--text-muted); font-size:12px; padding:12px;">No limit breaches found.</div>';
  container.innerHTML = html;
}

function renderPenaltyWindfallAnalyzer() {
  const container = document.getElementById('penalty-windfall-analyzer-container');
  if (!container) return;

  const demoData = [
    { name: 'Aboitiz Power (AP)', penalty: 420.5, windfall: 1250.2 },
    { name: 'San Miguel Corp. (SMC)', penalty: 680.1, windfall: 2100.8 },
    { name: 'First Gen / EDC', penalty: 110.3, windfall: 340.5 },
    { name: 'SPC Power Corp.', penalty: 45.2, windfall: 190.0 }
  ];
  
  let html = '';
  demoData.forEach(d => {
    html += `
      <div style="padding:16px; border:1px solid var(--border-light); border-radius:12px; background:var(--bg-primary);">
        <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-bottom:12px;">${d.name}</div>
        
        <div style="display:flex; flex-direction:column; gap:8px;">
          <!-- Penalty Bar -->
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:70px; font-size:10px; color:var(--text-secondary); text-align:right; font-weight:600;">Penalty Risk</div>
            <div style="flex:1; background:var(--bg-secondary); height:8px; border-radius:4px; overflow:hidden;">
              <div style="width:${(d.penalty / 2500) * 100}%; background:var(--status-red); height:100%; border-radius:4px;"></div>
            </div>
            <div style="width:60px; font-size:11px; font-family:var(--font-title); font-weight:700; color:var(--status-red);">-₱${d.penalty.toFixed(0)}M</div>
          </div>
          
          <!-- Windfall Bar -->
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:70px; font-size:10px; color:var(--text-secondary); text-align:right; font-weight:600;">Est. Windfall</div>
            <div style="flex:1; background:var(--bg-secondary); height:8px; border-radius:4px; overflow:hidden;">
              <div style="width:${(d.windfall / 2500) * 100}%; background:var(--status-normal); height:100%; border-radius:4px;"></div>
            </div>
            <div style="width:60px; font-size:11px; font-family:var(--font-title); font-weight:700; color:var(--status-normal);">+₱${d.windfall.toFixed(0)}M</div>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function renderViolationHeatmap() {
  const container = document.getElementById('violation-heatmap-container');
  if (!container) return;
  
  const dates = ["2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15", "2026-05-16", "2026-05-17", "2026-05-18", "2026-05-19", "2026-05-20"];
  
  const groupsData = {};
  state.outages.forEach(o => {
    if (!o.date_out) return;
    const parent = getParentConglomerate(o.affiliates);
    if (!groupsData[parent]) groupsData[parent] = {};
    if (!groupsData[parent][o.date_out]) groupsData[parent][o.date_out] = 0;
    groupsData[parent][o.date_out]++;
  });

  // Header row
  let html = `<div class="heatmap-header-row"><div class="heatmap-label"></div><div class="heatmap-grid">`;
  dates.forEach(d => {
    html += `<div class="heatmap-header-label">${d.split('-')[2]}</div>`;
  });
  html += `</div></div>`;

  // Heatmap rows
  Object.keys(groupsData).sort().forEach(group => {
    html += `<div class="heatmap-row"><div class="heatmap-label">${group.length > 20 ? group.substring(0, 18) + '...' : group}</div><div class="heatmap-grid">`;
    dates.forEach(d => {
      const trips = groupsData[group][d] || 0;
      let level = 0;
      if (trips >= 8) level = 4;
      else if (trips >= 5) level = 3;
      else if (trips >= 3) level = 2;
      else if (trips >= 1) level = 1;
      
      html += `<div class="heatmap-cell heatmap-cell-${level}" title="${group} on ${d}: ${trips} trips">${trips}</div>`;
    });
    html += `</div></div>`;
  });
  
  if(Object.keys(groupsData).length === 0) {
      html = '<div style="color:var(--text-muted); font-size:12px; padding:12px;">No heatmap data available.</div>';
  }

  container.innerHTML = html;
}





function setupGompCalendar() {
  const searchInput = document.getElementById('gomp-search');
  const gridSelect = document.getElementById('gomp-grid-filter');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => { state.pagination.currentPage = 1; renderGompGrid(); });
  }
  if (gridSelect) {
    gridSelect.addEventListener('change', () => { state.pagination.currentPage = 1; renderGompGrid(); });
  }
  
  const prev = document.getElementById('gomp-pagination-prev');
  const next = document.getElementById('gomp-pagination-next');
  if (prev) prev.addEventListener('click', () => { state.pagination.currentPage = Math.max(1, state.pagination.currentPage - 1); renderGompGrid(); });
  if (next) next.addEventListener('click', () => { state.pagination.currentPage++; renderGompGrid(); });
}

function renderGompGrid() {
  const tbody = document.getElementById('gomp-table-body');
  if (!tbody) return;
  
  const searchInput = document.getElementById('gomp-search');
  const gridSelect = document.getElementById('gomp-grid-filter');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const gridFilter = gridSelect ? gridSelect.value : 'all';
  
  const filtered = state.gompOutages.filter(o => {
    const searchMatch = !searchTerm || o.plant.toLowerCase().includes(searchTerm);
    const gridMatch = gridFilter === 'all' || o.grid === gridFilter;
    return searchMatch && gridMatch;
  });
  
  document.getElementById('gomp-stats').textContent = `${filtered.length} Outages Scheduled`;
  
  const pageSize = 50;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  state.pagination.currentPage = Math.min(state.pagination.currentPage, totalPages);
  
  const start = (state.pagination.currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  
  tbody.innerHTML = '';
  pageItems.forEach(o => {
    let badgeColor = '#3b82f6';
    if (o.grid === 'Luzon') badgeColor = '#4f46e5';
    if (o.grid === 'Visayas') badgeColor = '#7c3aed';
    if (o.grid === 'Mindanao') badgeColor = '#10b981';
    
    const gridBadge = `<span class="badge" style="background:${badgeColor}20; color:${badgeColor}; border:none;">${o.grid}</span>`;
    
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${gridBadge}</td>
        <td style="font-weight: 600;">${o.plant}</td>
        <td>${o.capacity} MW</td>
        <td>${o.start}</td>
        <td>${o.end}</td>
        <td><div style="background:var(--bg-tertiary); border-radius:4px; height:6px; width:100%;"><div style="background:${badgeColor}; height:100%; width:100%; border-radius:4px;"></div></div></td>
      </tr>
    `);
  });
  
  const info = document.getElementById('gomp-pagination-info');
  if (info) {
    info.textContent = `Showing ${filtered.length === 0 ? 0 : start + 1} to ${Math.min(start + pageSize, filtered.length)} of ${filtered.length} entries`;
  }
}


// --- SLD & GOMP Interactive Simulation ---
let topologyState = {
  startDate: new Date(2026, 0, 1),
  currentDayOffset: 0,
  maxOffset: 1095, // 3 years roughly
  playing: false,
  playInterval: null,
  probabilityData: [],
  nodeElements: null,
  linkElements: null,
  simulation: null
};

function setupTopologySimulation() {
  const slider = document.getElementById('topology-timeline-slider');
  const playBtn = document.getElementById('topology-play-btn');
  
  if (slider) {
    slider.addEventListener('input', (e) => {
      topologyState.currentDayOffset = parseInt(e.target.value);
      updateTopologyForCurrentDate();
  if (state.charts.probChart) state.charts.probChart.draw();
    });
  }
  
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      topologyState.playing = !topologyState.playing;
      playBtn.textContent = topologyState.playing ? 'Pause' : 'Play Sim';
      
      if (topologyState.playing) {
        topologyState.playInterval = setInterval(() => {
          topologyState.currentDayOffset += 5; // skip 5 days at a time
          if (topologyState.currentDayOffset > topologyState.maxOffset) {
            topologyState.currentDayOffset = 0;
            topologyState.playing = false;
            playBtn.textContent = 'Play Sim';
            clearInterval(topologyState.playInterval);
          }
          if (slider) slider.value = topologyState.currentDayOffset;
          updateTopologyForCurrentDate();
  if (state.charts.probChart) state.charts.probChart.draw();
        }, 100);
      } else {
        clearInterval(topologyState.playInterval);
      }
    });
  }
  
  // Pre-calculate Alert Probabilities for the entire timeline
  calculateAlertProbabilities();
}


function parseGompDate(dateStr, targetYear) {
  if (!dateStr) return new Date(NaN);
  const monthStr = dateStr.substring(0, 3);
  const dayStr = dateStr.substring(3);
  const monthMap = { 'Jan':0, 'Feb':1, 'Mar':2, 'Apr':3, 'May':4, 'Jun':5, 'Jul':6, 'Aug':7, 'Sep':8, 'Oct':9, 'Nov':10, 'Dec':11 };
  const month = monthMap[monthStr];
  const day = parseInt(dayStr, 10);
  if (month === undefined || isNaN(day)) return new Date(NaN);
  return new Date(targetYear, month, day);
}

function isGompActiveOnDate(o, d) {
  const targetYear = d.getFullYear();
  let start = parseGompDate(o.start, targetYear);
  let end = parseGompDate(o.end, targetYear);
  
  if (isNaN(start) || isNaN(end)) return false;
  
  if (end < start) {
    if (d.getMonth() === 11) {
      end.setFullYear(targetYear + 1);
    } else {
      start.setFullYear(targetYear - 1);
    }
  }
  return d >= start && d <= end;
}

function calculateAlertProbabilities() {
  const timeline = [];
  
  for (let i = 0; i <= topologyState.maxOffset; i++) {
    const d = new Date(topologyState.startDate);
    d.setDate(d.getDate() + i);
    
    let luzonMw = 0, visayasMw = 0, mindanaoMw = 0;
    
    state.gompOutages.forEach(o => {
      if (isGompActiveOnDate(o, d)) {
        const cap = parseFloat(o.capacity) || 0;
        if (o.grid === 'Luzon') luzonMw += cap;
        else if (o.grid === 'Visayas') visayasMw += cap;
        else if (o.grid === 'Mindanao') mindanaoMw += cap;
      }
    });
    
    let luzonRed = 0, luzonYellow = 0;
    if (luzonMw >= 4000) { luzonRed = 80; luzonYellow = 20; }
    else if (luzonMw >= 3000) { luzonRed = 20; luzonYellow = 60; }
    else if (luzonMw >= 2000) { luzonRed = 0; luzonYellow = 25; }
    
    let visayasRed = 0, visayasYellow = 0;
    if (visayasMw >= 1100) { visayasRed = 80; visayasYellow = 20; }
    else if (visayasMw >= 800) { visayasRed = 20; visayasYellow = 60; }
    else if (visayasMw >= 500) { visayasRed = 0; visayasYellow = 25; }
    
    let minRed = 0, minYellow = 0;
    if (mindanaoMw >= 1400) { minRed = 80; minYellow = 20; }
    else if (mindanaoMw >= 1000) { minRed = 20; minYellow = 60; }
    else if (mindanaoMw >= 700) { minRed = 0; minYellow = 25; }
    
    timeline.push({ 
      day: i, date: new Date(d), 
      luzonRed, luzonYellow, 
      visayasRed, visayasYellow, 
      minRed, minYellow 
    });
  }
  
  topologyState.probabilityData = timeline;
  renderProbabilityChart();
}

const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: chart => {
    if (topologyState.currentDayOffset !== undefined && topologyState.currentDayOffset < chart.data.labels.length) {
      const meta = chart.getDatasetMeta(0);
      const point = meta.data[topologyState.currentDayOffset];
      if (point) {
        const x = point.x;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chart.scales.y.top);
        ctx.lineTo(x, chart.scales.y.bottom);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'var(--text-primary)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};

function renderProbabilityChart() {
  const ctx = document.getElementById('topologyProbabilityChart');
  if (!ctx || !topologyState.probabilityData.length) return;
  
  // Use all data points for smooth line & slider matching
  const labels = topologyState.probabilityData.map(d => d.date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'2-digit'}));
  
  if (state.charts.probChart) state.charts.probChart.destroy();
  
  state.charts.probChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Luzon Red Alert',
          data: topologyState.probabilityData.map(d => d.luzonRed),
          borderColor: '#ef4444',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Luzon Yellow Alert',
          data: topologyState.probabilityData.map(d => d.luzonYellow),
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Visayas Red Alert',
          data: topologyState.probabilityData.map(d => d.visayasRed),
          borderColor: '#7c3aed',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Visayas Yellow Alert',
          data: topologyState.probabilityData.map(d => d.visayasYellow),
          borderColor: '#c4b5fd',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Mindanao Red Alert',
          data: topologyState.probabilityData.map(d => d.minRed),
          borderColor: '#10b981',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Mindanao Yellow Alert',
          data: topologyState.probabilityData.map(d => d.minYellow),
          borderColor: '#6ee7b7',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: { 
        legend: { 
          position: 'top',
          labels: { font: { size: 10 }, boxWidth: 12 }
        } 
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: {
            maxTicksLimit: 20
          }
        },
        y: { max: 100, min: 0 }
      }
    },
    plugins: [verticalLinePlugin]
  });
}
function renderTopologyView() {
  if (topologyState.simulation) return; // already rendered
  if (!DASHBOARD_DATA.network_topology || typeof d3 === 'undefined') return;
  
  const svgEl = document.getElementById('topology-d3-svg');
  if (!svgEl) return;
  
  const width = 800;
  const height = 500;
  
  const svg = d3.select('#topology-d3-svg');
  svg.selectAll('*').remove();
  
  // Apply responsive viewBox to fix clipping on tab load
  svg.attr('viewBox', `0 0 ${width} ${height}`)
     .attr('preserveAspectRatio', 'xMidYMid meet');
  
  // Setup Zoom
  const g = svg.append('g');
  svg.call(d3.zoom().on('zoom', (e) => {
    g.attr('transform', e.transform);
  }));
  
  const nodes = DASHBOARD_DATA.network_topology.nodes.map(d => Object.create(d));
  const links = DASHBOARD_DATA.network_topology.edges.map(d => Object.create(d));
  
  // Link distance based on hierarchy
  topologyState.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => d.value === 10 ? 100 : 20))
      .force('charge', d3.forceManyBody().strength(-30))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(8));
      
  topologyState.linkElements = g.append('g')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.6)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', d => Math.sqrt(d.value));
      
  topologyState.nodeElements = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => {
        if (d.type === 'grid') return 12;
        if (d.type === 'station') return 6;
        return 4;
      })
      .attr('fill', d => {
        if (d.type === 'grid') return '#3b82f6';
        if (d.type === 'station') return '#94a3b8';
        return '#10b981'; // default generator online
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('class', 'd3-node');
      
  // Add labels for grids and stations
  g.append('g')
      .selectAll('text')
      .data(nodes.filter(d => d.type === 'grid' || d.type === 'station'))
      .join('text')
      .text(d => d.name)
      .attr('font-size', d => d.type === 'grid' ? '12px' : '8px')
      .attr('fill', '#cbd5e1')
      .attr('dx', 12)
      .attr('dy', 4);

  topologyState.simulation.on('tick', () => {
    topologyState.linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
        
    topologyState.nodeElements
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
        
    g.selectAll('text')
        .attr('x', d => d.x)
        .attr('y', d => d.y);
  });
  
  updateTopologyForCurrentDate();
}

function updateTopologyForCurrentDate() {
  const d = new Date(topologyState.startDate);
  d.setDate(d.getDate() + topologyState.currentDayOffset);
  
  const dateStrEl = document.getElementById('topology-current-date');
  if (dateStrEl) {
    dateStrEl.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  
  // Find outages for this date
  const activeOutages = state.gompOutages.filter(o => isGompActiveOnDate(o, d));
  
  let totalMw = 0;
  let luzMw = 0, visMw = 0, minMw = 0;
  activeOutages.forEach(o => {
    const cap = parseFloat(o.capacity) || 0;
    totalMw += cap;
    if (o.grid === 'Luzon') luzMw += cap;
    else if (o.grid === 'Visayas') visMw += cap;
    else if (o.grid === 'Mindanao') minMw += cap;
  });
  
  const mwEl = document.getElementById('topology-offline-mw');
  if (mwEl) {
    mwEl.textContent = `- ${Math.round(totalMw).toLocaleString()} MW Scheduled Offline Total`;
  }
  
  // Calculate probabilities for breakdown
  let lRed = 0, lYel = 0;
  if (luzMw >= 4000) { lRed = 80; lYel = 20; }
  else if (luzMw >= 3000) { lRed = 20; lYel = 60; }
  else if (luzMw >= 2000) { lRed = 0; lYel = 25; }
  
  let vRed = 0, vYel = 0;
  if (visMw >= 1100) { vRed = 80; vYel = 20; }
  else if (visMw >= 800) { vRed = 20; vYel = 60; }
  else if (visMw >= 500) { vRed = 0; vYel = 25; }
  
  let mRed = 0, mYel = 0;
  if (minMw >= 1400) { mRed = 80; mYel = 20; }
  else if (minMw >= 1000) { mRed = 20; mYel = 60; }
  else if (minMw >= 700) { mRed = 0; mYel = 25; }
  
  const bdEl = document.getElementById('topology-breakdown');
  if (bdEl) {
    bdEl.innerHTML = `
      <div style="background:rgba(59, 130, 246, 0.1); padding:4px 8px; border-radius:4px; border-left:2px solid #3b82f6;">
        <strong style="color:#3b82f6">Luzon:</strong> ${Math.round(luzMw)} MW 
        <span style="color:#ef4444; margin-left:4px;">Red: ${lRed}%</span> | <span style="color:#f59e0b">Yel: ${lYel}%</span>
      </div>
      <div style="background:rgba(139, 92, 246, 0.1); padding:4px 8px; border-radius:4px; border-left:2px solid #8b5cf6;">
        <strong style="color:#8b5cf6">Visayas:</strong> ${Math.round(visMw)} MW 
        <span style="color:#ef4444; margin-left:4px;">Red: ${vRed}%</span> | <span style="color:#f59e0b">Yel: ${vYel}%</span>
      </div>
      <div style="background:rgba(16, 185, 129, 0.1); padding:4px 8px; border-radius:4px; border-left:2px solid #10b981;">
        <strong style="color:#10b981">Mindanao:</strong> ${Math.round(minMw)} MW 
        <span style="color:#ef4444; margin-left:4px;">Red: ${mRed}%</span> | <span style="color:#f59e0b">Yel: ${mYel}%</span>
      </div>
    `;
  }
  
  // Map GOMP plant names to SLD node names. GOMP uses facility names, SLD uses RESOURCE NAME.
  // We'll do a simple substring match for the visualization.
  const offlineNames = activeOutages.map(o => o.plant.toLowerCase());
  
  if (topologyState.nodeElements) {
    topologyState.nodeElements.attr('fill', n => {
      if (n.type !== 'generator') {
        return n.type === 'grid' ? '#3b82f6' : '#94a3b8';
      }
      
      const nodeName = n.name.toLowerCase();
      let isOffline = false;
      for (const name of offlineNames) {
        if (nodeName.includes(name) || name.includes(nodeName)) {
          isOffline = true; break;
        }
      }
      
      return isOffline ? '#ef4444' : '#10b981';
    });
    
    // Add pulsing effect to offline nodes
    topologyState.nodeElements.attr('r', n => {
      if (n.type !== 'generator') return n.type === 'grid' ? 12 : 6;
      const nodeName = n.name.toLowerCase();
      let isOffline = false;
      for (const name of offlineNames) {
        if (nodeName.includes(name) || name.includes(nodeName)) {
          isOffline = true; break;
        }
      }
      return isOffline ? 8 : 4;
    });
  }
}
