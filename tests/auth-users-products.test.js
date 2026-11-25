import { describe, test, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../database.js';

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

describe('Backend - Login', () => {
  test('POST /api/auth/login - [ÉXITO] credenciales válidas devuelven token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].token).toBeTruthy();
    expect(res.body.data[0].user.email).toBe(ADMIN_EMAIL);
    expect(res.body.data[0].user.password_hash).toBeUndefined();
    token = res.body.data[0].token;
  });

  test('POST /api/auth/login - [FALLO] contraseña incorrecta', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'incorrecta' });
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/auth/login - [FALLO] campos vacíos', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/auth/me - [ÉXITO] devuelve el usuario autenticado', async () => {
    const res = await request(app).get('/api/auth/me').set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].rol).toBe('admin');
  });

  test('GET /api/users - [FALLO] sin token responde 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/products - [FALLO] token inválido responde 401', async () => {
    const res = await request(app).get('/api/products').set({ Authorization: 'Bearer abc.def.ghi' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Backend - CRUD Usuarios', () => {
  let userId;

  test('POST /api/users - [ÉXITO] crear usuario', async () => {
    const res = await request(app).post('/api/users').set(auth())
      .send({ nombre: 'Ana Pérez', email: 'ana@uteq.mx', password: 'secreta1', rol: 'usuario' });
    expect(res.statusCode).toBe(201);
    expect(res.body.data[0].email).toBe('ana@uteq.mx');
    userId = res.body.data[0].id;
  });

  test('POST /api/users - [FALLO] email duplicado responde 409', async () => {
    const res = await request(app).post('/api/users').set(auth())
      .send({ nombre: 'Otra Ana', email: 'ana@uteq.mx', password: 'secreta1' });
    expect(res.statusCode).toBe(409);
  });

  test('POST /api/users - [FALLO] email inválido', async () => {
    const res = await request(app).post('/api/users').set(auth())
      .send({ nombre: 'X', email: 'no-es-email', password: 'secreta1' });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/users - [FALLO] contraseña corta', async () => {
    const res = await request(app).post('/api/users').set(auth())
      .send({ nombre: 'X', email: 'x@uteq.mx', password: '123' });
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/users - [ÉXITO] listar usuarios sin exponer contraseñas', async () => {
    const res = await request(app).get('/api/users').set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    res.body.data.forEach((u) => expect(u.password_hash).toBeUndefined());
  });

  test('GET /api/users/:id - [ÉXITO] obtener usuario por id', async () => {
    const res = await request(app).get(`/api/users/${userId}`).set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].nombre).toBe('Ana Pérez');
  });

  test('GET /api/users/:id - [FALLO] id inexistente', async () => {
    const res = await request(app).get('/api/users/99999').set(auth());
    expect(res.statusCode).toBe(404);
  });

  test('PUT /api/users/:id - [ÉXITO] actualizar usuario', async () => {
    const res = await request(app).put(`/api/users/${userId}`).set(auth())
      .send({ nombre: 'Ana Actualizada', rol: 'admin' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].nombre).toBe('Ana Actualizada');
    expect(res.body.data[0].rol).toBe('admin');
  });

  test('PUT /api/users/:id - [ÉXITO] el usuario puede iniciar sesión con su nueva contraseña', async () => {
    await request(app).put(`/api/users/${userId}`).set(auth()).send({ password: 'nueva123' });
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@uteq.mx', password: 'nueva123' });
    expect(res.statusCode).toBe(200);
  });

  test('PUT /api/users/:id - [FALLO] rol inválido', async () => {
    const res = await request(app).put(`/api/users/${userId}`).set(auth()).send({ rol: 'superusuario' });
    expect(res.statusCode).toBe(400);
  });

  test('DELETE /api/users/:id - [FALLO] no se puede eliminar a sí mismo', async () => {
    const me = await request(app).get('/api/auth/me').set(auth());
    const res = await request(app).delete(`/api/users/${me.body.data[0].id}`).set(auth());
    expect(res.statusCode).toBe(400);
  });

  test('DELETE /api/users/:id - [ÉXITO] eliminar usuario', async () => {
    const res = await request(app).delete(`/api/users/${userId}`).set(auth());
    expect(res.statusCode).toBe(200);
    const check = await request(app).get(`/api/users/${userId}`).set(auth());
    expect(check.statusCode).toBe(404);
  });

  test('DELETE /api/users/:id - [FALLO] eliminar inexistente', async () => {
    const res = await request(app).delete('/api/users/99999').set(auth());
    expect(res.statusCode).toBe(404);
  });
});

