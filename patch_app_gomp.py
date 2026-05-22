import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# The appended code from the previous patch started with:
# function setupCalendar() {
# and went to the end of the file.
# The original setupCalendar is near line 1863. I need to be careful to only remove the one at the end.
# I'll just split by the last occurrence of 'function setupCalendar() {'
parts = content.rsplit('function setupCalendar() {', 1)

if len(parts) > 1 and len(parts[1]) < 5000:
    content = parts[0] # remove the last appended calendar function
    print("Removed duplicate setupCalendar.")
else:
    print("Could not safely remove duplicate.")

# Add initialization for gomp
content = content.replace("  safeRun(setupMap, 'setupMap');", "  safeRun(setupMap, 'setupMap');\n  safeRun(setupGompCalendar, 'setupGompCalendar');")

# Add navigation hook for gomp tab
content = content.replace("      } else if (tabId === 'calendar') {\n        renderCalendarGrid();\n      } else if (tabId === 'compliance-analysis') {",
"""      } else if (tabId === 'calendar') {
        renderCalendarGrid();
      } else if (tabId === 'gomp') {
        renderGompGrid();
      } else if (tabId === 'compliance-analysis') {""")


gomp_code = """
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
"""

content += "\n" + gomp_code

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched app.js successfully!")
