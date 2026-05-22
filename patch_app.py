import os
import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state for gompOutages
content = content.replace("  ngcpUpdates: [],      // NGCP bulletins",
                          "  ngcpUpdates: [],      // NGCP bulletins\n  gompOutages: [],      // GOMP calendar")

# 2. Add loading of gomp_outages
loading_code = """
    // Standardize and sanitize mixed date-time formatting inconsistencies on load
    sanitizeOutagesData();
    
    // Aggregate unique power plants registry
    compilePowerPlantsRegistry();
"""
new_loading_code = """
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
"""
content = content.replace(loading_code, new_loading_code)

# 3. Add setupCalendar and renderCalendarGrid functions
calendar_code = """
function setupCalendar() {
  const searchInput = document.getElementById('calendar-search');
  const gridSelect = document.getElementById('calendar-grid-filter');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => { renderCalendarGrid(); });
  }
  if (gridSelect) {
    gridSelect.addEventListener('change', () => { renderCalendarGrid(); });
  }
  
  const prev = document.getElementById('cal-pagination-prev');
  const next = document.getElementById('cal-pagination-next');
  if (prev) prev.addEventListener('click', () => { state.pagination.currentPage = Math.max(1, state.pagination.currentPage - 1); renderCalendarGrid(); });
  if (next) next.addEventListener('click', () => { state.pagination.currentPage++; renderCalendarGrid(); });
}

function renderCalendarGrid() {
  const tbody = document.getElementById('calendar-table-body');
  if (!tbody) return;
  
  const searchInput = document.getElementById('calendar-search');
  const gridSelect = document.getElementById('calendar-grid-filter');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  const gridFilter = gridSelect ? gridSelect.value : 'all';
  
  const filtered = state.gompOutages.filter(o => {
    const searchMatch = !searchTerm || o.plant.toLowerCase().includes(searchTerm);
    const gridMatch = gridFilter === 'all' || o.grid === gridFilter;
    return searchMatch && gridMatch;
  });
  
  document.getElementById('calendar-stats').textContent = `${filtered.length} Outages Scheduled`;
  
  const pageSize = 50;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  state.pagination.currentPage = Math.min(state.pagination.currentPage, totalPages);
  
  const start = (state.pagination.currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  
  tbody.innerHTML = '';
  pageItems.forEach(o => {
    const gridBadge = `<span class="badge ${o.grid === 'Luzon' ? 'badge-grid-luzon' : o.grid === 'Visayas' ? 'badge-grid-visayas' : 'badge-compliance-ok'}" style="background:${o.grid==='Mindanao'?'#10b981':'#3b82f6'}; color:white; border:none;">${o.grid}</span>`;
    
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${gridBadge}</td>
        <td style="font-weight: 600;">${o.plant}</td>
        <td>${o.capacity}</td>
        <td>${o.start}</td>
        <td>${o.end}</td>
        <td><div style="background:var(--bg-tertiary); border-radius:4px; height:6px; width:100%;"><div style="background:var(--status-yellow); height:100%; width:100%; border-radius:4px;"></div></div></td>
      </tr>
    `);
  });
  
  const info = document.getElementById('cal-pagination-info');
  if (info) {
    info.textContent = `Showing ${filtered.length === 0 ? 0 : start + 1} to ${Math.min(start + pageSize, filtered.length)} of ${filtered.length} entries`;
  }
}
"""
content += "\n" + calendar_code

# Also update the badge grid to properly show Mindanao colors if needed. But it's in CSS too.
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
