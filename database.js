import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const isTest = process.env.NODE_ENV === 'test';

export const dbPath = path.resolve(process.env.DB_PATH || 'database.db');

if (!isTest) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(isTest ? ':memory:' : dbPath);

if (!isTest) {
  db.pragma('journal_mode = WAL');
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@uteq.mx';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

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
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'usuario',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      precio REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  seedAdmin();
}

export function seedAdmin() {
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!exists) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run('Administrador', ADMIN_EMAIL, hash, 'admin');
  }
}

initDB();
