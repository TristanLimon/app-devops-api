import Database from 'better-sqlite3';
import path from 'path';

export const dbPath = path.resolve('database.db');

const isTest = process.env.NODE_ENV === 'test';
export const db = new Database(isTest ? ':memory:' : dbPath);

if (!isTest) {
  db.pragma('journal_mode = WAL');
}

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS estudiantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      creditos INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estudiante_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id),
      FOREIGN KEY (curso_id) REFERENCES cursos(id)
    );
  `);
}

initDB();