describe('Backend - CRUD Productos', () => {
  let productId;

  test('POST /api/products - [ÉXITO] crear producto', async () => {
    const res = await request(app).post('/api/products').set(auth())
      .send({ nombre: 'Teclado mecánico', descripcion: 'Switches rojos', precio: 1299.5, stock: 10 });
    expect(res.statusCode).toBe(201);
    expect(res.body.data[0].precio).toBe(1299.5);
    productId = res.body.data[0].id;
  });

  test('POST /api/products - [FALLO] sin nombre', async () => {
    const res = await request(app).post('/api/products').set(auth()).send({ precio: 10 });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/products - [FALLO] precio negativo', async () => {
    const res = await request(app).post('/api/products').set(auth()).send({ nombre: 'X', precio: -5 });
    expect(res.statusCode).toBe(400);
  });

  test('POST /api/products - [FALLO] stock decimal', async () => {
    const res = await request(app).post('/api/products').set(auth()).send({ nombre: 'X', precio: 5, stock: 1.5 });
    expect(res.statusCode).toBe(400);
  });

  test('GET /api/products - [ÉXITO] listar productos', async () => {
    const res = await request(app).get('/api/products').set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body.data.some((p) => p.id === productId)).toBe(true);
  });

  test('GET /api/products/:id - [ÉXITO] obtener producto', async () => {
    const res = await request(app).get(`/api/products/${productId}`).set(auth());
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].nombre).toBe('Teclado mecánico');
  });

  test('GET /api/products/:id - [FALLO] inexistente', async () => {
    const res = await request(app).get('/api/products/99999').set(auth());
    expect(res.statusCode).toBe(404);
  });

  test('PUT /api/products/:id - [ÉXITO] actualizar precio y stock', async () => {
    const res = await request(app).put(`/api/products/${productId}`).set(auth()).send({ precio: 999, stock: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].precio).toBe(999);
    expect(res.body.data[0].stock).toBe(3);
    expect(res.body.data[0].nombre).toBe('Teclado mecánico');
  });

  test('PUT /api/products/:id - [FALLO] precio inválido', async () => {
    const res = await request(app).put(`/api/products/${productId}`).set(auth()).send({ precio: 'abc' });
    expect(res.statusCode).toBe(400);
  });

  test('PUT /api/products/:id - [FALLO] inexistente', async () => {
    const res = await request(app).put('/api/products/99999').set(auth()).send({ precio: 1 });
    expect(res.statusCode).toBe(404);
  });

  test('DELETE /api/products/:id - [ÉXITO] eliminar producto', async () => {
    const res = await request(app).delete(`/api/products/${productId}`).set(auth());
    expect(res.statusCode).toBe(200);
  });

  test('DELETE /api/products/:id - [FALLO] inexistente', async () => {
    const res = await request(app).delete(`/api/products/${productId}`).set(auth());
    expect(res.statusCode).toBe(404);
  });
});

describe('Backend - Salud y errores', () => {

  test('GET /api/health - [ÉXITO] responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].status).toBe('ok');
  });

  test('GET /api/no-existe - [FALLO] ruta desconocida responde 404', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.statusCode).toBe(404);
  });

  test('GET /api/debug/error - [FALLO] excepción controlada responde 500', async () => {
    const res = await request(app).get('/api/debug/error');
    expect(res.statusCode).toBe(500);
  });

  test('GET / - [ÉXITO] sirve la página de login', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('login-form');
  });
});
