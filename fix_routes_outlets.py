import sys

with open("server/routes.ts", "r") as f:
    content = f.read()

target = """  syncSingleDoc("outlets", newOutlet._id, newOutlet);"""
repl = """  syncSingleDoc("outlets", newOutlet._id, newOutlet);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { outlets: pgOutlets } = require('../src/db/schema.js');

    await sqlDb.insert(pgOutlets).values({
      id: newOutlet._id,
      outletCode: newOutlet.outlet_code,
      outletName: newOutlet.outlet_name,
      ownerName: newOutlet.owner_name,
      phone: newOutlet.phone,
      address: newOutlet.address,
      latitude: newOutlet.latitude,
      longitude: newOutlet.longitude,
      areaId: newOutlet.area_id,
      status: newOutlet.status,
      photoUrl: newOutlet.photo_url,
      notes: newOutlet.notes,
      createdAt: new Date(newOutlet.created_at)
    });
  } catch (err: any) {
    console.error("Error inserting outlet to Postgres:", err.message);
  }"""
content = content.replace(target, repl)

with open("server/routes.ts", "w") as f:
    f.write(content)
