import json

# Read new topology
with open('network_topology.json', 'r', encoding='utf-8') as f:
    topology = json.load(f)

# Read existing data.js
with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Find where SLD Network Topology starts
marker = "// SLD Network Topology"
idx = js.find(marker)

if idx != -1:
    # Truncate anything from marker onwards
    js = js[:idx]

# Append the new topology
append_code = f"\n\n// SLD Network Topology\nDASHBOARD_DATA.network_topology = {json.dumps(topology, separators=(',', ':'))};\n"
js += append_code

with open('data.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Updated data.js with fixed network topology!")
