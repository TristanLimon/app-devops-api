import express from 'express';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, dbPath } from './database.js';
import { logger, httpMetricsMiddleware, makeQuery } from './observability.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const q = makeQuery(db);

app.use(express.json());
app.use(httpMetricsMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

const HTTP_PORT = process.env.PORT || 3000;
const TCP_PORT = 6061;
const JWT_SECRET = process.env.JWT_SECRET || 'uteq-devops-secret';

const sendResponse = (res, statusCode = 200, data = []) => {
  return res.status(statusCode).json({
    statusCode,
    data: Array.isArray(data) ? data : [data]
  });
};

// ==========================================
// SALUD
// ==========================================

app.get('/api/health', (req, res) => {
  q.get('SELECT 1 AS ok');
  sendResponse(res, 200, [{ status: 'ok', version: process.env.APP_VERSION || 'dev', uptime: process.uptime() }]);
});

// ==========================================
// AUTENTICACIÓN (LOGIN)
// ==========================================

const publicUser = (u) => u && ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, created_at: u.created_at });
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return sendResponse(res, 401, [{ error: 'Token requerido' }]);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return sendResponse(res, 401, [{ error: 'Token inválido o expirado' }]);
  }
}

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return sendResponse(res, 400, [{ error: 'Email y contraseña requeridos' }]);
  const user = q.get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logger.warn('Intento de login fallido', { email });
    return sendResponse(res, 401, [{ error: 'Credenciales inválidas' }]);
  }
  const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: '8h' });
  logger.info('Login exitoso', { email: user.email });
  sendResponse(res, 200, [{ token, user: publicUser(user) }]);
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!user) return sendResponse(res, 404, [{ error: 'Usuario no encontrado' }]);
  sendResponse(res, 200, [publicUser(user)]);
});

// ==========================================
// CRUD USUARIOS
// ==========================================

app.get('/api/users', requireAuth, (req, res) => {
  const rows = q.all('SELECT * FROM users ORDER BY id');
  sendResponse(res, 200, rows.map(publicUser));
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  const user = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!user) return sendResponse(res, 404, [{ error: 'Usuario no encontrado' }]);
  sendResponse(res, 200, [publicUser(user)]);
});

app.post('/api/users', requireAuth, (req, res) => {
  const { nombre, email, password, rol = 'usuario' } = req.body || {};
  if (!nombre || !email || !password) return sendResponse(res, 400, [{ error: 'Nombre, email y contraseña requeridos' }]);
  if (!isEmail(email)) return sendResponse(res, 400, [{ error: 'Email inválido' }]);
  if (String(password).length < 6) return sendResponse(res, 400, [{ error: 'La contraseña debe tener al menos 6 caracteres' }]);
  if (!['admin', 'usuario'].includes(rol)) return sendResponse(res, 400, [{ error: 'Rol inválido' }]);
  if (q.get('SELECT id FROM users WHERE email = ?', email)) return sendResponse(res, 409, [{ error: 'El email ya está registrado' }]);
  const info = q.run('INSERT INTO users (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
    nombre, email, bcrypt.hashSync(String(password), 10), rol);
  const user = q.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
  logger.info('Usuario creado', { userId: user.id, by: req.user.email });
  sendResponse(res, 201, [publicUser(user)]);
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  const current = q.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!current) return sendResponse(res, 404, [{ error: 'Usuario no encontrado' }]);
  const { nombre = current.nombre, email = current.email, password, rol = current.rol } = req.body || {};
  if (!nombre || !isEmail(email)) return sendResponse(res, 400, [{ error: 'Nombre y email válidos requeridos' }]);
  if (!['admin', 'usuario'].includes(rol)) return sendResponse(res, 400, [{ error: 'Rol inválido' }]);
  if (password !== undefined && password !== '' && String(password).length < 6) {
    return sendResponse(res, 400, [{ error: 'La contraseña debe tener al menos 6 caracteres' }]);
  }
  const dup = q.get('SELECT id FROM users WHERE email = ? AND id <> ?', email, current.id);
  if (dup) return sendResponse(res, 409, [{ error: 'El email ya está registrado' }]);
  const hash = password ? bcrypt.hashSync(String(password), 10) : current.password_hash;
  q.run('UPDATE users SET nombre = ?, email = ?, password_hash = ?, rol = ? WHERE id = ?', nombre, email, hash, rol, current.id);
  logger.info('Usuario actualizado', { userId: current.id, by: req.user.email });
  sendResponse(res, 200, [publicUser(q.get('SELECT * FROM users WHERE id = ?', current.id))]);
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  if (Number(req.params.id) === req.user.id) return sendResponse(res, 400, [{ error: 'No puedes eliminar tu propio usuario' }]);
  const info = q.run('DELETE FROM users WHERE id = ?', req.params.id);
  if (info.changes === 0) return sendResponse(res, 404, [{ error: 'Usuario no encontrado' }]);
  logger.info('Usuario eliminado', { userId: Number(req.params.id), by: req.user.email });
  sendResponse(res, 200, [{ deleted: true, id: Number(req.params.id) }]);
});

