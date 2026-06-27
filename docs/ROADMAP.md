# Mizpa Roadmap

Este documento describe los próximos pasos para el desarrollo de Mizpa, manteniendo el enfoque en el objetivo actual del producto y la estabilidad de la rama `main` mediante CI y tests.

## Visión del proyecto

Mizpa es un agente de IA que:
- audita sitios web para SEO y geolocalización,
- genera réplicas modernas en React + Tailwind,
- despliega código a Cloudflare Pages de forma controlada.

El objetivo inmediato es construir una herramienta que permita a freelancers, equipos de desarrollo y emprendedores modernizar sitios web existentes con un flujo reproducible y con las garantías de calidad que brinda un pipeline de pruebas.

## Estado actual

Basado en el repositorio actual:
- Frontend en Vite + React 19 + TypeScript + Tailwind
- Backend en Supabase (Auth, Postgres, Edge Functions)
- E2E con Puppeteer
- CI en GitHub Actions con una rama `main` protegida
- Auto-merge configurado para PRs `main` con etiqueta `automerge`
- Deploy controlado a Cloudflare Pages desde `release/**`

## Principales áreas de trabajo

### 1. Estabilidad del flujo CI

Prioridad:
- `main` debe ser siempre estable.
- Los cambios ingresan mediante PRs.
- Todos los PRs deben pasar el workflow `CI` antes de merge.
- El `automerge` solo se aplica a PRs hacia `main` con etiqueta `automerge`.

Próximos pasos:
- mantener y ampliar los tests E2E para cubrir rutas clave.
- garantizar que el preview server arranque correctamente en CI.
- documentar y validar el flujo de `CI` + `Auto-merge`.

### 2. Cobertura de pruebas y calidad

Prioridad:
- continuar agregando tests que cubran el funcionamiento real de la app.
- usar el pipeline para validar la experiencia usuario y la integración con Supabase.

Próximos pasos:
- crear o mejorar tests para los flujos de autenticación.
- agregar tests para la lógica de creación de tareas y navegación de la app.
- asegurar que el `README` y la documentación de desarrollo incluyan cómo ejecutar pruebas locales.

### 3. Desarrollo de producto

Prioridad:
- consolidar las tres habilidades centrales: `audit`, `generate` y `replica`.
- evitar que el desarrollo se desvíe de la propuesta de valor: modernizar sitios web existentes.

Próximos pasos:
- estabilizar la experiencia del auditor SEO/GEO.
- asegurar que la generación de réplicas React+Tailwind produzca código legible y utilizable.
- validar el deploy controlado a Cloudflare Pages desde ramas `release/*`.

### 4. Procesos y gobernanza

Prioridad:
- tener reglas claras de rama y PR.
- documentar los criterios para `main`, `develop`, `release/*` y `hotfix/*`.

Próximos pasos:
- mantener `CONTRIBUTING.md` actualizado con el proceso de auto-merge.
- usar `BRANCH_STRATEGY.md` como referencia para colaboradores.
- reforzar que `main` solo se actualiza con PRs aprobados y CI exitoso.

## Roadmap táctico

### Corto plazo (1-2 sprints)

- fijar el pipeline `CI` y confirmar su estabilidad.
- cubrir los flujos críticos con E2E: login, dashboard, playground, task.
- validar el auto-merge en PRs hacia `main`.
- publicar `docs/ROADMAP.md` y mantener `CONTRIBUTING.md` coherente.

### Mediano plazo (3-5 sprints)

- mejorar la cobertura de tests y mantener un entorno reproducible.
- refinar el agente `audit` para ofrecer resultados más útiles.
- automatizar despliegues controlados desde `release/**`.
- garantizar que cualquier ajuste en CI sea pequeño y seguro.

### Largo plazo

- extender la generación de réplicas a más tipos de sitios.
- integrar mejores capacidades de análisis de diseño y contenido.
- convertir a Mizpa en una herramienta confiable para migraciones de sitios existentes.

## Cómo usar este roadmap

- Cualquier cambio mayor debe ser planificado en una rama feature y revisado.
- Los issues y PRs deben mapearse a los objetivos de corto o mediano plazo.
- El objetivo principal es que cada avance pase por CI y que `main` permanezca estable.

---

> Nota: este roadmap está alineado con el estado actual descrito en `README.md`, `CONTRIBUTING.md` y los workflows de GitHub Actions presentes en el repositorio.
