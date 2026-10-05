import { PgBoss } from 'pg-boss';
import { env } from '../config/env';

export const boss = new PgBoss(env.DATABASE_URL);

boss.on('error', (error) => console.error('pg-boss error:', error));

export async function initBoss() {
  await boss.start();
}
