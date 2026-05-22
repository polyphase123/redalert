import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

top_days_ui = """          <!-- Alert Probability Chart -->
          <div style="display:flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
            <div class="card" style="flex: 2; padding: 16px; height: 200px; min-width: 300px;">
              <div style="font-size:13px; font-weight:700; margin-bottom:8px;">Historical Probability of Red/Yellow Alert</div>
              <div style="position:relative; height:150px; width:100%;">
                <canvas id="topologyProbabilityChart"></canvas>
              </div>
            </div>
            
            <div class="card" style="flex: 1; padding: 16px; height: 200px; overflow-y: auto; min-width: 300px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-size:13px; font-weight:700;">Top 20 Critical Risk Days</div>
                <div style="display:flex; gap: 4px;">
                  <select id="top-risk-grid-filter" style="font-size:10px; padding:2px; border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid #334155;">
                    <option value="All">All Grids</option>
                    <option value="Luzon">Luzon</option>
                    <option value="Visayas">Visayas</option>
                    <option value="Mindanao">Mindanao</option>
                  </select>
                  <select id="top-risk-type-filter" style="font-size:10px; padding:2px; border-radius:4px; background:var(--bg-secondary); color:var(--text-primary); border:1px solid #334155;">
                    <option value="All">All Alerts</option>
                    <option value="Red">Red Alert</option>
                    <option value="Yellow">Yellow Alert</option>
                  </select>
                </div>
              </div>
              <div id="top-risk-days-list" style="display:flex; flex-direction:column; gap:4px;">
                <!-- Populated via JS -->
              </div>
            </div>
          </div>"""

# Replace the old chart container with the new split container
old_chart = """          <!-- Alert Probability Chart -->
          <div class="card" style="margin-bottom: 16px; padding: 16px; height: 200px; flex-shrink: 0;">
            <div style="font-size:13px; font-weight:700; margin-bottom:8px;">Historical Probability of Red/Yellow Alert</div>
            <div style="position:relative; height:150px; width:100%;">
              <canvas id="topologyProbabilityChart"></canvas>
            </div>
          </div>"""

if old_chart in html:
    html = html.replace(old_chart, top_days_ui)
else:
    print("Could not find old chart UI in index.html to replace")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)


# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Update calculateAlertProbabilities to include MW
old_push = """    timeline.push({ 
      day: i, date: new Date(d), 
      luzonRed, luzonYellow, 
      visayasRed, visayasYellow, 
      minRed, minYellow 
    });"""

new_push = """    timeline.push({ 
      day: i, date: new Date(d), 
      luzMw, visMw, minMw,
      luzonRed, luzonYellow, 
      visayasRed, visayasYellow, 
      minRed, minYellow 
    });"""
js = js.replace(old_push, new_push)