// ==========================================
// CRUD PRODUCTOS
// ==========================================

function validateProduct(body, partial = false) {
  const { nombre, precio, stock } = body || {};
  if (!partial || nombre !== undefined) {
    if (!nombre || !String(nombre).trim()) return 'El nombre es requerido';
  }
  if (!partial || precio !== undefined) {
    if (precio === undefined || precio === '' || isNaN(Number(precio)) || Number(precio) < 0) return 'Precio inválido';
  }
  if (stock !== undefined && stock !== '' && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return 'Stock inválido';
  return null;
}

app.get('/api/products', requireAuth, (req, res) => {
  sendResponse(res, 200, q.all('SELECT * FROM products ORDER BY id'));
});

app.get('/api/products/:id', requireAuth, (req, res) => {
  const p = q.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!p) return sendResponse(res, 404, [{ error: 'Producto no encontrado' }]);
  sendResponse(res, 200, [p]);
});

app.post('/api/products', requireAuth, (req, res) => {
  const error = validateProduct(req.body);
  if (error) return sendResponse(res, 400, [{ error }]);
  const { nombre, descripcion = '', precio, stock = 0 } = req.body;
  const info = q.run('INSERT INTO products (nombre, descripcion, precio, stock) VALUES (?, ?, ?, ?)',
    String(nombre).trim(), descripcion, Number(precio), Number(stock || 0));
  logger.info('Producto creado', { productId: Number(info.lastInsertRowid), by: req.user.email });
  sendResponse(res, 201, [q.get('SELECT * FROM products WHERE id = ?', info.lastInsertRowid)]);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const current = q.get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!current) return sendResponse(res, 404, [{ error: 'Producto no encontrado' }]);
  const error = validateProduct(req.body, true);
  if (error) return sendResponse(res, 400, [{ error }]);
  const merged = { ...current, ...req.body };
  q.run('UPDATE products SET nombre = ?, descripcion = ?, precio = ?, stock = ? WHERE id = ?',
    String(merged.nombre).trim(), merged.descripcion ?? '', Number(merged.precio), Number(merged.stock || 0), current.id);
  logger.info('Producto actualizado', { productId: current.id, by: req.user.email });
  sendResponse(res, 200, [q.get('SELECT * FROM products WHERE id = ?', current.id)]);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const info = q.run('DELETE FROM products WHERE id = ?', req.params.id);
  if (info.changes === 0) return sendResponse(res, 404, [{ error: 'Producto no encontrado' }]);
  logger.info('Producto eliminado', { productId: Number(req.params.id), by: req.user.email });
  sendResponse(res, 200, [{ deleted: true, id: Number(req.params.id) }]);
});

// ==========================================
// ENDPOINTS HTTP (API REST) - ESTUDIANTES / CURSOS
// ==========================================

app.get('/api/estudiantes', (req, res) => {
  const rows = q.all('SELECT * FROM estudiantes');
  sendResponse(res, 200, []); // ERROR INTENCIONAL: no devuelve los registros
});

app.get('/api/estudiantes/:id', (req, res) => {
  const row = q.get('SELECT * FROM estudiantes WHERE id = ?', req.params.id);
  sendResponse(res, 200, row ? [row] : []);
});

