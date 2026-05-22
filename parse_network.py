import csv
import json
import os

# Parse Stations
stations = {}
with open('models/mnm_stationlist.csv', 'r', encoding='latin-1') as f:
    reader = csv.DictReader(f)
    for row in reader:
        st_name = row['STATION NAME']
        if st_name and st_name != 'EOF':
            if st_name not in stations:
                stations[st_name] = {
                    'id': st_name,
                    'type': 'station',
                    'grid': row.get('REGION_NAME', 'UNKNOWN').strip(),
                    'buses': [],
                }
            stations[st_name]['buses'].append(row['BUS NAME'])

# Parse Generators
generators = []
with open('models/mnm_genlist.csv', 'r', encoding='latin-1') as f:
    reader = csv.DictReader(f)
    for row in reader:
        gen_name = row['RESOURCE NAME']
        st_name = row['STATION NAME']
        if gen_name:
            generators.append({
                'id': gen_name,
                'name': row.get('DESCRIPTION', gen_name),
                'type': 'generator',
                'station': st_name,
                'grid': row.get('REGION NAME', 'UNKNOWN').strip(),
                'owner': row.get('TRADING PARTICIPANT', '')
            })

# Build Node / Edge Graph
nodes = []
edges = []

# Add Grids
grids = set([s['grid'] for s in stations.values()])
for gen in generators:
    if gen['grid']:
        grids.add(gen['grid'])
grids.add('UNKNOWN')

for g in grids:
    nodes.append({'id': f"GRID_{g}", 'name': g if g else "UNKNOWN", 'type': 'grid', 'group': 1})

# Add Stations
for st_id, st in stations.items():
    nodes.append({
        'id': f"ST_{st_id}",
        'name': st_id,
        'type': 'station',
        'grid': st['grid'],
        'group': 2
    })
    edges.append({
        'source': f"GRID_{st['grid']}",
        'target': f"ST_{st_id}",
        'value': 10
    })

# Add Generators
for gen in generators:
    nodes.append({
        'id': f"GEN_{gen['id']}",
        'name': gen['name'],
        'short_name': gen['id'],
        'type': 'generator',
        'grid': gen['grid'],
        'station': gen['station'],
        'owner': gen['owner'],
        'group': 3
    })
    
    grid_id = gen['grid'] if gen['grid'] else 'UNKNOWN'
    st_target = f"ST_{gen['station']}" if gen['station'] in stations else f"GRID_{grid_id}"
    edges.append({
        'source': st_target,
        'target': f"GEN_{gen['id']}",
        'value': 2
    })

topology = {
    'nodes': nodes,
    'edges': edges
}

with open('network_topology.json', 'w', encoding='utf-8') as f:
    json.dump(topology, f, indent=2)

print("Parsed network topology:", len(nodes), "nodes and", len(edges), "edges.")
