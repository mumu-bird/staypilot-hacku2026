import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Single transactional checkpoint keeps wallet, orders, idempotency and audit chain consistent. */
export class SQLiteStore {
 db: DatabaseSync;
 constructor(path: string) {
   if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
   this.db = new DatabaseSync(path);
   this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS checkpoint (id INTEGER PRIMARY KEY CHECK(id = 1), snapshot TEXT NOT NULL, updated_at TEXT NOT NULL);');
 }
 read<T>(): T | null {
   const row = this.db.prepare('SELECT snapshot FROM checkpoint WHERE id = 1').get() as {snapshot:string}|undefined;
   return row ? JSON.parse(row.snapshot) as T : null;
 }
 write(value: unknown): void {
   const snapshot = JSON.stringify(value);
   this.db.exec('BEGIN IMMEDIATE');
   try {
     this.db.prepare('INSERT INTO checkpoint(id,snapshot,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at').run(snapshot, new Date().toISOString());
     this.db.exec('COMMIT');
   } catch (error) {this.db.exec('ROLLBACK'); throw error;}
 }
 close(): void {this.db.close();}
}
