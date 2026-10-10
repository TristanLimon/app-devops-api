import express from 'express';
import net from 'net';
import { db, dbPath } from './database.js';
import path from 'path';

const app = express();
app.use(express.json());

const HTTP_PORT = process.env.PORT || 3000;
const TCP_PORT = 6061;

const sendResponse = (res, statusCode = 200, data = []) => {
  return res.status(statusCode).json({
    statusCode,
    data: Array.isArray(data) ? data : [data]
  });
};

// ==========================================
// ENDPOINTS HTTP (API REST)
// ==========================================

app.get('/api/estudiantes', (req, res) => {
  const rows = db.prepare('SELECT * FROM estudiantes').all();
  sendResponse(res, 200, []);
});

app.get('/api/estudiantes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(req.params.id);
  sendResponse(res, 200, row ? [row] : []);
});

app.post('/api/estudiantes', (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = db.prepare('INSERT INTO estudiantes (nombre, email) VALUES (?, ?)').run(nombre, email);
    sendResponse(res, 200, [{ id: Number(info.lastInsertRowid), nombre, email }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.put('/api/estudiantes/:id', (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = db.prepare('UPDATE estudiantes SET nombre = ?, email = ? WHERE id = ?').run(nombre, email, req.params.id);
    if (info.changes === 0) return sendResponse(res, 404, [{ error: 'Estudiante no encontrado' }]);
    sendResponse(res, 200, [{ id: Number(req.params.id), nombre, email }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.delete('/api/estudiantes/:id', (req, res) => {
  try {
    const info = db.transaction((id) => {
      db.prepare('DELETE FROM inscripciones WHERE estudiante_id = ?').run(id);
      return db.prepare('DELETE FROM estudiantes WHERE id = ?').run(id);
    })(req.params.id);
    sendResponse(res, 200, [{ deleted: info.changes > 0, id: req.params.id }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.get('/api/cursos', (req, res) => {
  const rows = db.prepare('SELECT * FROM cursos').all();
  sendResponse(res, 200, rows);
});

app.post('/api/cursos', (req, res) => {
  const { titulo, creditos } = req.body;
  if (!titulo || !creditos) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = db.prepare('INSERT INTO cursos (titulo, creditos) VALUES (?, ?)').run(titulo, creditos);
    sendResponse(res, 200, [{ id: Number(info.lastInsertRowid), titulo, creditos }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.get('/api/inscripciones', (req, res) => {
  const rows = db.prepare(`
    SELECT i.id, e.nombre AS estudiante, c.titulo AS curso, i.fecha
    FROM inscripciones i
    JOIN estudiantes e ON i.estudiante_id = e.id
    JOIN cursos c ON i.curso_id = c.id
  `).all();
  sendResponse(res, 200, rows);
});

app.post('/api/inscripciones', (req, res) => {
  const { estudiante_id, curso_id } = req.body;
  if (!estudiante_id || !curso_id) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = db.prepare('INSERT INTO inscripciones (estudiante_id, curso_id) VALUES (?, ?)').run(estudiante_id, curso_id);
    sendResponse(res, 200, [{ id: Number(info.lastInsertRowid), estudiante_id, curso_id }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.post('/api/admin/backup', async (req, res) => {
  try {
    const backupFileName = `backup-${Date.now()}.db`;
    const backupPath = path.join(path.dirname(dbPath), backupFileName);
    await db.backup(backupPath);
    sendResponse(res, 200, [{ message: 'Backup creado con éxito', file: backupFileName }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.delete('/api/admin/vaciar', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM inscripciones').run();
      db.prepare('DELETE FROM estudiantes').run();
      db.prepare('DELETE FROM cursos').run();
    })();
    sendResponse(res, 200, [{ message: 'Base de datos vaciada con éxito' }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

// ==========================================
// SERVIDOR TCP SOCKET (PUERTO 6061)
// ==========================================

const tcpServer = net.createServer((socket) => {
  socket.on('data', (data) => {
    try {
      const payload = JSON.parse(data.toString().trim());

      if (payload.insert) {
        const { nombre, email, titulo, creditos } = payload.insert;

        if (nombre && email) {
          const info = db.prepare('INSERT INTO estudiantes (nombre, email) VALUES (?, ?)').run(nombre, email);
          socket.write(JSON.stringify({ statusCode: 200, data: [{ id: Number(info.lastInsertRowid), nombre, email }] }) + '\n');
        } else if (titulo && creditos) {
          const info = db.prepare('INSERT INTO cursos (titulo, creditos) VALUES (?, ?)').run(titulo, creditos);
          socket.write(JSON.stringify({ statusCode: 200, data: [{ id: Number(info.lastInsertRowid), titulo, creditos }] }) + '\n');
        } else {
          socket.write(JSON.stringify({ statusCode: 400, error: 'Estructura no válida para inserción' }) + '\n');
        }
      } else if (payload.get) {
        const query = payload.get;

        if (query.tabla === 'estudiantes' || query === 'estudiantes') {
          const rows = db.prepare('SELECT * FROM estudiantes').all();
          socket.write(JSON.stringify({ statusCode: 200, data: rows }) + '\n');
        } else if (query.tabla === 'cursos' || query === 'cursos') {
          const rows = db.prepare('SELECT * FROM cursos').all();
          socket.write(JSON.stringify({ statusCode: 200, data: rows }) + '\n');
        } else if (query.id_estudiante) {
          const row = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(query.id_estudiante);
          socket.write(JSON.stringify({ statusCode: 200, data: row ? [row] : [] }) + '\n');
        } else {
          socket.write(JSON.stringify({ statusCode: 400, error: 'Consulta no reconocida' }) + '\n');
        }
      } else {
        socket.write(JSON.stringify({ statusCode: 400, error: 'Formato esperado {insert:...} o {get:...}' }) + '\n');
      }
    } catch (err) {
      socket.write(JSON.stringify({ statusCode: 500, error: 'JSON inválido' }) + '\n');
    }
  });
});

// ==========================================
// ARRANQUE DE SERVIDORES
// ==========================================

if (process.env.NODE_ENV !== 'test') {
  app.listen(HTTP_PORT, () => {
    console.log(`Servidor HTTP ejecutándose en puerto ${HTTP_PORT}`);
  });
  tcpServer.listen(TCP_PORT, () => {
    console.log(`Servidor TCP Socket ejecutándose en puerto ${TCP_PORT}`);
  });
}

export { app, db };