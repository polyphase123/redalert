import re

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the listEl.innerHTML mapping in renderTopRiskDays
old_map = """  listEl.innerHTML = top20.map(e => `
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
  });"""

new_map = """  listEl.innerHTML = top20.map((e, idx) => {
    // Find active outages for this specific event grid and date
    const active = state.gompOutages.filter(o => o.grid === e.grid && isGompActiveOnDate(o, e.date));
    const sorted = active.sort((a,b) => (parseFloat(b.capacity)||0) - (parseFloat(a.capacity)||0));
    
    const detailsHtml = sorted.map(o => {
      return `<div style="display:flex; justify-content:space-between; font-size:9px; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;" title="${o.plant}">${o.plant}</span>
        <span style="color:var(--text-muted);">${o.capacity} MW</span>
        <span style="color:${e.color}; white-space:nowrap;">${o.start}-${o.end}</span>
      </div>`;
    }).join('');

    return `
    <div class="risk-day-container" style="display:flex; flex-direction:column; margin-bottom:4px; background:${e.bg}; border-left: 3px solid ${e.color}; border-radius:6px; overflow:hidden;">
      <div class="risk-day-item" data-day="${e.day}" data-idx="${idx}" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 8px; cursor:pointer; transition: opacity 0.2s;">
        <div style="display:flex; flex-direction:column;">
          <span style="font-size:11px; font-weight:700; color:var(--text-primary);">${e.date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</span>
          <span style="font-size:10px; color:var(--text-muted);">${e.grid} • ${Math.round(e.mw)} MW Offline</span>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end;">
          <span style="font-size:11px; font-weight:700; color:${e.color};">${e.prob}%</span>
          <span style="font-size:9px; color:${e.color}; text-transform:uppercase;">${e.type}</span>
        </div>
      </div>
      <div id="risk-details-${idx}" style="display:none; padding: 0 8px 8px 8px; flex-direction:column; gap:2px;">
        <div style="font-size:9px; font-weight:bold; color:var(--text-muted); margin-bottom:2px; margin-top:4px;">OFFLINE UNITS:</div>
        ${detailsHtml}
      </div>
    </div>
  `}).join('');
  
  // Add click listeners to scrub timeline AND toggle accordion
  document.querySelectorAll('.risk-day-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const day = parseInt(e.currentTarget.getAttribute('data-day'));
      const idx = e.currentTarget.getAttribute('data-idx');
      
      // Toggle accordion
      const details = document.getElementById(`risk-details-${idx}`);
      if (details) {
        if (details.style.display === 'none') {
          // close all others
          document.querySelectorAll('[id^="risk-details-"]').forEach(el => el.style.display = 'none');
          details.style.display = 'flex';
        } else {
          details.style.display = 'none';
        }
      }
      
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
  });"""

js = js.replace(old_map, new_map)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Injected accordion into renderTopRiskDays")
