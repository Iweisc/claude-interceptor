'use strict';

require('dotenv').config();

const { createApp } = require('./src/app');
const { createConfig } = require('./src/config');
const { createPool, initDb } = require('./src/db');

async function main() {
  const config = createConfig(process.env);
  const pool = createPool(config);

  await initDb(pool);

  const app = createApp({ config, pool });

  app.listen(config.port, () => {
    console.log(`[proxy] listening on ${config.port}`);
  });
}

main().catch((error) => {
  console.error('[proxy] startup failed', error);
  process.exit(1);
});
