import re

# 1. Fix index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix topology-tab always visible issue
# Change <section id="topology-tab" class="tab-page" style="display:flex; ...">
# to <section id="topology-tab" class="tab-page"> <div style="display:flex; ...">
html = html.replace('<section id="topology-tab" class="tab-page" style="display:flex; flex-direction:column; height: 100%;">', 
                    '<section id="topology-tab" class="tab-page">\n          <div style="display:flex; flex-direction:column; height: 100%;">')
# Add closing div before </section> for topology-tab
html = html.replace('</svg>\n          </div>\n        </section>', 
                    '</svg>\n          </div>\n          </div>\n        </section>')

# Fix labels layout
old_labels = """              <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                <span id="topology-current-date" style="font-weight:700; color:var(--text-primary);">January 1, 2026</span>
                <span id="topology-offline-mw" style="color:var(--status-red); font-weight:600;">0 MW Scheduled Offline</span>
              </div>"""

new_labels = """              <div style="display:flex; gap: 16px; align-items: baseline; margin-bottom: 4px;">
                <span id="topology-current-date" style="font-weight:700; font-size:16px; color:var(--text-primary);">January 1, 2026</span>
                <span id="topology-offline-mw" style="font-weight:600; color:var(--text-muted); font-size:14px;">0 MW Scheduled Offline</span>
              </div>
              <div id="topology-breakdown" style="display:flex; flex-wrap:wrap; gap: 12px; margin-bottom: 12px; font-size: 11px; color:var(--text-muted);">
                <!-- Breakdown injected here via JS -->
              </div>"""
html = html.replace(old_labels, new_labels)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Update updateTopologyForCurrentDate to populate breakdown
old_topo_update = """  // Find outages for this date
  const activeOutages = state.gompOutages.filter(o => isGompActiveOnDate(o, d));
  
  let totalMw = 0;
  activeOutages.forEach(o => totalMw += parseFloat(o.capacity) || 0);
  
  const mwEl = document.getElementById('topology-offline-mw');
  if (mwEl) {
    mwEl.textContent = `${Math.round(totalMw).toLocaleString()} MW Scheduled Offline`;
    if (totalMw > 3500) mwEl.style.color = 'var(--status-red)';
    else if (totalMw > 1500) mwEl.style.color = 'var(--status-yellow)';
    else mwEl.style.color = '#10b981';
  }"""

new_topo_update = """  // Find outages for this date
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
  if (luzMw > 2500) { lRed = 85; lYel = 15; }
  else if (luzMw > 1500) { lRed = 20; lYel = 60; }
  else if (luzMw > 800) { lRed = 0; lYel = 30; }
  
  let vRed = 0, vYel = 0;
  if (visMw > 600) { vRed = 85; vYel = 15; }
  else if (visMw > 400) { vRed = 30; vYel = 50; }
  else if (visMw > 200) { vRed = 0; vYel = 20; }
  
  let mRed = 0, mYel = 0;
  if (minMw > 800) { mRed = 85; mYel = 15; }
  else if (minMw > 500) { mRed = 20; mYel = 60; }
  else if (minMw > 300) { mRed = 0; mYel = 20; }
  
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
  }"""
js = js.replace(old_topo_update, new_topo_update)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Applied UI fixes.")
