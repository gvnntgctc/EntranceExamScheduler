const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
(async () => {
  const url = 'http://127.0.0.1:3000/admin/export-schedule?examDate=2026-03-31';
  const res = await fetch(url);
  console.log('status', res.status, 'content-type', res.headers.get('content-type'));
  const body = await res.arrayBuffer();
  fs.writeFileSync('test-export-2026-03-31.xlsx', Buffer.from(body));
  console.log('wrote test-export-2026-03-31.xlsx', body.byteLength, 'bytes');
})();
