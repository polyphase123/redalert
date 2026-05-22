import re
import time

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add a timestamp cache buster to data.js and app.js to bypass GitHub Pages aggressive caching
version = str(int(time.time()))

html = re.sub(r'<script src="data\.js(\?v=\d+)?"></script>', f'<script src="data.js?v={version}"></script>', html)
html = re.sub(r'<script src="app\.js(\?v=\d+)?"></script>', f'<script src="app.js?v={version}"></script>', html)
html = re.sub(r'<link rel="stylesheet" href="index\.css(\?v=\d+)?">', f'<link rel="stylesheet" href="index.css?v={version}">', html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"Added cache-busters with version {version}")
