**Feat: freestyle-backup**

**Propósito**: Implementar y validar una estrategia de backup para las funciones freestyle y/o datos temporales relacionados con la generación de proyectos.

**Descripción corta**
- Trabajos relacionados con: snapshot, export/import, y persistencia temporal de tareas generadas por `freestyle`.

**Alcance (qué entra / qué no entra)**
- Incluye: scripts de export/import, comandos de snapshot, tests E2E básicos que validen flujo de backup/restore.
- Excluye: migraciones masivas de producción o cambios en la infraestructura de backup externa (estos serán tratados en otra rama/issue).

**Criterios de éxito / Objetivos**
1. Script `scripts/backup-freestyle.sh` (o función equivalente) exporta los artefactos generados por `freestyle` y puede restaurarlos localmente.
2. Se añaden tests que cubren el flujo: generar -> exportar -> limpiar -> restaurar -> verificar contenido.
3. Documentación mínima en `docs/` que explique cómo ejecutar backup/restore localmente y en CI.
4. CI pasa para la rama (build + E2E relevantes) antes de pedir merge.

**Tareas iniciales**
- [ ] Crear script de export (`scripts/backup-freestyle.sh`).
- [ ] Crear script de restore (`scripts/restore-freestyle.sh`).
- [ ] Añadir test E2E de backup/restore bajo `test/e2e/specs/backup.spec.ts`.
- [ ] Documentar pasos y variables de entorno en `docs/backup.md`.
- [ ] Revisar permisos y ubicaciones de almacenamiento (temporal vs persistente).

**Notas / Riesgos**
- Evitar exponer datos sensibles en backups; encripta o omite secretos.
- Si el backup usa servicios externos (S3, Cloudflare), documentar credenciales y permisos.

**Cómo revisar/validar**
- Ejecutar localmente:
  - `npm run build`
  - `npm run preview -- --port 5173 --strictPort`
  - `scripts/backup-freestyle.sh ./tmp/backup.tar.gz`
  - limpiar estado (delete generated files)
  - `scripts/restore-freestyle.sh ./tmp/backup.tar.gz`
  - correr tests: `npm run test:e2e` o el spec específico.

**Checklist de merge**
- [ ] Código revisado y aprobado.
- [ ] CI (build + E2E) en verde.
- [ ] Documentación actualizada.
