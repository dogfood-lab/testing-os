from pathlib import Path

latest = Path('indexes') / 'latest.json'
summary = latest.read_text()
with open('reports/out.json', 'w') as out:
    out.write(summary)
