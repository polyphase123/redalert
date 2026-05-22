import json
import re

with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

match = re.search(r'\"gomp_outages\":\s*(\[.*?\])(?=\s*,\s*\"|\s*\})', js, re.DOTALL)
if match:
    gomp = json.loads(match.group(1))
    
    # Dictionary of known plant capacities
    capacity_map = {
        "ILIJAN A1": 600, "ILIJAN A2": 600,
        "CAL U1": 300, "CAL U2": 300,
        "SN ROQUE 1": 145, "SN ROQUE 2": 145, "SN ROQUE 3": 145,
        "KAL 1": 180, "KAL 2": 180, "KAL 3": 180, "KAL 4": 180,
        "SAN GABRIEL": 414,
        "AMB U1": 35, "AMB U2": 35, "AMB U3": 35,
        "BIN U1": 35, "BIN U2": 35, "BIN U3": 35, "BIN U4": 35,
        "AVION 1": 50, "AVION 2": 50,
        "BOT 1": 10, "BOT 2": 10,
        "ANG M U3": 50, "ANG M U4": 50,
        "SAN MARCELINO": 283,
        "CALATAGAN": 63,
        "MONTALBAN": 8,
        "CARE Solar": 50,
        "Laoag Solar (PVSI)": 50
    }
    
    # Subic U1 - U8
    for i in range(1, 9):
        capacity_map[f"SUBIC U{i}"] = 14
        
    # Ingrid 1 - 6
    for i in range(1, 7):
        capacity_map[f"INGRID {i}"] = 25
        
    # Angat Aux
    for i in range(1, 6):
        capacity_map[f"ANG A U{i}"] = 10
        
    # Therma Mobile
    for i in range(1, 14):
        capacity_map[f"TMO PB 3 U{i}"] = 5
        capacity_map[f"TMO PB 4 U{i}"] = 5
        capacity_map[f"TMO PB5 U{i}"] = 5
        capacity_map[f"TMO PB 6 U{i}"] = 5
        
    # Sal-angan and Lon-oy
    for i in range(1, 5):
        capacity_map[f"SAL-ANGAN UNIT {i}"] = 5
        capacity_map[f"LON-OY UNIT {i}"] = 3
        capacity_map[f"LABAY UNIT {i}"] = 4
        
    updated_count = 0
    for o in gomp:
        cap = o.get('capacity', 0)
        if cap == 0 or cap == '0' or cap == 0.0:
            plant_name = o.get('plant', '')
            if plant_name in capacity_map:
                o['capacity'] = capacity_map[plant_name]
                updated_count += 1
            else:
                # If it's a known non-generator, we leave it as 0
                pass
                
    if updated_count > 0:
        new_gomp_str = json.dumps(gomp, indent=4)
        js = js[:match.start(1)] + new_gomp_str + js[match.end(1):]
        with open('data.js', 'w', encoding='utf-8') as f:
            f.write(js)
        print(f"Successfully updated MW capacity for {updated_count} generator records!")
    else:
        print("No zero-capacity generators matched.")
else:
    print("Could not find gomp_outages")
