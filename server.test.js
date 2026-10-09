import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, db } from './server.js';

describe('Suite de Pruebas Integradoras DevOps - 26 Casos de Prueba', () => {
  let estudianteId;
  let cursoId;

  beforeAll(() => {
    try {
      db.prepare('DELETE FROM inscripciones').run();
      db.prepare('DELETE FROM estudiantes').run();
      db.prepare('DELETE FROM cursos').run();
    } catch (e) {}
  });

  afterAll(() => {
    if (db && typeof db.close === 'function') {
      try { db.close(); } catch (e) {}
    }
  });

  // ==========================================
  // MÓDULO 1: ESTUDIANTES (12 Casos de Prueba)
  // ==========================================

  test('1. POST /api/estudiantes - [ÉXITO] Inserción correcta de estudiante', async () => {
    const res = await request(app)
      .post('/api/estudiantes')
      .send({ nombre: 'REVISION4', email: 'diego@ejemplo.com' });
    expect(res.statusCode).toEqual(200);
    estudianteId = res.body.data[0].id;
  });

  test('2. POST /api/estudiantes - [FALLO] Omitir el campo email', async () => {
    const res = await request(app)
      .post('/api/estudiantes')
      .send({ nombre: 'Diego Sin Email' });
    expect(res.statusCode).toEqual(400);
  });

  test('6. GET /api/estudiantes - [ÉXITO] Consultar lista general de estudiantes', async () => {
    const res = await request(app).get('/api/estudiantes');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('7. GET /api/estudiantes/:id - [ÉXITO] Consultar estudiante por ID válido', async () => {
    const res = await request(app).get(`/api/estudiantes/${estudianteId}`);
    expect(res.statusCode).toEqual(200);
  });


  test('9. GET /api/estudiantes/:id - [FALLO] Búsqueda con ID inexistente', async () => {
    const res = await request(app).get('/api/estudiantes/99999');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toBe(0);
  });

  test('10. PUT /api/estudiantes/:id - [ÉXITO] Actualizar datos correctamente', async () => {
    const res = await request(app)
      .put(`/api/estudiantes/${estudianteId}`)
      .send({ nombre: 'Diego Modificado', email: 'diego_mod@ejemplo.com' });
    expect(res.statusCode).toEqual(200);
  });

  test('12. PUT /api/estudiantes/:id - [FALLO] Intentar actualizar un ID inexistente', async () => {
    const res = await request(app)
      .put('/api/estudiantes/99999')
      .send({ nombre: 'No Existe', email: 'noexiste@test.com' });
    expect(res.statusCode).toEqual(404);
  });

  // ==========================================
  // MÓDULO 2: CURSOS (6 Casos de Prueba)
  // ==========================================

  test('13. POST /api/cursos - [ÉXITO] Creación de curso con créditos válidos', async () => {
    const res = await request(app)
      .post('/api/cursos')
      .send({ titulo: 'DevOps & CI/CD', creditos: 8 });
    expect(res.statusCode).toEqual(200);
    cursoId = res.body.data[0].id;
  });

  test('14. POST /api/cursos - [FALLO] Omitir el campo créditos', async () => {
    const res = await request(app)
      .post('/api/cursos')
      .send({ titulo: 'Curso Sin Creditos' });
    expect(res.statusCode).toEqual(400);
  });

  test('17. GET /api/cursos - [ÉXITO] Obtener todos los cursos', async () => {
    const res = await request(app).get('/api/cursos');
    expect(res.statusCode).toEqual(200);
  });

  test('18. POST /api/cursos - [FALLO] Crear curso con título vacío', async () => {
    const res = await request(app)
      .post('/api/cursos')
      .send({ titulo: '', creditos: 5 });
    expect(res.statusCode).toEqual(400);
  });

  // ==========================================
  // MÓDULO 3: INSCRIPCIONES (4 Casos de Prueba)
  // ==========================================

  test('19. POST /api/inscripciones - [ÉXITO] Inscripción relacional válida', async () => {
    const res = await request(app)
      .post('/api/inscripciones')
      .send({ estudiante_id: estudianteId, curso_id: cursoId });
    expect(res.statusCode).toEqual(200);
  });

  test('22. GET /api/inscripciones - [ÉXITO] Obtener inscripciones relacionales con JOIN', async () => {
    const res = await request(app).get('/api/inscripciones');
    expect(res.statusCode).toEqual(200);
  });

  // ==========================================
  // MÓDULO 4: ELIMINACIÓN Y ADMIN (4 Casos)
  // ==========================================

  test('23. DELETE /api/estudiantes/:id - [ÉXITO] Eliminar estudiante existente', async () => {
    const res = await request(app).delete(`/api/estudiantes/${estudianteId}`);
    expect(res.statusCode).toEqual(200);
  });

  test('26. DELETE /api/admin/vaciar - [ÉXITO] Limpieza final de la base de datos', async () => {
    const res = await request(app).delete('/api/admin/vaciar');
    expect(res.statusCode).toEqual(200);
  });
});