import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove extra closing section
html = html.replace('        </section>\n        \n        </section>\n\n        <!-- Tab 10:', '        </section>\n\n        <!-- Tab 10:')

# Fix PlaySim Layout for mobile
html = html.replace(
    '<div class="card" style="margin-bottom: 16px; padding: 16px; display: flex; align-items: center; gap: 16px; flex-shrink: 0;">',
    '<div class="card sim-controls-card" style="margin-bottom: 16px; padding: 16px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; flex-wrap: wrap;">'
)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace calculateAlertProbabilities and renderProbabilityChart
old_calc_prob = js[js.find('function calculateAlertProbabilities() {'):js.find('function renderTopologyView() {')]

new_calc_prob = """function calculateAlertProbabilities() {
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
    if (luzonMw > 2500) { luzonRed = 85; luzonYellow = 15; }
    else if (luzonMw > 1500) { luzonRed = 20; luzonYellow = 60; }
    else if (luzonMw > 800) { luzonRed = 0; luzonYellow = 30; }
    
    let visayasRed = 0, visayasYellow = 0;
    if (visayasMw > 600) { visayasRed = 85; visayasYellow = 15; }
    else if (visayasMw > 400) { visayasRed = 30; visayasYellow = 50; }
    else if (visayasMw > 200) { visayasRed = 0; visayasYellow = 20; }
    
    let minRed = 0, minYellow = 0;
    if (mindanaoMw > 800) { minRed = 85; minYellow = 15; }
    else if (mindanaoMw > 500) { minRed = 20; minYellow = 60; }
    else if (mindanaoMw > 300) { minRed = 0; minYellow = 20; }
    
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
"""

js = js.replace(old_calc_prob, new_calc_prob)

# Also update the chart when slider moves
hook_str = "  if (state.charts.probChart) state.charts.probChart.draw();\n"
js = js.replace("updateTopologyForCurrentDate();\n    });", "updateTopologyForCurrentDate();\n" + hook_str + "    });")
js = js.replace("updateTopologyForCurrentDate();\n        }, 100);", "updateTopologyForCurrentDate();\n" + hook_str + "        }, 100);")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Update index.css for mobile
with open('index.css', 'r', encoding='utf-8') as f:
    css = f.read()

mobile_css = """
/* Mobile Enhancements */
@media (max-width: 768px) {
  .sim-controls-card {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .sim-controls-card button {
    width: 100%;
  }
  .table-wrapper {
    overflow-x: auto;
  }
  .metric-card {
    padding: 12px;
  }
  .metric-value {
    font-size: 20px !important;
  }
}
"""
css += "\n" + mobile_css

with open('index.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Patch applied successfully.")
