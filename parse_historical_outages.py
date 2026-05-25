import pandas as pd
import json
import datetime

month_names = {1:'Jan', 2:'Feb', 3:'Mar', 4:'Apr', 5:'May', 6:'Jun', 7:'Jul', 8:'Aug', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dec'}

def parse_date(d):
    if pd.isna(d):
        return None
    if isinstance(d, datetime.datetime):
        return f"{month_names[d.month]} {d.day}"
    if isinstance(d, str):
        try:
            dt = datetime.datetime.strptime(d, "%Y-%m-%d %H:%M:%S")
            return f"{month_names[dt.month]} {dt.day}"
        except:
            return None
    return None

new_outages = []
xls = pd.ExcelFile('Plants on Outage in Luzon and Visayas grids on 12-18 May 2026(1).xlsx')

for sheet in xls.sheet_names:
    df = pd.read_excel('Plants on Outage in Luzon and Visayas grids on 12-18 May 2026(1).xlsx', sheet_name=sheet, header=2)
    
    for idx, row in df.iterrows():
        if idx < 2:
            continue
            
        grid = row.get('Grid')
        plant = row.get('Generating Unit') if 'Generating Unit' in row else None
        if not plant or pd.isna(plant):
            plant = row.get('Generating Facility') if 'Generating Facility' in row else None
            
        cap = row.get('Total Outage Capacity (MW)') if 'Total Outage Capacity (MW)' in row else row.get('Derated Capacity (MW)')
        start_date = row.get('Actual Outage Occurrence')
        end_date1 = row.get('Actual Outage Resumption') if 'Actual Outage Resumption' in row else None
        end_date2 = row.get('Estimated Resumption') if 'Estimated Resumption' in row else None
        
        if pd.isna(grid) or pd.isna(plant) or pd.isna(start_date):
            continue
            
        end_date = end_date1 if pd.notna(end_date1) else end_date2
        
        s_str = parse_date(start_date)
        e_str = parse_date(end_date)
        
        if not e_str:
            e_str = "May 31"
            
        if s_str and e_str:
            try:
                capacity = float(cap)
            except:
                capacity = 0.0
                
            new_outages.append({
                "grid": str(grid).strip(),
                "plant": str(plant).strip(),
                "capacity": capacity,
                "start": s_str,
                "end": e_str,
                "year": 2026  # Added explicit year so it doesn't repeat!
            })

print(f"Found {len(new_outages)} historical outages across all sheets.")

with open('gomp.json', 'r', encoding='utf-8') as f:
    gomp = json.load(f)

gomp.extend(new_outages)

with open('gomp.json', 'w', encoding='utf-8') as f:
    json.dump(gomp, f, indent=2)

print("Appended to gomp.json")
