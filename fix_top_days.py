with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Fix ReferenceError in calculateAlertProbabilities()
old_push = """    timeline.push({ 
      day: i, date: new Date(d), 
      luzMw, visMw, minMw,"""

new_push = """    timeline.push({ 
      day: i, date: new Date(d), 
      luzMw: luzonMw, visMw: visayasMw, minMw: mindanaoMw,"""

js = js.replace(old_push, new_push)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("Fixed variable references in timeline.push()")
