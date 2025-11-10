import { config } from 'dotenv-flow';

config({
  node_env: 'test',  // will read .env.test and .env.test.local
  silent: true,
});
