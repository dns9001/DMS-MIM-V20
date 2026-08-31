const fs = require('fs');
const content = fs.readFileSync('server/routes.ts', 'utf8');

const updated = content
  .replace('newAtt.check_in_photo', 'newAtt.photo_in')
  .replace('newAtt.distance_m', 'newAtt.distance_in_m');

fs.writeFileSync('server/routes.ts', updated);
