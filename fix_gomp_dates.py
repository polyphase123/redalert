import re

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Add parseGompDate helper
helper_code = """
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
"""

js = js.replace("function calculateAlertProbabilities() {", helper_code + "\nfunction calculateAlertProbabilities() {")

# Fix calculateAlertProbabilities
old_prob_loop = """    state.gompOutages.forEach(o => {
      const start = new Date(o.start);
      const end = new Date(o.end);
      if (d >= start && d <= end) {
        totalMw += parseFloat(o.capacity) || 0;
      }
    });"""

new_prob_loop = """    state.gompOutages.forEach(o => {
      if (isGompActiveOnDate(o, d)) {
        totalMw += parseFloat(o.capacity) || 0;
      }
    });"""
js = js.replace(old_prob_loop, new_prob_loop)

# Fix updateTopologyForCurrentDate
old_topo_filter = """  const activeOutages = state.gompOutages.filter(o => {
    const start = new Date(o.start);
    const end = new Date(o.end);
    return d >= start && d <= end;
  });"""

new_topo_filter = """  const activeOutages = state.gompOutages.filter(o => isGompActiveOnDate(o, d));"""
js = js.replace(old_topo_filter, new_topo_filter)


with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Fixed GOMP date parsing logic.")
