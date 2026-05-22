import json
import re

# 1. Update data.js
with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Parse the JSON from data.js (safely extract gomp_outages)
match = re.search(r'\"gomp_outages\":\s*(\[.*?\])(?=\s*,\s*\"|\s*\})', js, re.DOTALL)
if match:
    gomp_json_str = match.group(1)
    gomp = json.loads(gomp_json_str)
    
    # Plants we injected
    injected_plants = {
        "05THVI_U01", "05THVI_U02", "08PEDC_U03", "06PAL2A_U01", 
        "06CENPRI_U01", "08PDPP1_U05", "Generic Visayas Forced", 
        "Luzon Major Forced Outages"
    }
    
    # Filter out the injected plants
    filtered_gomp = [o for o in gomp if o.get('plant') not in injected_plants]
    
    # Replace in file
    new_gomp_str = json.dumps(filtered_gomp, indent=4)
    # We need to format it to match the spacing approximately
    
    # Since re.sub is tricky with huge strings, let's do direct replacement
    js = js[:match.start(1)] + new_gomp_str + js[match.end(1):]
    
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print("Removed injected forced outages from data.js")
else:
    print("Failed to parse gomp_outages")


# 2. Update app.js
with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Add the date filter in renderTopRiskDays
old_filter = "topologyState.probabilityData.forEach(d => {"
new_filter = """  const thresholdDate = new Date('2026-05-30T00:00:00');
  topologyState.probabilityData.forEach(d => {
    if (d.date < thresholdDate) return;"""

if old_filter in app_js:
    app_js = app_js.replace(old_filter, new_filter)
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(app_js)
    print("Added date filter to Top 20 list in app.js")
else:
    print("Failed to find renderTopRiskDays loop in app.js")