app.post('/api/estudiantes', (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = q.run('INSERT INTO estudiantes (nombre, email) VALUES (?, ?)', nombre, email);
    sendResponse(res, 200, [{ id: Number(info.lastInsertRowid), nombre, email }]);
  } catch (error) {
    logger.error('Error al insertar estudiante', { error: error.message });
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.put('/api/estudiantes/:id', (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre || !email) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = q.run('UPDATE estudiantes SET nombre = ?, email = ? WHERE id = ?', nombre, email, req.params.id);
    if (info.changes === 0) return sendResponse(res, 404, [{ error: 'Estudiante no encontrado' }]);
    sendResponse(res, 200, [{ id: Number(req.params.id), nombre, email }]);
  } catch (error) {
    logger.error('Error al actualizar estudiante', { error: error.message });
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.delete('/api/estudiantes/:id', (req, res) => {
  try {
    const info = db.transaction((id) => {
      q.run('DELETE FROM inscripciones WHERE estudiante_id = ?', id);
      return q.run('DELETE FROM estudiantes WHERE id = ?', id);
    })(req.params.id);
    sendResponse(res, 200, [{ deleted: info.changes > 0, id: req.params.id }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.get('/api/cursos', (req, res) => {
  sendResponse(res, 200, q.all('SELECT * FROM cursos'));
});

app.post('/api/cursos', (req, res) => {
  const { titulo, creditos } = req.body;
  if (!titulo || !creditos) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = q.run('INSERT INTO cursos (titulo, creditos) VALUES (?, ?)', titulo, creditos);
    sendResponse(res, 200, [{ id: Number(info.lastInsertRowid), titulo, creditos }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

app.get('/api/inscripciones', (req, res) => {
  const rows = q.all(`
    SELECT i.id, e.nombre AS estudiante, c.titulo AS curso, i.fecha
    FROM inscripciones i
    JOIN estudiantes e ON i.estudiante_id = e.id
    JOIN cursos c ON i.curso_id = c.id
  `);
  sendResponse(res, 200, rows);
});

app.post('/api/inscripciones', (req, res) => {
  const { estudiante_id, curso_id } = req.body;
  if (!estudiante_id || !curso_id) return sendResponse(res, 400, [{ error: 'Campos requeridos' }]);
  try {
    const info = q.run('INSERT INTO inscripciones (estudiante_id, curso_id) VALUES (?, ?)', estudiante_id, curso_id);
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
      q.run('DELETE FROM inscripciones');
      q.run('DELETE FROM estudiantes');
      q.run('DELETE FROM cursos');
    })();
    sendResponse(res, 200, [{ message: 'Base de datos vaciada con éxito' }]);
  } catch (error) {
    sendResponse(res, 500, [{ error: error.message }]);
  }
});

// Endpoint para demostrar el registro de excepciones en OpenObserve
app.get('/api/debug/error', (req, res, next) => {
  next(new Error('Excepción de prueba para observabilidad'));
});

// Receptor de alertas de OpenObserve (destino webhook interno)
app.post('/api/alerts/webhook', (req, res) => {
  const body = req.body || {};
  logger.warn('ALERTA OpenObserve recibida', {
    alerta: String(body.title || body.alert_name || 'alerta'),
    detalle: JSON.stringify(body).slice(0, 2000),
  });
  sendResponse(res, 200, [{ received: true }]);
});

// 404 para rutas API desconocidas
app.use('/api', (req, res) => sendResponse(res, 404, [{ error: 'Ruta no encontrada' }]));

// Manejador global de excepciones
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Excepción no controlada', { error: err.message, stack: err.stack, route: req.originalUrl });
  sendResponse(res, 500, [{ error: 'Error interno del servidor' }]);
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
          const info = q.run('INSERT INTO estudiantes (nombre, email) VALUES (?, ?)', nombre, email);
          socket.write(JSON.stringify({ statusCode: 200, data: [{ id: Number(info.lastInsertRowid), nombre, email }] }) + '\n');
        } else if (titulo && creditos) {
          const info = q.run('INSERT INTO cursos (titulo, creditos) VALUES (?, ?)', titulo, creditos);
          socket.write(JSON.stringify({ statusCode: 200, data: [{ id: Number(info.lastInsertRowid), titulo, creditos }] }) + '\n');
        } else {
          socket.write(JSON.stringify({ statusCode: 400, error: 'Estructura no válida para inserción' }) + '\n');
        }
      } else if (payload.get) {
        const query = payload.get;

        if (query.tabla === 'estudiantes' || query === 'estudiantes') {
          socket.write(JSON.stringify({ statusCode: 200, data: q.all('SELECT * FROM estudiantes') }) + '\n');
        } else if (query.tabla === 'cursos' || query === 'cursos') {
          socket.write(JSON.stringify({ statusCode: 200, data: q.all('SELECT * FROM cursos') }) + '\n');
        } else if (query.id_estudiante) {
          const row = q.get('SELECT * FROM estudiantes WHERE id = ?', query.id_estudiante);
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
    logger.info(`Servidor HTTP ejecutándose en puerto ${HTTP_PORT}`, { port: Number(HTTP_PORT) });
  });
  if (process.env.DISABLE_TCP !== 'true') {
    tcpServer.listen(TCP_PORT, () => {
      logger.info(`Servidor TCP Socket ejecutándose en puerto ${TCP_PORT}`, { port: TCP_PORT });
    });
  }

  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { error: err.message, stack: err.stack });
    setTimeout(() => process.exit(1), 1000);
  });
}

export { app, db };
