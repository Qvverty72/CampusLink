# F2.3-03 — Inicio, cierre y recuperación de sesión

Issue [GH-59](https://github.com/Qvverty72/CampusLink/issues/59), Must Have, 5 SP.
Express coordina credenciales y recuperación. Expo conserva la sesión con el SDK ya instalado y obtiene el perfil/roles/permisos vigentes en `GET /api/v1/auth/me`.
No se crean tablas, colecciones, columnas, metadatos Auth, migraciones ni dependencias. Login y recuperación usan clientes públicos efímeros; ninguna clave administrativa interviene.

## Contratos HTTP

Todas las respuestas Auth llevan `Cache-Control: no-store` y usan el envelope `data` o `error` existente.

| Ruta | Acceso y entrada | Respuesta |
| --- | --- | --- |
| `POST /api/v1/auth/login` | Pública; `{email,password}`. Correo normalizado, sin restricción de dominio para administradores. No admite roles, permisos ni UUID. | 200 `{data:{session:{access_token,refresh_token}}}` tras validar credenciales y correo confirmado. 400 formato, 401 credenciales/confirmación, 429 con `Retry-After: 60`, 503 proveedor. |
| `GET /api/v1/auth/me` | Bearer validado con Auth; perfil activo y asignaciones no revocadas leídos bajo RLS en cada solicitud. | Contrato anterior más `capabilities:{general,officialActivities,analytics,reports}`. 401 sesión inválida, 403 cuenta/perfil bloqueados, 503 dependencia. |
| `POST /api/v1/auth/recover` | Pública; `{email}` exclusivamente. | 202 `{data:{status:"recovery_requested"}}` para cualquier resultado del proveedor; 400 formato. No garantiza entrega. |
| `POST /api/v1/auth/recover/confirm` | Pública; `{email,code,password}` exclusivamente. Código numérico de 6–10 caracteres. Auth verifica OTP de tipo `recovery`, correo correspondiente y establece sesión efímera antes de cambiar contraseña. | 200 `{data:{status:"password_updated"}}`; 400 formato/código inválido/vencido/contraseña rechazada, 429 con `Retry-After: 60`, 503 dependencia. Nunca devuelve tokens o contraseña anterior. |

El SDK instala la sesión de login mediante `setSession`; después AuthProvider consulta `/me`. Una sesión Auth sin perfil válido no habilita módulos. El usuario puede reintentar la consulta o completar un registro institucional pendiente usando el flujo GH-58 existente. No se crean perfiles durante login o recuperación ni se reactiva una cuenta suspendida.

## Matriz de acceso aprobada

El usuario resolvió el 2026-10-08 la contradicción F2.2-10/F2.3-05: el administrador tiene todas las funciones, incluidas las generales. Los permisos del usuario autorizado son independientes: las ocho combinaciones se representan por tres asignaciones, sin ocho roles nuevos. La decisión y su procedencia quedan en el contexto GH-59; falta sincronizar el texto de esas entradas del backlog.

Los nombres técnicos esperados en las tablas existentes son:

| Concepto | Nombre |
| --- | --- |
| Administrador | `rol.nombre = ADMINISTRADOR` |
| Usuario autorizado | `rol.nombre = USUARIO_AUTORIZADO` |
| Crear actividades oficiales | `permiso.nombre = PUBLICAR_EVENTO` |
| Acceder a Analítica | `permiso.nombre = ACCEDER_ANALITICA` |
| Acceder a Reportería | `permiso.nombre = ACCEDER_REPORTERIA` |

Una cuenta activa con correo Auth confirmado y `perfil_usuario.verificado_en` dispone de funciones generales. El administrador del campus actual dispone de todas las capacidades. El usuario autorizado del campus actual dispone de funciones generales más las capacidades explícitas de ese campus. Un permiso sin el rol autorizado no eleva a un usuario institucional; roles/permisos de otra sede no aplican.

La consulta remota de solo lectura realizada en esta tarea encontró ambos catálogos vacíos. No se insertaron catálogos ni asignaciones. La administración de roles/catálogos queda en F2.3-05. La pantalla muestra etiquetas legibles, no los nombres técnicos. `officialActivities` prepara el contrato; la creación de actividades pertenece a su tarea.

Expo protege grupos de rutas mediante `Stack.Protected`, además de ocultar enlaces y módulos de navegación. No concede capacidades por `user_metadata`, claims editables ni por `rol_permiso`. Los módulos de Analítica/Reportería siguen siendo pantallas base; la autorización de sus futuras operaciones corresponde a F2.3-06. El endpoint de mapa existente conserva su comportamiento público y debe asegurarse con aislamiento por campus en esa tarea; ocultar una ruta Expo no protege por sí solo la API.

## Configuración necesaria en Supabase

1. En Authentication → Email Templates → Reset password, configurar el contenido de [`reset-password.html`](../src/database/supabase/templates/reset-password.html). Incluye `{{ .Token }}` en lugar de un enlace. [Supabase documenta el OTP como alternativa a la URL](https://supabase.com/docs/guides/auth/auth-email-templates).
2. Mantener Confirm Email habilitado para registro institucional. Configurar un plazo finito de expiración de Email OTP y comprobarlo en el proyecto. La expiración también gobierna recuperación. [Documentación de vigencia de OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).
3. Configurar el envío SMTP para los destinatarios requeridos. El servicio predeterminado restringe destinatarios y no reemplaza la prueba real con un correo del usuario. [SMTP en Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
4. Comprobar con una cuenta propia: solicitar código, recibir correo, introducir código/nueva contraseña, verificar login nuevo y rechazo de contraseña anterior, código usado o vencido.

No se modificó configuración remota ni se enviaron correos reales en esta implementación. Las variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` y la clave pública existente no cambian. No se necesita SQL ni configuración de deep links para el OTP introducido en el formulario.

## Cierre y errores

El botón de cuenta usa `auth.signOut({scope:'local'})`: revoca la renovación de la sesión actual y elimina su persistencia en el dispositivo. No cierra los demás dispositivos. Los JWT emitidos mantienen su vigencia hasta expirar; las solicitudes protegidas siguen validando identidad y cuenta vigentes. [Semántica de cierre de Supabase](https://supabase.com/docs/reference/javascript/auth-signout).

En la versión instalada del SDK, ciertos fallos de cierre remoto también eliminan la sesión local. La UI distingue sesión local retirada sin confirmación remota de un cierre que no pudo realizarse; no presenta esos fallos como cierre remoto confirmado.

La respuesta anónima de recuperación es idéntica incluso ante errores de entrega, cuenta o límite del proveedor. Esto evita enumeración por contenido/status, sin afirmar entrega ni ocultar el comportamiento en la documentación. Los registros de Auth/SMTP del proveedor deben utilizarse para diagnosticar entrega; no se agrega un sistema propio de monitorización o rate limiting. La política global de límites de API queda en F2.2-09.

La verificación consume el OTP antes de `updateUser`. Si Auth rechaza la contraseña o falla el cambio, solicitar otro código. Si se pierde la respuesta después del cambio, probar login con la nueva contraseña antes de reenviar. No se guarda un borrador de recuperación ni una sesión intermedia en Expo. El servidor intenta cerrar su sesión efímera en `finally`, incluso al fallar el cambio; un fallo de ese cierre no revierte una contraseña ya actualizada y los tokens nunca salen del servidor.

## Validación local

58 pruebas backend (HTTP, Auth, RLS y regresión de registro/mapa), TypeScript backend/frontend y build backend aprobados. Incluyen las ocho combinaciones, permisos de otra sede, revocación, suspensión, login de correo no institucional, errores saneados, OTP inválido/vencido/reutilizado, contraseña anterior y nueva, y respuesta de recuperación uniforme.

Export web y QA Edge/Playwright aprobados en 390×844 y 1280×900: formularios, persistencia por recarga, acceso directo restringido, cuenta bloqueada, cierre scope local y fallo remoto, recuperación y confirmación de contraseña. API/Auth fueron simulados y todo tráfico externo interceptado. Capturas/harness bajo `frontendclink/dist/` (ignorados por Git). Esto no sustituye una prueba con SMTP/Auth reales ni un dispositivo físico.

Export de bundles JavaScript Android/iOS aprobado con `--no-bytecode`, debido a la limitación Hermes local ya registrada. No es una compilación instalable ni una prueba de ejecución nativa.
