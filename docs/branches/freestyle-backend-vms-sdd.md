# SDD: freestyle-backend-vms

## 1. Propósito

Este documento describe el diseño de la mejora para la gestión de recursos de VMs en la arquitectura `freestyle` de Mizpa. El objetivo es reducir el uso excesivo de VMs activas, mantener aislamiento de datos entre usuarios y habilitar una cola/gestión de capacidad con snapshot provisioning.

Objetivo de la rama `freestyle-backend-vms`: explorar y validar optimizaciones de la gestión de recursos de VMs `Freestyle`, con un enfoque en limitar la concurrencia, encolar tareas cuando no hay capacidad disponible y asegurar que `main` permanezca estable y operativo.

## 2. Alcance

Incluye:
- Control de creación de VMs para tareas `replica` y `generate`.
- Registro y seguimiento de sesiones de VM en `vm_sessions`.
- Cola de tareas (`queued`) cuando el límite de VMs concurrentes se alcanza.
- Hook de prueba/observabilidad para E2E que permita validar ciclos de vida de VMs.
- Política de suspensión/borrado de VMs inactivas.

No incluye:
- Cambios en la infraestructura de snapshot-building fuera del actual `freestyle` API.
- Integración con sistemas de billing externo.
- Migración completa de datos históricos.

## 3. Contexto y motivación

Actualmente, la función `create-task` crea un VM `freestyle` inmediatamente para `replica` y `generate` cuando existe `FREESTYLE_SNAPSHOT_ID`. Esto puede resultar en muchas VMs activas si múltiples tareas se crean con un solo usuario o en ráfaga. El plan es:

- Limitar la concurrencia con `MAX_FREESTYLE_VMS`.
- Manejar tareas excedentes con un estado `queued`.
- Arrancar nuevos VMs solo cuando hay capacidad libre.
- Eliminar o suspender VMs activas cuando se completan o quedan inactivas.

## 4. Requisitos

### 4.1 Funcionales
- RF1: Limitar VMs activas a un número configurable.
- RF2: Mantener `tasks` y `vm_sessions` coherentes con el ciclo de vida del VM.
- RF3: Soportar cola de tareas y ejecutar el siguiente al liberarse capacidad.
- RF4: Proveer un endpoint de pruebas seguro para inspeccionar VMs y tareas.
- RF5: Garantizar aislamiento de datos entre usuarios en el backend y en los VMs.

### 4.2 No funcionales
- RNF1: El sistema debe evitar más de `MAX_FREESTYLE_VMS` VMs en ejecución.
- RNF2: El test hook debe ser deshabilitable con una variable de ambiente.
- RNF3: La solución debe ser compatible con el actual esquema de Supabase.
- RNF4: La gestión debe ser robusta frente a reintentos y fallos de creación de VM.

## 5. Arquitectura propuesta

### 5.1 Componentes principales

- `create-task` (Supabase Edge Function)
  - Manifiesta tareas.
  - Decide si lanza VM inmediata o encola.
  - Crea registro en `tasks` y `vm_sessions`.

- `vm-test-hook` (Supabase Edge Function)
  - Endpoint test-only protegido.
  - Devuelve estados de VMs y tareas.
  - Permite forzar `stop/delete` de VMs.
  - Permite inspeccionar la cola.

- `freestyle` client (`supabase/functions/create-task/freestyle.ts`)
  - Envía peticiones a la API de Freestyle.
  - Crea, lista y borra VMs.

- `task-callback` (Supabase Edge Function)
  - Marca tareas como `completed` o `failed`.
  - Limpia `vm_sessions` activas.

- `E2E helpers` (`test/e2e/helpers/vm.ts`)
  - Consume el hook de pruebas.
  - Facilita aserciones sobre el estado de VMs.

### 5.2 Diagrama lógico

1. El usuario crea una tarea.
2. `create-task` inserta un registro en `tasks`.
3. Si la capacidad lo permite, `create-task` crea VM y actualiza `tasks.status = running` y `vm_sessions.status = running`.
4. Si no hay capacidad, `create-task` deja `tasks.status = queued`.
5. Cuando un VM termina o se elimina, el sistema procesa la cola y arranca el siguiente VM en espera.
6. `task-callback` actualiza el resultado y marca sesión como `deleted`.
7. `vm-test-hook` proporciona observabilidad para E2E.

## 6. Modelado de datos

### 6.1 `tasks`

- `id`
- `user_id`
- `skill`
- `url`
- `status` (`pending`, `queued`, `running`, `completed`, `failed`)
- `vm_id`
- `vm_token`
- `error_message`
- `created_at`, `updated_at`, `completed_at`

### 6.2 `vm_sessions`

