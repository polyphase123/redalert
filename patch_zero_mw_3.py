import json
import re

with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

match = re.search(r'\"gomp_outages\":\s*(\[.*?\])(?=\s*,\s*\"|\s*\})', js, re.DOTALL)
if match:
    gomp = json.loads(match.group(1))
    
    capacity_map = {
        "IBEC": 20.0,
        "CBEC": 15.0,
        "BT2020_2": 12.5,
        "MAI": 20.0,
        "MAI2": 12.0,
        "TW 1": 55.0, # Tiwi Unit 1
        "MB 1": 55.0, "MB 2": 55.0, "MB 3": 55.0, "MB 4": 55.0, "MB 5": 55.0, "MB 6": 55.0,
        "MB 7": 20.0, "MB 8": 20.0, "MB 9": 20.0, "MB 10": 20.0, "MB O": 20.0 # Makban Geothermal
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
        print(f"Successfully updated MW capacity for {updated_count} additional generator records (including MakBan)!")
    else:
        print("No zero-capacity generators matched.")
else:
    print("Could not find gomp_outages")
