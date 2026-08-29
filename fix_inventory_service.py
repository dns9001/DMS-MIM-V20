import sys

with open("server/inventory.service.ts", "r") as f:
    content = f.read()

content = content.replace("handover.office_id", "(handover.warehouse_id || handover.office_id)")
content = content.replace("stockReturn.office_id", "(stockReturn.warehouse_id || stockReturn.office_id)")

with open("server/inventory.service.ts", "w") as f:
    f.write(content)
