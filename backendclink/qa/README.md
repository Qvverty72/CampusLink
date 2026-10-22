# Seeder general de QA

Datos ficticios para probar las funcionalidades **existentes**, en las conexiones
Supabase/PostgreSQL, Auth, Storage y MongoDB configuradas en `backendclink/.env`.
No instala infraestructura, ejecuta migraciones ni modifica reglas del producto.
Usar Node 22.13–22.x, igual que el backend, desde `backendclink`:

```powershell
npm.cmd run build
node --test qa/tests/fixtures.test.mjs
node qa/seed.mjs check
node qa/seed.mjs seed
node qa/seed.mjs verify
node qa/seed.mjs verify --running-backend
```

`check` comprueba conexiones, catálogo técnico, mapa e imágenes/PDF privados.
`verify --running-backend` usa el backend habitual en localhost:3000 en lugar de
levantar la API temporal. Sus variables deben apuntar a las mismas bases.
`seed` crea o continúa el mismo conjunto; una segunda ejecución conserva los IDs,
las contraseñas, las fechas y las acciones realizadas durante QA. No ejecutar dos
copias simultáneas: se usa un bloqueo de sesión PostgreSQL. El manifiesto comprueba
el destino antes de continuar. No moverlo entre ambientes.

La carga confirma cuentas mediante Auth administrativo, sin enviar correos. Abre
una API temporal en localhost para publicar, solicitar, aceptar, confirmar,
cancelar, valorar, retirar, denunciar y cambiar estados de cuenta con las
validaciones actuales. Catálogo/perfiles/asignaciones iniciales y mapas propios
son bootstrap directo. Ocultamiento y antigüedad son fixtures controladas por ID;
no representan una nueva API de moderación ni de cambio de fecha.

El mapa real se copia con sus edificios, meshes y transformaciones. Los POI de QA
solo existen en las copias. Las instituciones y sus tres sedes de prueba aíslan los
avisos de eventos de los usuarios reales. Roles, permisos, categorías y mensajes
técnicos globales se reutilizan. El catálogo académico QA contiene dos carreras,
cuatro asignaturas y cinco relaciones; es ficticio y no altera el catálogo Duoc.

## Organización

Todo el seeder está reunido en `backendclink/qa/`:

```text
qa/
  README.md
  seed.mjs
  fixtures.mjs
  tests/
    fixtures.test.mjs
  local/                 # Generado; excluido de Git y Docker
    credentials.md
    manifest.json
    inventory.md
    report.json
    files/
```

Los archivos operativos se escriben en `qa/local/`:

Si necesitas guardar la salida de pruebas, usa `qa/local/logs/`, también ignorado.
Los logs son temporales; evita dejarlos en la raíz del backend o frontend.

- `credentials.md`: cuentas, contraseñas aleatorias y sede. No compartir públicamente.
- `manifest.json`: IDs exactos, fecha base, pasos, destino y credenciales necesarias
  para reanudar. Conservar mientras existan los datos.
- `inventory.md`: IDs y escenario de cada publicación/actividad.
- `report.json`: última verificación, fecha y límites conocidos.
- `files/`: PDF de dos páginas, otro PDF distinto, copia renombrada idéntica,
  imagen PNG y texto inválido para probar los rechazos de subida.

El seeder no guarda tokens de sesión ni URLs firmadas. El backend entrega URLs de
imágenes por 60 segundos; los objetos originales continúan disponibles conforme a
los permisos vigentes.

## Matriz mínima para QA manual

Entrar con las cuentas del archivo local. Todos los títulos llevan el runId `QA-…`.

