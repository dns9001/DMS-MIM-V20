import sys
import re

with open("server/routes.ts", "r") as f:
    content = f.read()

target = r"""  db\.gps_events\.push\(\{
    user_id: req\.user!\._id,
    latitude,
    longitude,
    accuracy,
    battery,
    speed,
    timestamp: now,
  \}\);

  res\.json\(\{ ok: true \}\);"""
repl = r"""  const gpsEv = {
    _id: `gps-${Date.now()}-${req.user!._id}`,
    user_id: req.user!._id,
    latitude,
    longitude,
    accuracy,
    battery,
    speed,
    timestamp: now,
  };
  db.gps_events.push(gpsEv);
  syncSingleDoc("gps_events", gpsEv._id, gpsEv);

  try {
    const { sqlDb } = require('../src/db/index.js');
    const { gpsEvents: pgGpsEvents } = require('../src/db/schema.js');
    sqlDb.insert(pgGpsEvents).values({
      id: gpsEv._id,
      userId: gpsEv.user_id,
      latitude: gpsEv.latitude,
      longitude: gpsEv.longitude,
      accuracy: gpsEv.accuracy,
      batteryLevel: gpsEv.battery,
      eventType: "HEARTBEAT",
      timestamp: new Date(gpsEv.timestamp),
      metadata: { speed: gpsEv.speed }
    }).catch((err: any) => console.error("Error inserting gps event to Postgres:", err.message));
  } catch (err: any) {}

  res.json({ ok: true });"""

content = re.sub(target, repl, content)

with open("server/routes.ts", "w") as f:
    f.write(content)
