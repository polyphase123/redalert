import pandas as pd
from datetime import datetime

df = pd.read_csv('HAPOS_20260520 (1).csv')
print(len(df))
print(df['START_TIME'].head())

outages = []
month_names = {1:'Jan', 2:'Feb', 3:'Mar', 4:'Apr', 5:'May', 6:'Jun', 7:'Jul', 8:'Aug', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dec'}

for idx, row in df.iterrows():
    plant = row['RESOURCE_NAME']
    start = row['START_TIME']
    end = row['END_TIME']
    status = row['STATUS']
    if status == 'OUT' and pd.notna(start) and pd.notna(end):
        try:
            s_dt = datetime.strptime(start, '%m/%d/%Y %I:%M:%S %p')
            e_dt = datetime.strptime(end, '%m/%d/%Y %I:%M:%S %p')
            s_str = f"{month_names[s_dt.month]}{s_dt.day}"
            e_str = f"{month_names[e_dt.month]}{e_dt.day}"
            
            # Find grid? We can determine it by name or just put "Unknown" and let the logic handle it
            outages.append({
                "grid": "Unknown",
                "plant": plant,
                "capacity": 0, # We might need to pull capacity from data.js
                "start": s_str,
                "end": e_str
            })
        except Exception as e:
            pass

print("Parsed", len(outages), "outages")
