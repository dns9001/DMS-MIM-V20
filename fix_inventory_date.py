import sys
with open("server/inventory.service.ts", "r") as f:
    content = f.read()

content = content.replace("handover.handover_date ||", "handover.handover_date || handover.business_date ||")
content = content.replace("stockReturn.return_date ||", "stockReturn.return_date || stockReturn.business_date ||")
content = content.replace("receiving.receiving_date ||", "receiving.receiving_date || receiving.business_date ||")

with open("server/inventory.service.ts", "w") as f:
    f.write(content)
