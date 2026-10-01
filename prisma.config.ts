import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';
import { toPrismaCliUrl } from './prisma/cli-url';
dotenv.config();

export default defineConfig({
  
  datasource: {
    // Y-1 (R-S7): verify-full+sslrootcert → Prisma's own strict TLS spelling.
    // CLI only; node-pg keeps reading the unconverted DATABASE_URL.
    url: toPrismaCliUrl(process.env.DATABASE_URL)
  }
});