| Prueba | Actor y preparación | Resultado esperado |
|---|---|---|
| Perfil/campus/carrera | `receptor`, `nuevo`, `otra-sede` | Opciones de su institución; oferta compatible con sede; perfiles separados |
| Sesión/formulario | `publicador`, llenar sin publicar y cambiar pestaña/app | Actualización de sesión conserva campos/paso según fix de auth; validar en web y móvil |
| Mapa y ubicación | Usuarios activos de cada sede | Mapa válido propio; ubicaciones de su sede; POI inactivo excluido |
| Paginación/filtros físicos | `receptor`, Mercado, páginas1/2, condición/categoría/modalidad | Más de20 recursos elegibles; páginas distintas y filtros coherentes |
| Galería | physical-05 | Tres imágenes; cuarta rechazada; URL se renueva al consultar |
| Aislamiento físico | `receptor`, comparar physical-27/28 | Otra sede/institución no aparece ni se puede consultar |
| Reserva/coordinación | physical-22, `publicador` y `receptor` | Reservado, una confirmación y punto de encuentro; falta segunda confirmación |
| Finalización/valoración | physical-23 | Dos confirmaciones, finalizado y valoración4 inmutable |
| Cancelación | physical-24 | Acuerdo cancelado; publicación disponible otra vez |
| Antigüedad | physical-19/20, `publicador` | En T0:19 no cumple168h;20 sí. Worker genera un recordatorio único, sin cierre automático |
| PDFs | digital-05, carpeta files | Dos PDFs distintos; renombrar un PDF idéntico no permite duplicarlo en esa publicación; texto no se admite como PDF |
| Biblioteca/paginación | `receptor` | Más de20 digitales elegibles; digital-25 visible por misma institución;26 inaccesible |
| Recomendaciones | `receptor` vs `nuevo` | Cambian por carrera/asignaturas; digital-01 tiene asociación completa,02 carrera,03 Diseño,04 compartida,12 señal de vista |
| Derechos separados | digital-06, `receptor` y `eventos` | Ambos adquirieron; publicación sigue disponible para otras personas |
| Sin derecho prematuro | digital-07/08/09/10 | Pendiente/una confirmación/cancelado/rechazado no permiten descargar original |
| Términos históricos | digital-11, `receptor` | Precio adquirido2600 conservado; publicación ahora donación |
| Retención de adquisición | digital-24, `receptor` | Descarga adquirida funciona tras retiro y desactivación del propietario |
| Actividades | `publicador` y `receptor` | Una comunitaria activa por creador ordinario; oficiales aparte; creador inscrito |
| Participación | oficial-futura, `receptor` y `nuevo` | Receptor inscrito; nuevo se retiró; contador e historial coherentes |
| Ciclo de actividad | finalizada/oculta/retirada/poi-inactivo | No aparecen como actividad pública vigente; historial se conserva |
| Serie | serie-1/2/3 | Tres ocurrencias semanales America/Santiago, con identidad propia |
| Permisos | `eventos` vs `consulta` vs usuario ordinario | Solo eventos tiene PUBLICAR_EVENTO; consulta tiene analítica/reportería; rol autorizado solo no concede publicar |
| Cuenta bloqueada | `suspendido`, `desactivado` | Backend rechaza funcionalidades; no saltar controles desde UI |
| Denuncias/auditoría | `receptor`, luego `admin` | Denuncias pendientes con evidencia; auditoría de acciones reales, sin resoluciones fabricadas |
| Avisos | Cuentas de sede principal | Avisos solo para actores QA habilitados del alcance correspondiente; marcar leído desde UI |

La matrícula de asignaturas no trae semestres reales: el catálogo ficticio QA usa
nivel1 únicamente como fixture técnico, sin afirmar mallas oficiales.

## Fechas y expiración

Una fecha base T0 persistida. Recursos físicos/digitales no tienen caducidad por
antigüedad. Las actividades futuras tienen margen7–21 días; las que están en curso
terminan tres días después de T0. Series usan zona civil America/Santiago y fechas
UTC persistidas. Al terminar una actividad, deja de ser visible de inmediato; el
worker concilia FINISHED sin borrar historia. Después de ese margen refrescar el
conjunto explícitamente, no cambiar fechas históricas en sitio.

Para observar una transición corta independiente:

```powershell
node qa/seed.mjs temporal
```

Crea una oficial que inicia en dos minutos y termina tres minutos después. Anota
el ID mostrado; consultar antes/durante/después. Los workers deben estar corriendo
en el backend habitual para verificar avisos y mantenimiento. El seeder no ejecuta
workers globales que puedan actuar sobre contenido real.

## Retirar o refrescar el conjunto

```powershell
node qa/seed.mjs clean --dry-run
node qa/seed.mjs clean
node qa/seed.mjs seed
```

`clean` opera solo sobre IDs del manifiesto, después de comprobar actores,
referencias y rutas canónicas. No borra por título/prefijo ni toca el catálogo
Duoc, mapa fuente o catálogos técnicos. Si QA agregó publicaciones/archivos,
usuarios externos o referencias fuera del manifiesto, detiene la limpieza para
revisión; no los incorpora automáticamente al alcance de borrado. Mongo, SQL,
Storage y Auth no forman una transacción distribuida: conserva los checkpoints y
reanuda `clean` si falla una dependencia. No volver a `seed` con limpieza parcial.
Revisar el respaldo/manifest antes de retirar los datos que el equipo está usando.

## Límites

Esto prepara y verifica datos, no certifica todas las fases. Analítica actualmente
solo tiene health y no existe resolución general de denuncias; no se inventan
tableros o reportes. OTP/correos/recuperación requieren buzón de prueba controlado.
Concurrencia, accesibilidad, red inestable y móvil requieren pruebas específicas.
La expectativa de permisos automáticos de administrador tiene contradicción de
backlog F2.9-06/F2.3-05; se conserva la matriz implementada y ese criterio no se
marca aprobado por el seeder.
