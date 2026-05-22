import json
import re

# 1. Update data.js with new bulletins
with open('data.js', 'r', encoding='utf-8') as f:
    js = f.read()

# The bulletins
new_bulletins = [
    {
      "timestamp": "May 22, 2026 12:40 PM",
      "sender": "Engr. Daryll M.",
      "grid": "Palawan",
      "type": "Blackout",
      "message": "Total System Blackout (TSB) in the Palawan Grid - 22 May 2026\n\nTimeline:\n• 9:22 AM – Total System Blackout due to cut-off/corrosion failure of 336.4 ACSR segment of NAPOCOR 69kV transmission line at Km 42, Sitio Tacduan, Brgy. Kamuning, Puerto Princesa. (This line segment was already scheduled for replacement in 2 weeks, but failed ahead of schedule.)\n• 10:31 AM – Manually closed 21-1BP4 with R6\n• 10:34 AM – Manually closed 21-2BP4 with R7\n  → Brooke’s Point substantially restored (except one feeder already under scheduled maintenance)\n• 10:59 AM – Manually closed 28ML4 and 29ML4\n• 11:00 AM – Manually closed 21ML4 with R3\n• 11:08 AM – Manually closed B3 Recloser\n  → Narra restored (except one feeder already under scheduled maintenance)\n\nStatus as of 12:40PM\n• Brooke’s Point and Narra already restored\n• NPC Linemen remain on site for full system restoration of cut-off Transmission line Section.\n• Current commitment: full restoration on or before 2:00 PM\n\nRequested Engr. Daryll Malabanan (Focal for Palawan SGSO) for continuous update until full restoration update"
    },
    {
      "timestamp": "May 22, 2026 8:00 AM",
      "sender": "Trish Roque",
      "grid": "Visayas",
      "type": "Yellow Alert",
      "message": "VISAYAS GRID ALERT STATUS\nUpdate as of 22 May 2026, 8:00AM\n\nYELLOW ALERT\n3:00PM- 4:00PM\n5:00PM- 9:00PM\n\nAvailable Capacity - 2,653MW\nPeak Demand - 2,485MW\n\n14 plants are on forced outage since May 2026, 1 plant since March 2026, 3 plants since 2025, 2 plants since 2024, 2 plants since 2023, and 1 plant since 2021, while 12 plants are running on derated capacities, for a total of 885.3MW unavailable to the grid.\n\nFactors that contributed to the YELLOW Alert declaration:\nUnavailability of Visayas' large coal plants TVI 1, TVI 2, and PEDC 3\n2. High forecasted system demand\n\nA yellow alert is issued when the operating margin is insufficient to meet the transmission grid’s contingency requirement.\n\n#NGCPAdvisory\n#gridalertph"
    },
    {
      "timestamp": "May 21, 2026 8:00 PM",
      "sender": "Kimberly R",
      "grid": "Visayas",
      "type": "Yellow Alert",
      "message": "VISAYAS GRID ALERT STATUS\nUpdate as of 21 May 2026, 8PM\n\nEXTENDED YELLOW ALERT\n\nYellow Alert\n4:00PM- 11:00PM\n\nAvailable Capacity - 2,519MW\nPeak Demand - 2,413MW\n\n18 plants are on forced outage since May 2026, 1 plant since March 2026, 3 plants since 2025, 2 plants since 2024, 2 plants since 2023, and 1 plant since 2021, while 15 plants are running on derated capacities, for a total of 934.55MW unavailable to the grid.\n\nFactors that contributed to the YELLOW Alert extension:\nUnavailability of Visayas' large coal plants TVI 1, TVI 2, and PEDC 3\n2. Forced outage of CENPRI Diesel, PDPP1 Unit 5, PDPP3, PGPP2 Unit 1 \n3. Increased forecasted system demand\n\nA yellow alert is issued when the operating margin is insufficient to meet the transmission grid’s contingency requirement.\n\n#NGCPAdvisory\n#gridalertph"
    },
    {
      "timestamp": "May 21, 2026 5:00 PM",
      "sender": "NGCP System",
      "grid": "Visayas",
      "type": "Manual Load Dropping",
      "message": "NGCP may implement Manual Load Dropping (MLD) in the following areas today, 21 May, to maintain the integrity of the power system:\n\nVISAYAS\n\n5PM-9PM\n\nVECO\nMECO\nCEBECO I\nCEBECO II\nCEBECO III\nNEPC\nNOCECO\nNORECO I\nNORECO II\nNONECO\nMORE\nAKELCO\nANTECO\nCAPELCO\nILECO I\nILECO II\nILECO III\nGUIMELCO\n\nAside from the unavailability of Visayas' large coal plants TVI 1, TVI 2, and PEDC 3, the manual load dropping is being implemented to prevent the overloading of the Daanbantayan-Tabango 230kV Line 2 due to the additional unplanned outage of CENPRI Diesel, PDPP1 Unit 5, PDPP3, PGPP2 Unit 1 amounting to 74MW. \n\nSchedule may be cancelled if system condition improves, such as if actual demand falls below projections.\n\nNGCP encourages everyone to exercise prudence in using electricity.\n\n#NGCPadvisory"
    },
    {
      "timestamp": "May 21, 2026 1:30 PM",
      "sender": "Kimberly R",
      "grid": "Visayas",
      "type": "Yellow Alert",
      "message": "VISAYAS GRID ALERT STATUS\nUpdate as of 21 May 2026, 1:30PM\n\nEXTENDED YELLOW ALERT\n\nYellow Alert\n4:00PM-9:00PM\n\nAvailable Capacity - 2,668MW\nPeak Demand - 2,486MW\n\n11 plants are on forced outage since May 2026, 1 plant since March 2026, 3 plants since 2025, 2 plants since 2024, 2 plants since 2023, and 1 plant since 2021, while 14 plants are running on derated capacities, for a total of 870.2MW unavailable to the grid.\n\nFactors that contributed to the YELLOW Alert extension:\nUnavailability of Visayas' large coal plants TVI 1, TVI 2, and PEDC 3\n2. Increased forecasted system demand by around 43MW. \n\nA yellow alert is issued when the operating margin is insufficient to meet the transmission grid’s contingency requirement.\n\n#NGCPAdvisory\n#gridalertph"
    }
]

# We need to insert these right after "ngcp_updates": [
marker = '"ngcp_updates": ['
if marker in js:
    # Build JSON string for new items without the surrounding brackets
    items_str = json.dumps(new_bulletins, indent=4)
    # Strip the brackets
    items_str = items_str[2:-2] + ",\n"
    
    js = js.replace(marker, marker + "\n" + items_str)
    
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print("Injected bulletins into data.js")
else:
    print("Could not find ngcp_updates marker")

# 2. Update app.js for viewBox clipping bug
with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Replace viewBox setup
old_svg_setup = """  const width = svgEl.clientWidth || 800;
  const height = svgEl.clientHeight || 500;
  
  const svg = d3.select('#topology-d3-svg');
  svg.selectAll('*').remove();"""

new_svg_setup = """  const width = 800;
  const height = 500;
  
  const svg = d3.select('#topology-d3-svg');
  svg.selectAll('*').remove();
  
  // Apply responsive viewBox to fix clipping on tab load
  svg.attr('viewBox', `0 0 ${width} ${height}`)
     .attr('preserveAspectRatio', 'xMidYMid meet');"""

app_js = app_js.replace(old_svg_setup, new_svg_setup)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)

print("Fixed SVG viewBox in app.js")