# Add renderTopRiskDays function
new_funcs = """
function renderTopRiskDays() {
  const listEl = document.getElementById('top-risk-days-list');
  const gridFilter = document.getElementById('top-risk-grid-filter')?.value || 'All';
  const typeFilter = document.getElementById('top-risk-type-filter')?.value || 'All';
  
  if (!listEl || !topologyState.probabilityData.length) return;
  
  let events = [];
  
  topologyState.probabilityData.forEach(d => {
    if ((gridFilter === 'All' || gridFilter === 'Luzon') && d.luzonRed > 0 && (typeFilter === 'All' || typeFilter === 'Red')) {
      events.push({ day: d.day, date: d.date, grid: 'Luzon', type: 'Red Alert', prob: d.luzonRed, mw: d.luzMw, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' });
    }
    if ((gridFilter === 'All' || gridFilter === 'Luzon') && d.luzonYellow > 0 && (typeFilter === 'All' || typeFilter === 'Yellow')) {
      events.push({ day: d.day, date: d.date, grid: 'Luzon', type: 'Yellow Alert', prob: d.luzonYellow, mw: d.luzMw, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' });
    }
    
    if ((gridFilter === 'All' || gridFilter === 'Visayas') && d.visayasRed > 0 && (typeFilter === 'All' || typeFilter === 'Red')) {
      events.push({ day: d.day, date: d.date, grid: 'Visayas', type: 'Red Alert', prob: d.visayasRed, mw: d.visMw, color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' });
    }
    if ((gridFilter === 'All' || gridFilter === 'Visayas') && d.visayasYellow > 0 && (typeFilter === 'All' || typeFilter === 'Yellow')) {
      events.push({ day: d.day, date: d.date, grid: 'Visayas', type: 'Yellow Alert', prob: d.visayasYellow, mw: d.visMw, color: '#c4b5fd', bg: 'rgba(196, 181, 253, 0.1)' });
    }
    
    if ((gridFilter === 'All' || gridFilter === 'Mindanao') && d.minRed > 0 && (typeFilter === 'All' || typeFilter === 'Red')) {
      events.push({ day: d.day, date: d.date, grid: 'Mindanao', type: 'Red Alert', prob: d.minRed, mw: d.minMw, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' });
    }
    if ((gridFilter === 'All' || gridFilter === 'Mindanao') && d.minYellow > 0 && (typeFilter === 'All' || typeFilter === 'Yellow')) {
      events.push({ day: d.day, date: d.date, grid: 'Mindanao', type: 'Yellow Alert', prob: d.minYellow, mw: d.minMw, color: '#6ee7b7', bg: 'rgba(110, 231, 183, 0.1)' });
    }
  });
  
  // Sort by probability descending, then MW descending
  events.sort((a, b) => {
    if (b.prob !== a.prob) return b.prob - a.prob;
    return b.mw - a.mw;
  });
  
  const top20 = events.slice(0, 20);
  
  if (top20.length === 0) {
    listEl.innerHTML = '<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:12px;">No risk events found.</div>';
    return;
  }
  
  listEl.innerHTML = top20.map(e => `
    <div class="risk-day-item" data-day="${e.day}" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 8px; border-radius:6px; background:${e.bg}; border-left: 3px solid ${e.color}; cursor:pointer; transition: opacity 0.2s;">
      <div style="display:flex; flex-direction:column;">
        <span style="font-size:11px; font-weight:700; color:var(--text-primary);">${e.date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</span>
        <span style="font-size:10px; color:var(--text-muted);">${e.grid} • ${Math.round(e.mw)} MW Offline</span>
      </div>
      <div style="display:flex; flex-direction:column; align-items:flex-end;">
        <span style="font-size:11px; font-weight:700; color:${e.color};">${e.prob}%</span>
        <span style="font-size:9px; color:${e.color}; text-transform:uppercase;">${e.type}</span>
      </div>
    </div>
  `).join('');
  
  // Add click listeners to scrub timeline
  document.querySelectorAll('.risk-day-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const day = parseInt(e.currentTarget.getAttribute('data-day'));
      const slider = document.getElementById('topology-timeline-slider');
      if (slider) {
        slider.value = day;
        topologyState.currentDayOffset = day;
        updateTopologyForCurrentDate();
        if (state.charts.probChart) state.charts.probChart.draw();
      }
    });
    item.addEventListener('mouseenter', e => e.currentTarget.style.opacity = '0.8');
    item.addEventListener('mouseleave', e => e.currentTarget.style.opacity = '1');
  });
}
"""

js = js.replace("function renderProbabilityChart() {", new_funcs + "\nfunction renderProbabilityChart() {")

# Add hook to call renderTopRiskDays
js = js.replace("renderProbabilityChart();\n}", "renderProbabilityChart();\n  renderTopRiskDays();\n}")

# Hook event listeners for the filters
filter_hook = """
  const gridFilter = document.getElementById('top-risk-grid-filter');
  const typeFilter = document.getElementById('top-risk-type-filter');
  if (gridFilter) gridFilter.addEventListener('change', renderTopRiskDays);
  if (typeFilter) typeFilter.addEventListener('change', renderTopRiskDays);
"""

js = js.replace("calculateAlertProbabilities();\n}", filter_hook + "  calculateAlertProbabilities();\n}")


with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Injected Top 20 Critical Risk Days feature")