- `id`
- `task_id`
- `vm_id`
- `status` (`creating`, `running`, `stopping`, `stopped`, `deleted`)
- `spec` (jsonb)
- `created_at`
- `deleted_at`

### 6.3 Variables de entorno

- `FREESTYLE_API_KEY`
- `FREESTYLE_SNAPSHOT_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAX_FREESTYLE_VMS` (por ejemplo `3`)
- `ENABLE_TEST_HOOKS` (`true|false`)
- `TEST_HOOK_SECRET`

## 7. Flujos clave

### 7.1 Creación de tarea con capacidad disponible

1. `create-task` crea `task` con `pending`.
2. Cuenta VMs `running` en `vm_sessions`.
3. Si count < `MAX_FREESTYLE_VMS`:
   - crea VM con `createVm(...)`
   - actualiza `tasks.vm_id` y `tasks.status = running`
   - inserta `vm_sessions` con `status = running`

### 7.2 Creación de tarea cuando no hay capacidad

1. `create-task` crea `task` con `pending`.
2. Cuenta VMs `running`.
3. Si count >= `MAX_FREESTYLE_VMS`:
   - actualiza `tasks.status = queued`
   - inserta `vm_sessions` con `status = creating` o leave blank
   - devuelve respuesta `queued`

### 7.3 Procesamiento de cola después de liberar capacidad

1. `task-callback` marca VM/`vm_sessions` como `deleted`.
2. Llama a un worker/cron `process-queue` o función interna.
3. Selecciona la tarea más vieja en `queued`.
4. Crea VM y actualiza esa tarea a `running`.

### 7.4 Finalización de VM e inactividad

- El callback de la tarea marca `tasks.status = completed/failed`.
- `vm_sessions.status = deleted` y `deleted_at = now()`.
- Si un VM queda inactivo, el hook o la API puede forzar `stop/delete`.

## 8. API del hook de pruebas

### 8.1 Autenticación

- `x-test-secret: <TEST_HOOK_SECRET>` obligatorio.
- Solo funciona si `ENABLE_TEST_HOOKS=true`.

### 8.2 Endpoints

- `GET /v1/vms`
  - Lista VMs activas con `vm_sessions` y `taskId`.

- `GET /v1/vms/task/:taskId`
  - Devuelve el VM asociado a la tarea y su estado.

- `GET /v1/vms/:vmId/metrics`
  - Devuelve métricas de uso o estado simulado para pruebas de optimización.

- `POST /v1/vms/:vmId/stop`
  - Fuerza el cierre del VM y actualiza la sesión.

- `GET /v1/queue/status`
  - Devuelve cantidad de VMs activas, tareas `queued` y capacidad restante.

## 9. Estrategia de pruebas

### 9.1 Test E2E

- Validar que `create-task` crea VM cuando hay capacidad.
- Validar que `create-task` deja `queued` cuando no hay capacidad.
- Validar que una tarea en `queued` pasa a `running` cuando se libera un VM.
- Validar la eliminación de VMs y el borrado en `vm_sessions`.
- Validar aislamiento de VMs entre usuarios.

### 9.2 Test Hook

- El helper `test/e2e/helpers/vm.ts` debe consumir el hook.
- El test `vm-management.spec.ts` debe usar `waitForVMState()` y `getActiveVMs()`.
- Simular la creación de tareas concurrentes para validar límite.

## 10. Seguridad y aislamiento

- Los VMs deben crearse por tarea y asociarse a `task.user_id`.
- Nunca exponer datos de otro usuario a través del hook.
- El hook debe ser deshabilitado en producción si no se necesita.
- El callback debe validar `TASK_WEBHOOK_SECRET` en producción.

## 11. Notas de implementación

- Reusar `supabase/functions/create-task/freestyle.ts` para `listVms` y `deleteVm`.
- Añadir `getActiveFreestyleVmCount()` a `create-task`.
- Implementar la cola en el propio `create-task` o en una función auxiliar `process-queue`.
- `vm_sessions.spec` guardará `spec` con la configuración usada (`vcpu`, `mem`, `idleTimeoutSeconds`).

## 12. Próximos pasos

1. Implementar `vm-test-hook` en Supabase con endpoints descritos.
2. Ajustar `create-task` para respetar `MAX_FREESTYLE_VMS` y `queued`.
3. Añadir `process-queue` para empezar tareas encoladas.
4. Desarrollar los tests E2E exactos en `test/e2e/specs/vm-management.spec.ts`.
5. Validar en CI con `ENABLE_TEST_HOOKS=true`.

***

Este documento sigue un esquema de SDD para orientar la implementación y las pruebas de optimización de recursos en `freestyle-backend-vms`.
