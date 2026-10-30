// Materialize zero-dependency static preview modules. Keep byte-identical to the shared API client.
import fs from 'node:fs';
fs.mkdirSync(new URL('./shared/', import.meta.url), { recursive: true });
for (const name of ['visitor-auth-client.js', 'visitor-challenge.js']) fs.copyFileSync(new URL(`../../shared/${name}`, import.meta.url), new URL(`./shared/${name}`, import.meta.url));
console.log('Static preview ready in deploy/auth-demo/. Static hosting keeps sign-in disabled.');
