import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add D3
if 'd3.v7.min.js' not in html:
    html = html.replace('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>',
                        '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n  <script src="https://d3js.org/d3.v7.min.js"></script>')

# Add Sidebar Tab
nav_item = """        <li class="nav-item" data-tab="topology">
          <button>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            SLD Simulation
          </button>
        </li>
      </nav>"""
html = html.replace("      </nav>", nav_item)

# Add Topology Tab Content
topology_tab = """
        <!-- Tab 11: SLD Simulation & Probability -->
        <section id="topology-tab" class="tab-page" style="display:flex; flex-direction:column; height: 100%;">
          <div class="header-title-container" style="margin-bottom: 16px;">
            <h2 style="font-size:18px; font-family:var(--font-title); font-weight:800; background:var(--gradient-ocean); background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; color:transparent;">SLD Interactive Simulation & Risk Modeling</h2>
            <p style="font-size:12px; color:var(--text-muted); margin-top:2px;">Meshing GOMP 2026-2028 Scheduled Outages with Network Topology</p>
          </div>
          
          <!-- Simulation Controls -->
          <div class="card" style="margin-bottom: 16px; padding: 16px; display: flex; align-items: center; gap: 16px; flex-shrink: 0;">
            <div style="flex: 1;">
              <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                <span id="topology-current-date" style="font-weight:700; color:var(--text-primary);">January 1, 2026</span>
                <span id="topology-offline-mw" style="color:var(--status-red); font-weight:600;">0 MW Scheduled Offline</span>
              </div>
              <input type="range" id="topology-timeline-slider" min="0" max="1095" value="0" style="width:100%; cursor:pointer;">
            </div>
            <button id="topology-play-btn" class="btn" style="background:var(--accent-color); color:white; padding:8px 16px; border-radius:6px; border:none; cursor:pointer;">Play Sim</button>
          </div>
          
          <!-- Alert Probability Chart -->
          <div class="card" style="margin-bottom: 16px; padding: 16px; height: 200px; flex-shrink: 0;">
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">Historical Probability of Red/Yellow Alert</div>
            <div style="position:relative; height:150px; width:100%;">
              <canvas id="topologyProbabilityChart"></canvas>
            </div>
          </div>
          
          <!-- D3 Topology Visualizer -->
          <div class="card" style="flex: 1; padding: 0; overflow: hidden; position: relative; background: #0f172a; border-radius: 12px; min-height:400px;">
            <div style="position:absolute; top:16px; left:16px; z-index:10; background:rgba(0,0,0,0.5); padding:8px; border-radius:8px; color:white; font-size:11px;">
              <div><span style="display:inline-block; width:10px; height:10px; background:#ef4444; border-radius:50%; margin-right:4px;"></span> Generator Offline</div>
              <div><span style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:4px;"></span> Generator Online</div>
            </div>
            <svg id="topology-d3-svg" style="width: 100%; height: 100%;"></svg>
          </div>
        </section>
        
      </div>
    </main>
"""
html = html.replace("      </div>\n    </main>", topology_tab)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    appjs = f.read()

# Add initialization hook
appjs = appjs.replace("  safeRun(setupGompCalendar, 'setupGompCalendar');", "  safeRun(setupGompCalendar, 'setupGompCalendar');\n  safeRun(setupTopologySimulation, 'setupTopologySimulation');")

# Add navigation hook
appjs = appjs.replace("      } else if (tabId === 'gomp') {\n        renderGompGrid();\n      } else if (tabId === 'compliance-analysis') {",
"""      } else if (tabId === 'gomp') {
        renderGompGrid();
      } else if (tabId === 'topology') {
        renderTopologyView();
      } else if (tabId === 'compliance-analysis') {""")

topology_js = """
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
        }, 100);
      } else {
        clearInterval(topologyState.playInterval);
      }
    });
  }
  
  // Pre-calculate Alert Probabilities for the entire timeline
  calculateAlertProbabilities();
}

function calculateAlertProbabilities() {
  // We calculate daily scheduled MW offline.
  // Heuristic: >3000 MW = 80% Red Alert
  // >2000 MW = 60% Yellow Alert
  // <1000 MW = Normal
  const timeline = [];
  
  for (let i = 0; i <= topologyState.maxOffset; i++) {
    const d = new Date(topologyState.startDate);
    d.setDate(d.getDate() + i);
    
    let totalMw = 0;
    state.gompOutages.forEach(o => {
      const start = new Date(o.start);
      const end = new Date(o.end);
      if (d >= start && d <= end) {
        totalMw += parseFloat(o.capacity) || 0;
      }
    });
    
    let redProb = 0;
    let yellowProb = 0;
    
    if (totalMw > 3500) { redProb = 85; yellowProb = 15; }
    else if (totalMw > 2500) { redProb = 40; yellowProb = 50; }
    else if (totalMw > 1500) { redProb = 5; yellowProb = 60; }
    else if (totalMw > 500) { redProb = 0; yellowProb = 20; }
    
    timeline.push({ day: i, date: new Date(d), mw: totalMw, redProb, yellowProb });
  }
  
  topologyState.probabilityData = timeline;
  renderProbabilityChart();
}

function renderProbabilityChart() {
  const ctx = document.getElementById('topologyProbabilityChart');
  if (!ctx || !topologyState.probabilityData.length) return;
  
  const labels = topologyState.probabilityData.filter((d,i) => i % 30 === 0).map(d => d.date.toLocaleDateString('en-US', {month:'short', year:'2-digit'}));
  const redData = topologyState.probabilityData.filter((d,i) => i % 30 === 0).map(d => d.redProb);
  const yellowData = topologyState.probabilityData.filter((d,i) => i % 30 === 0).map(d => d.yellowProb);
  
  if (state.charts.probChart) state.charts.probChart.destroy();
  
  state.charts.probChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Red Alert Probability (%)',
          data: redData,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        },
        {
          label: 'Yellow Alert Probability (%)',
          data: yellowData,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { display: false } },
        y: { max: 100, min: 0 }
      }
    }
  });
}

function renderTopologyView() {
  if (topologyState.simulation) return; // already rendered
  if (!DASHBOARD_DATA.network_topology || typeof d3 === 'undefined') return;
  
  const svgEl = document.getElementById('topology-d3-svg');
  if (!svgEl) return;
  
  const width = svgEl.clientWidth || 800;
  const height = svgEl.clientHeight || 500;
  
  const svg = d3.select('#topology-d3-svg');
  svg.selectAll('*').remove();
  
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
  const activeOutages = state.gompOutages.filter(o => {
    const start = new Date(o.start);
    const end = new Date(o.end);
    return d >= start && d <= end;
  });
  
  let totalMw = 0;
  activeOutages.forEach(o => totalMw += parseFloat(o.capacity) || 0);
  
  const mwEl = document.getElementById('topology-offline-mw');
  if (mwEl) {
    mwEl.textContent = `${Math.round(totalMw).toLocaleString()} MW Scheduled Offline`;
    if (totalMw > 3500) mwEl.style.color = 'var(--status-red)';
    else if (totalMw > 1500) mwEl.style.color = 'var(--status-yellow)';
    else mwEl.style.color = '#10b981';
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
"""

appjs += "\n" + topology_js

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(appjs)

print("Injected Topology UI & Logic successfully")
