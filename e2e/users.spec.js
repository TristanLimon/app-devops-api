import { test, expect } from '@playwright/test';
import { login, unique } from './helpers.js';

test.describe('Frontend - CRUD Usuarios', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await login(page);
  });

  test('lista al administrador', async ({ page }) => {
    await expect(page.getByTestId('user-row').filter({ hasText: 'admin@uteq.mx' })).toBeVisible();
  });

  test('crea, edita y elimina un usuario', async ({ page }) => {
    const email = `${unique('e2e')}@uteq.mx`;

    // Crear
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-nombre').fill('Usuario E2E');
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-password').fill('clave123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('flash')).toHaveText('Usuario creado');
    const row = page.getByTestId('user-row').filter({ hasText: email });
    await expect(row).toContainText('Usuario E2E');

    // Editar
    await row.getByRole('button', { name: `Editar ${email}` }).click();
    await page.getByTestId('user-nombre').fill('Usuario Editado');
    await page.getByTestId('user-rol').selectOption('admin');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('flash')).toHaveText('Usuario actualizado');
    await expect(row).toContainText('Usuario Editado');
    await expect(row).toContainText('admin');

    // Eliminar
    await row.getByRole('button', { name: `Eliminar ${email}` }).click();
    await expect(page.getByTestId('flash')).toHaveText('Usuario eliminado');
    await expect(row).toHaveCount(0);
  });

  test('muestra error con email duplicado', async ({ page }) => {
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-nombre').fill('Duplicado');
    await page.getByTestId('user-email').fill('admin@uteq.mx');
    await page.getByTestId('user-password').fill('clave123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('user-error')).toHaveText('El email ya está registrado');
  });

  test('muestra error con contraseña corta', async ({ page }) => {
    await page.getByTestId('new-user').click();
    await page.getByTestId('user-nombre').fill('Corta');
    await page.getByTestId('user-email').fill(`${unique('corta')}@uteq.mx`);
    await page.getByTestId('user-password').fill('123');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId('user-error')).toContainText('al menos 6 caracteres');
  });
});
