import path from 'path';
import { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

const config: Options<PostgreSqlDriver> = {
  driver: PostgreSqlDriver,
  clientUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickets',
  // entity paths - compiled JS (dist) and TypeScript sources (src)
  entities: [path.resolve(__dirname, './entities/**/*.js')],
  entitiesTs: [path.resolve(__dirname, './entities/**/*.ts')],
  migrations: {
    path: path.resolve(__dirname, 'migrations'),
    pathTs: path.resolve(__dirname, 'migrations'),
  },
};

export default config;
