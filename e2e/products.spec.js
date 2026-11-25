import { test, expect } from '@playwright/test';
import { login, unique } from './helpers.js';

test.describe('Frontend - CRUD Productos', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await login(page);
    await page.getByTestId('tab-products').click();
    await expect(page.getByTestId('products-section')).toBeVisible();
  });

  test('crea, edita y elimina un producto', async ({ page }) => {
    const nombre = unique('Producto');

    // Crear
    await page.getByTestId('new-product').click();
    await page.getByTestId('product-nombre').fill(nombre);
    await page.getByTestId('product-descripcion').fill('Creado por Playwright');
    await page.getByTestId('product-precio').fill('149.90');
    await page.getByTestId('product-stock').fill('7');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('flash')).toHaveText('Producto creado');
    const row = page.getByTestId('product-row').filter({ hasText: nombre });
    await expect(row).toContainText('149.90');
    await expect(row).toContainText('7');

    // Editar
    await row.getByRole('button', { name: `Editar ${nombre}` }).click();
    await page.getByTestId('product-precio').fill('99.50');
    await page.getByTestId('product-stock').fill('20');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('flash')).toHaveText('Producto actualizado');
    await expect(row).toContainText('99.50');
    await expect(row).toContainText('20');

    // Eliminar
    await row.getByRole('button', { name: `Eliminar ${nombre}` }).click();
    await expect(page.getByTestId('flash')).toHaveText('Producto eliminado');
    await expect(row).toHaveCount(0);
  });

  test('valida que el nombre sea obligatorio', async ({ page }) => {
    await page.getByTestId('new-product').click();
    await page.getByTestId('product-precio').fill('10');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('product-error')).toHaveText('El nombre es requerido');
  });

  test('valida precio negativo', async ({ page }) => {
    await page.getByTestId('new-product').click();
    await page.getByTestId('product-nombre').fill('Precio malo');
    await page.getByTestId('product-precio').fill('-5');
    await page.getByTestId('product-save').click();
    await expect(page.getByTestId('product-error')).toHaveText('Precio inválido');
  });

  test('cancelar no guarda cambios', async ({ page }) => {
    const before = await page.getByTestId('product-row').count();
    await page.getByTestId('new-product').click();
    await page.getByTestId('product-nombre').fill('No se guarda');
    await page.getByRole('button', { name: 'Cancelar' }).last().click();
    await expect(page.getByTestId('product-dialog')).not.toBeVisible();
    await expect(page.getByTestId('product-row')).toHaveCount(before);
  });
});

test.describe('Backend vía Playwright (API)', () => {
  test('health check responde ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect((await res.json()).data[0].status).toBe('ok');
  });

  test('los endpoints protegidos exigen token', async ({ request }) => {
    expect((await request.get('/api/users')).status()).toBe(401);
    expect((await request.get('/api/products')).status()).toBe(401);
  });

  test('flujo API: login y CRUD de producto', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { email: process.env.ADMIN_EMAIL || 'admin@uteq.mx', password: process.env.ADMIN_PASSWORD || 'Admin123!' },
    });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).data[0].token}` };

    const created = await request.post('/api/products', { headers, data: { nombre: 'API PW', precio: 5, stock: 1 } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data[0].id;

    const updated = await request.put(`/api/products/${id}`, { headers, data: { stock: 9 } });
    expect((await updated.json()).data[0].stock).toBe(9);

    expect((await request.delete(`/api/products/${id}`, { headers })).status()).toBe(200);
    expect((await request.get(`/api/products/${id}`, { headers })).status()).toBe(404);
  });

  test('el listado de estudiantes devuelve los registros', async ({ request }) => {
    const created = await request.post('/api/estudiantes', { data: { nombre: 'PW', email: `${unique('pw')}@uteq.mx` } });
    expect(created.status()).toBe(200);
    const list = await request.get('/api/estudiantes');
    expect((await list.json()).data.length).toBeGreaterThan(0);
  });
});
