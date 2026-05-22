import PyPDF2
import re
import json
import traceback

def parse_gomp_pdf(filepath):
    try:
        reader = PyPDF2.PdfReader(filepath)
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return []

    outages = []
    
    # Regex to match: Plant Name, Capacity, Date Range
    # Example: ANDA(APC2) 72 Jan1 [0:0] -Jan5[0:0]
    # DINGININ 1 668  Nov6 [0:0] -Nov26
    # Sual 1 1000 Jan 1 - Jan 15
    # The plant name might have spaces, so we look for numbers near the end of the line
    
    pattern = re.compile(r'^([A-Za-z0-9\s\(\)\_\-]+?)\s+([\d\.]+|-)\s+([A-Za-z]{3}\s*\d{1,2}(?:\s*\[[\d\:]+\])?)\s*-\s*([A-Za-z]{3}\s*\d{1,2}(?:\s*\[[\d\:]+\])?)', re.IGNORECASE)
    
    current_grid = "Luzon"
    
    for i in range(len(reader.pages)):
        text = reader.pages[i].extract_text()
        if not text:
            continue
        
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if "VISAYAS Grid Operating" in line:
                current_grid = "Visayas"
            elif "MINDANAO Grid Operating" in line:
                current_grid = "Mindanao"
            elif "LUZON Grid Operating" in line:
                current_grid = "Luzon"
                
            match = pattern.search(line)
            if match:
                plant_unit = match.group(1).strip()
                capacity_str = match.group(2).strip()
                start_date = match.group(3).strip()
                end_date = match.group(4).strip()
                
                # Cleanup capacity
                try:
                    capacity = float(capacity_str) if capacity_str != '-' else 0.0
                except:
                    capacity = 0.0
                    
                # Clean dates (remove the [0:0] part if it exists)
                start_date = re.sub(r'\[.*?\]', '', start_date).strip()
                end_date = re.sub(r'\[.*?\]', '', end_date).strip()
                
                outages.append({
                    "grid": current_grid,
                    "plant": plant_unit,
                    "capacity": capacity,
                    "start": start_date,
                    "end": end_date
                })

    return outages

if __name__ == "__main__":
    outages = parse_gomp_pdf('DOE-approved GOMP 2026-2028 Rev. 0_watermark.pdf')
    with open('gomp.json', 'w') as f:
        json.dump(outages, f, indent=2)
    print(f"Extracted {len(outages)} GOMP outages.")
