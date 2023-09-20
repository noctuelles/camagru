import { Client } from 'pg';

export const client = new Client({
  host: process.env['PG_HOST'] || 'postgres',
  port: parseInt(process.env['PG_PORT'] || '5432'),
  database: process.env['PG_DATABASE'] || 'camagru',
  user: process.env['PG_USER'] || 'camagru',
  password: process.env['PG_USER_PASSWORD'] || 'camagru',
});
