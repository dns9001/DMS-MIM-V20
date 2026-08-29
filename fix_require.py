import sys

with open("server/inventory.repository.ts", "r") as f:
    content = f.read()

content = content.replace("const { db } = require('./data.js');", "const { db } = await import('./data.js');")

with open("server/inventory.repository.ts", "w") as f:
    f.write(content)
