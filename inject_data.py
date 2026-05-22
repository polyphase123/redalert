import json
import os

# Read existing data.js
with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()
    # Strip prefix
    prefix = "// NGCP Power Grid Reliability Dashboard Data\nconst DASHBOARD_DATA = "
    json_str = content[len(prefix):].strip()
    if json_str.endswith(';'):
        json_str = json_str[:-1]
        
    dashboard_data = json.loads(json_str)

# Read GOMP data
with open('gomp.json', 'r', encoding='utf-8') as f:
    gomp_data = json.load(f)
    
# Read Mindanao data
with open('mindanao_plants.json', 'r', encoding='utf-8') as f:
    mindanao_data = json.load(f)

# Inject
dashboard_data['gomp_outages'] = gomp_data
dashboard_data['mindanao_plants'] = mindanao_data

# Write back
with open('data.js', 'w', encoding='utf-8') as f:
    f.write("// NGCP Power Grid Reliability Dashboard Data\n")
    f.write("const DASHBOARD_DATA = ")
    json.dump(dashboard_data, f, indent=2)
    f.write(";\n")
    
print("Successfully injected new data into data.js")
