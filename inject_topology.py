import json

# Read topology
with open('network_topology.json', 'r', encoding='utf-8') as f:
    topology = json.load(f)

# Read existing data.js
with open('data.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Append to data.js
# The file ends with an exported variable or simply setting object properties.
# Since we earlier injected gomp.json directly by modifying data.js (actually I don't recall exactly how I did it, but the easiest way is to append to the end of the file)
append_code = f"\n\n// SLD Network Topology\nDASHBOARD_DATA.network_topology = {json.dumps(topology, separators=(',', ':'))};\n"

with open('data.js', 'a', encoding='utf-8') as f:
    f.write(append_code)

print("Injected network topology into data.js")
