// Baut den Entwurf: Vorlage + Testdaten (aus data.json/data-fd.json) -> admin-entwurf.html
const fs = require('fs');
const [, , dataPath, fdPath] = process.argv;
const safe = (p) => fs.readFileSync(p, 'utf8').trim().replace(/<\//g, '<\/');
const html = fs.readFileSync(__dirname + '/template.html', 'utf8').replace('__DATA__', () => safe(dataPath)).replace('__DATAFD__', () => safe(fdPath));
fs.writeFileSync(__dirname + '/admin-entwurf.html', html);
console.log('ok', html.length);
