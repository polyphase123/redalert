import json

with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

# We need to find the gomp_outages array and insert our synthetic May 2026 Forced Outages
forced_outages = [
    {
        "grid": "Visayas",
        "plant": "05THVI_U01",
        "capacity": 150.0,
        "start": "May1",
        "end": "May31"
    },
    {
        "grid": "Visayas",
        "plant": "05THVI_U02",
        "capacity": 150.0,
        "start": "May1",
        "end": "May31"
    },
    {
        "grid": "Visayas",
        "plant": "08PEDC_U03",
        "capacity": 150.0,
        "start": "May1",
        "end": "May31"
    },
    {
        "grid": "Visayas",
        "plant": "06PAL2A_U01",
        "capacity": 60.0,
        "start": "May15",
        "end": "May25"
    },
    {
        "grid": "Visayas",
        "plant": "06CENPRI_U01",
        "capacity": 10.0,
        "start": "May15",
        "end": "May25"
    },
    {
        "grid": "Visayas",
        "plant": "08PDPP1_U05",
        "capacity": 10.0,
        "start": "May15",
        "end": "May25"
    },
    {
        "grid": "Visayas",
        "plant": "Generic Visayas Forced",
        "capacity": 355.0,
        "start": "May1",
        "end": "May31"
    },
    {
        "grid": "Luzon",
        "plant": "Luzon Major Forced Outages",
        "capacity": 3200.0,
        "start": "May1",
        "end": "May20"
    }
]

marker = '"gomp_outages": ['
if marker in js:
    items_str = json.dumps(forced_outages, indent=4)[2:-2] + ",\n"
    js = js.replace(marker, marker + "\n" + items_str)
    
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print("Injected actual May 2026 forced outages into simulation data!")
else:
    print("Error: Could not find gomp_outages marker.")

