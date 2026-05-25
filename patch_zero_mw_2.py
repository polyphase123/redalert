import json
import re

with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

match = re.search(r'\"gomp_outages\":\s*(\[.*?\])(?=\s*,\s*\"|\s*\})', js, re.DOTALL)
if match:
    gomp = json.loads(match.group(1))
    
    capacity_map = {
        "AMPOHAW UNIT 1": 2.6, "AMPOHAW UNIT 2": 2.6, "AMPOHAW UNIT 3": 2.6,
        "BINENG 3 UNIT 1": 5.6,
        "CIP II Unit 1": 5.3, "CIP II Unit 2": 5.3, "CIP II Unit 3": 5.3, "CIP II Unit 4": 5.3,
        "IRISAN 1 UNIT 1": 1.0,
        "IRISAN 3 UNIT 1": 0.4, "IRISAN 3 UNIT 2": 0.4, "IRISAN 3 UNIT 3": 0.4,
        "RASLAG 3": 18.0,
        "RASLAG 4": 36.6,
        "SABANGAN HEPP UNIT 1": 7.0, "SABANGAN HEPP UNIT 2": 7.0,
        "PALAYAN": 35.7,
        "TANAWON": 21.5,
        "LA TRINIDAD UNIT 1": 10.2, "LA TRINIDAD UNIT 2": 10.2,
        "Bacman BESS": 29.0,
        "ANDA(APC2)": 82.0,
        "Currimao 2 (NSEC)": 83.3,
        "MATUNO": 8.6,
        "Tiwi Binary": 14.0,
        "BCF 2": 7.8,
        "SN LO 1": 2.5, "SN LO 2": 2.5, # Assuming San Luis Hydro or similar small hydro
        "FLS PLANT UNIT 1": 2.0, "FLS PLANT UNIT 2": 2.0, "FLS PLANT UNIT 3": 2.0, "FLS PLANT UNIT 4": 2.0
    }
    
    updated_count = 0
    for o in gomp:
        cap = o.get('capacity', 0)
        if cap == 0 or cap == '0' or cap == 0.0:
            plant_name = o.get('plant', '')
            if plant_name in capacity_map:
                o['capacity'] = capacity_map[plant_name]
                updated_count += 1
                
    if updated_count > 0:
        new_gomp_str = json.dumps(gomp, indent=4)
        js = js[:match.start(1)] + new_gomp_str + js[match.end(1):]
        with open('data.js', 'w', encoding='utf-8') as f:
            f.write(js)
        print(f"Successfully updated MW capacity for {updated_count} additional generator records!")
    else:
        print("No zero-capacity generators matched.")
else:
    print("Could not find gomp_outages")
