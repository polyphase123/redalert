import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

old_bd = """              <div id="topology-breakdown" style="display:flex; flex-wrap:wrap; gap: 12px; margin-bottom: 12px; font-size: 11px; color:var(--text-muted);">
                <!-- Breakdown injected here via JS -->
              </div>"""

new_bd = """              <div id="topology-breakdown" style="display:flex; flex-wrap:wrap; gap: 12px; margin-bottom: 8px; font-size: 11px; color:var(--text-muted);">
                <!-- Breakdown injected here via JS -->
              </div>
              <div id="topology-offline-plants-list" style="display:flex; flex-wrap:wrap; gap: 6px; margin-bottom: 12px; max-height: 80px; overflow-y:auto; padding-right:8px; align-items:flex-start;">
                <!-- Offline plants injected here via JS -->
              </div>"""

if old_bd in html:
    html = html.replace(old_bd, new_bd)
else:
    print("Could not find breakdown UI in index.html to replace")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)


# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Update updateTopologyForCurrentDate to populate the plants list
old_bd_js = """    `;
  }
  
  // 3. Re-evaluate D3 graph"""

new_bd_js = """    `;
  }
  
  // Render offline plants list
  const plantsListEl = document.getElementById('topology-offline-plants-list');
  if (plantsListEl) {
    if (activeOutages.length === 0) {
      plantsListEl.innerHTML = '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">No plants scheduled offline</span>';
    } else {
      // Sort by capacity descending
      const sorted = [...activeOutages].sort((a, b) => (parseFloat(b.capacity)||0) - (parseFloat(a.capacity)||0));
      plantsListEl.innerHTML = sorted.map(o => {
        let color = '#3b82f6';
        if (o.grid === 'Visayas') color = '#8b5cf6';
        else if (o.grid === 'Mindanao') color = '#10b981';
        return `<span style="background:${color}20; color:${color}; border:1px solid ${color}40; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; white-space:nowrap;">
          ${o.plant} <span style="opacity:0.7;">(${o.capacity} MW)</span>
        </span>`;
      }).join('');
    }
  }
  
  // 3. Re-evaluate D3 graph"""

js = js.replace(old_bd_js, new_bd_js)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Injected Offline Plants UI")
