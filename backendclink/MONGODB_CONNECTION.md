# Integracion de MongoDB Atlas en CampusLink

## 1. Objetivo

El backend de CampusLink usa Node.js, Express y TypeScript. La integracion agregada permite conectar el proceso del backend con un cluster de MongoDB Atlas usando el driver oficial de MongoDB para Node.js.

La conexion se establece antes de iniciar el servidor HTTP. De esta forma, la API no empieza a aceptar peticiones si no puede comunicarse con la base de datos.

La integracion incluye:

- Instalacion del driver oficial `mongodb`.
- Configuracion mediante variables de entorno.
- Validacion de la configuracion al iniciar la aplicacion.
- Un unico `MongoClient` reutilizable durante toda la vida del proceso.
- Verificacion de conectividad mediante el comando `ping`.
- Acceso a la base de datos mediante `getMongoDB()`.
- Cierre ordenado de la conexion cuando el proceso recibe `SIGINT` o `SIGTERM`.
- Ejemplo de variables de entorno sin incluir credenciales reales.

## 2. Archivos modificados

### `package.json`

Se agrego el driver oficial de MongoDB como dependencia de produccion:

```json
"mongodb": "^7.6.0"
```

El driver contiene `MongoClient`, que administra la conexion y el pool interno de conexiones. No se crea una conexion nueva para cada consulta.

Tambien se actualizo el archivo de bloqueo generado por npm durante la instalacion de la dependencia.

### `src/database/mongodb/client.ts`

Se creo este modulo para centralizar el acceso a MongoDB.

```ts
import { Db, MongoClient } from 'mongodb';

import { env } from '../../config/env.js';

const client = new MongoClient(env.mongodbUri);
```

El `MongoClient` se crea una sola vez fuera de las funciones. Esto permite reutilizar el pool de conexiones nativo del driver y evita el costo de abrir una conexion nueva en cada operacion.

#### `connectMongoDB()`

```ts
export async function connectMongoDB(): Promise<Db> {
  await client.connect();
  await client.db(env.mongodbDbName).command({ ping: 1 });

  console.log(`MongoDB connected to database "${env.mongodbDbName}"`);
  return client.db(env.mongodbDbName);
}
```

Esta funcion:

1. Abre la conexion con el cluster usando `MONGODB_URI`.
2. Selecciona la base indicada por `MONGODB_DB_NAME`.
3. Ejecuta `{ ping: 1 }` para comprobar que Atlas responde.
4. Escribe un mensaje de confirmacion en la consola.
5. Devuelve una instancia de `Db` para realizar operaciones.

La funcion no crea colecciones ni inserta datos. Es exclusivamente responsable de conectarse y comprobar la disponibilidad.

#### `getMongoDB()`

```ts
export function getMongoDB(): Db {
  return client.db(env.mongodbDbName);
}
```

Esta funcion devuelve la base de datos configurada para que los repositorios puedan acceder a sus colecciones.

Ejemplo:

```ts
import { getMongoDB } from '../../database/mongodb/client.js';

const activities = getMongoDB().collection('activities');
const results = await activities.find({ campusId }).toArray();
```

La llamada a `getMongoDB()` reutiliza el mismo cliente. No debe llamarse a `new MongoClient(...)` dentro de cada repositorio, controlador o ruta.

#### `closeMongoDB()`

```ts
export async function closeMongoDB(): Promise<void> {
  await client.close();
}
```

Esta funcion cierra el cliente y libera las conexiones cuando el servidor se detiene.

### `src/config/env.ts`

Se agregaron estas variables:

```ts
const mongodbUri = process.env.MONGODB_URI;
const mongodbDbName = process.env.MONGODB_DB_NAME;
```

La aplicacion ahora valida que ambas existan:

```ts
if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

if (!mongodbDbName) {
  throw new Error('MONGODB_DB_NAME is required');
}
```

Si falta cualquiera de ellas, el backend termina inmediatamente y muestra un error claro. Esto evita que la API arranque con una configuracion incompleta.

El objeto `env` expone los valores ya validados:

```ts
export const env = {
  mongodbDbName,
  mongodbUri,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
};
```

La variable `PORT` continua validandose como un entero positivo.

### `src/server.ts`

El arranque del servidor ahora es asincrono:

```ts
async function startServer(): Promise<void> {
  await connectMongoDB();

  const server = app.listen(env.port, () => {
    console.log(`CampusLink API running on port ${env.port}`);
  });
}
```

El orden de inicio es:

1. `dotenv/config` carga el archivo `.env`.
2. Se importa y valida la configuracion de entorno.
3. Se intenta conectar a MongoDB.
4. Se ejecuta el `ping` de comprobacion.
5. Solo despues se inicia Express en el puerto configurado.

Si MongoDB no responde, el bloque de captura muestra el error y finaliza el proceso:

```ts
startServer().catch((error: unknown) => {
  console.error('Unable to start CampusLink API', error);
  process.exit(1);
});
```

Tambien se registran manejadores para `SIGINT` y `SIGTERM`. Cuando el proceso recibe una de estas señales:

1. Se deja de aceptar trabajo nuevo mediante `server.close()`.
2. Se espera a que el servidor HTTP termine de cerrarse.
3. Se cierra MongoDB con `closeMongoDB()`.
4. El proceso termina con codigo `0`.

Este comportamiento es importante para desarrollo, Docker y plataformas de despliegue que detienen procesos mediante `SIGTERM`.

### `.env.example`

Se agregaron estas variables de ejemplo:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=campuslink
```

El archivo contiene solamente marcadores de posicion. No contiene una URI real ni credenciales.

## 3. Configuracion de MongoDB Atlas

### 3.1 Crear o elegir un cluster

1. Entra en [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Selecciona el proyecto correcto.
3. Crea un cluster o selecciona uno existente.
4. Espera a que el cluster termine de provisionarse.

### 3.2 Crear el usuario de la base de datos

1. Abre **Database Access**.
2. Selecciona **Add New Database User**.
3. Define un nombre de usuario y una contrasena.
4. Para desarrollo puedes asignar permisos sobre la base requerida.
5. Guarda el usuario.

En produccion es preferible conceder solamente los permisos que el backend necesita, en lugar de usar permisos administrativos amplios.

### 3.3 Autorizar la red

1. Abre **Network Access**.
2. Selecciona **Add IP Address**.
3. Agrega la IP desde la que ejecutaras el backend.
4. Para desarrollo local puedes usar **Add Your Current IP Address**.
5. Para Docker o despliegues en la nube, autoriza la IP de salida correspondiente.

No se recomienda usar `0.0.0.0/0` en produccion, porque permite conexiones desde cualquier direccion IP.

### 3.4 Copiar la URI

1. En Atlas abre el cluster.
2. Presiona **Connect**.
3. Selecciona **Drivers**.
4. Selecciona **Node.js**.
5. Copia la URI `mongodb+srv://...`.
6. Sustituye el usuario, la contrasena y el host por los valores proporcionados por Atlas.

Si la contrasena contiene caracteres especiales, deben codificarse en formato URL. Por ejemplo:

- `@` se convierte en `%40`.
- `#` se convierte en `%23`.
- `/` se convierte en `%2F`.
- `:` se convierte en `%3A`.

## 4. Configuracion local del backend

Desde la raiz del repositorio, copia el ejemplo:

```powershell
Copy-Item backendclink/.env.example backendclink/.env
```

Abre `backendclink/.env` y completa los valores:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://usuario:contrasena@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=campuslink
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`MONGODB_DB_NAME` es el nombre logico de la base de datos. Atlas puede mostrar la base cuando se inserte el primer documento; no es obligatorio crearla manualmente antes de iniciar el backend.

El archivo `backendclink/.env` esta excluido del control de versiones por el `.gitignore` del repositorio. No se deben subir la URI, el usuario ni la contrasena a Git.

## 5. Ejecutar y comprobar

Instala las dependencias si aun no lo hiciste:

```powershell
cd backendclink
npm install
```

Para desarrollo:

```powershell
npm run dev
```

Una conexion exitosa debe mostrar mensajes similares a:

```text
MongoDB connected to database "campuslink"
CampusLink API running on port 3000
```

El mensaje de MongoDB aparece antes que el mensaje de Express porque el backend espera a que la base responda antes de abrir el puerto HTTP.

Para compilar:

```powershell
npm run build
```

Para ejecutar el resultado compilado:

```powershell
npm start
```

## 6. Uso desde repositorios o modulos

Los repositorios deben importar `getMongoDB()` y trabajar con una coleccion concreta.

Ejemplo de lectura:

```ts
import { getMongoDB } from '../../database/mongodb/client.js';

export async function listActivities() {
  return getMongoDB()
    .collection('activities')
    .find({})
    .sort({ createdAt: -1 })
    .toArray();
}
```

Ejemplo de insercion:

```ts
import { getMongoDB } from '../../database/mongodb/client.js';

export async function createActivity(activity: {
  title: string;
  campusId: string;
}) {
  const document = {
    ...activity,
    createdAt: new Date(),
  };

  const result = await getMongoDB()
    .collection('activities')
    .insertOne(document);

  return {
    _id: result.insertedId,
    ...document,
  };
}
```

El modulo de conexion no impone nombres de colecciones ni modelos. Esa responsabilidad pertenece a los repositorios y modulos de dominio.

## 7. Comportamiento de conexiones

El backend es un proceso tradicional de larga duracion, no una funcion serverless. Por eso se utiliza un `MongoClient` compartido a nivel de modulo.

El driver administra internamente un pool de conexiones. La configuracion actual usa los valores predeterminados del driver porque todavia no hay datos de concurrencia, latencia o carga de CampusLink que justifiquen valores personalizados.

No se agregaron arbitrariamente valores como `maxPoolSize`, `minPoolSize`, `socketTimeoutMS` o `serverSelectionTimeoutMS`. Esos valores deben ajustarse despues de conocer:

- Numero de instancias del backend.
- Concurrencia esperada.
- Duracion normal de las consultas.
- Memoria y limites de conexiones del cluster.
- Patron de trafico, estable o en picos.

No se debe cerrar el cliente despues de cada consulta. El cliente solamente debe cerrarse durante el apagado del proceso.

## 8. Uso con Docker

El `Dockerfile` ya copia `package.json` y ejecuta `npm install`, por lo que la dependencia `mongodb` se instala automaticamente durante la construccion de la imagen.

La imagen no debe contener un archivo `.env` con secretos. Pasa las variables al contenedor al ejecutarlo:

```powershell
docker build -t campuslink-backend ./backendclink

docker run --rm -p 3000:3000 `
  -e PORT=3000 `
  -e NODE_ENV=production `
  -e MONGODB_URI="mongodb+srv://usuario:contrasena@cluster.mongodb.net/?retryWrites=true&w=majority" `
  -e MONGODB_DB_NAME=campuslink `
  campuslink-backend
```

En un entorno real es preferible usar el sistema de secretos de la plataforma de despliegue en lugar de escribir credenciales en el historial de comandos.

La IP de salida del contenedor o del proveedor de nube debe estar autorizada en **Network Access** de Atlas.

## 9. Errores frecuentes

### `MONGODB_URI is required`

El backend no encuentra `MONGODB_URI`.

Comprueba que:

- Existe `backendclink/.env`.
- La variable esta escrita exactamente como `MONGODB_URI`.
- El proceso se ejecuta desde el directorio correcto o usando el archivo de entorno esperado.

### `MONGODB_DB_NAME is required`

Falta el nombre de la base de datos. Agrega, por ejemplo:

```env
MONGODB_DB_NAME=campuslink
```

### Error de autenticacion

Normalmente indica que el usuario, la contrasena o los permisos no son correctos. Revisa el usuario creado en **Database Access** y vuelve a copiar la URI desde Atlas.

Si la contrasena contiene caracteres especiales, codificalos como URL.

### Error de IP no autorizada

La direccion desde la que se ejecuta el backend no esta incluida en **Network Access**. Agrega la IP local o la IP de salida del servidor.

### Error de DNS o `mongodb+srv`

Puede indicar problemas de red, DNS, VPN, firewall o una URI incompleta. Verifica que la URI copiada desde Atlas no haya sido modificada accidentalmente.

### El servidor no inicia

La aplicacion conecta primero a MongoDB. Si Atlas no responde, Express no inicia y el proceso termina con:

```text
Unable to start CampusLink API
```

Revisa el error original que aparece debajo de ese mensaje.

## 10. Seguridad

- No subas `backendclink/.env` al repositorio.
- No pongas `MONGODB_URI` en el frontend Expo.
- No expongas la contrasena en logs, respuestas HTTP ni capturas de pantalla.
- Usa un usuario de base de datos separado para cada entorno cuando sea posible.
- Usa permisos minimos en produccion.
- Restringe las IP autorizadas en Atlas.
- Rota la contrasena si se expone accidentalmente.
- Usa secretos administrados por la plataforma al desplegar.

El frontend debe comunicarse con el backend mediante endpoints HTTP. Nunca debe conectarse directamente al cluster con una credencial que tenga permisos de escritura.

## 11. Validaciones realizadas

Despues de agregar la integracion se ejecutaron:

```powershell
cd backendclink
npm run typecheck
npm run build
```

Ambos comandos terminaron correctamente.

Tambien se verifico que no existieran errores de diagnostico en los archivos:

- `src/database/mongodb/client.ts`
- `src/config/env.ts`
- `src/server.ts`

La conexion real contra Atlas requiere completar las credenciales, autorizar la IP y ejecutar el backend con un cluster accesible. Sin esos valores no se puede realizar un `ping` real desde este entorno.

## 12. Flujo completo

```text
backendclink/.env
        |
        v
 dotenv/config carga variables
        |
        v
 env.ts valida URI, base y puerto
        |
        v
 server.ts llama connectMongoDB()
        |
        v
 MongoClient conecta al cluster Atlas
        |
        v
 command({ ping: 1 }) confirma conectividad
        |
        v
 Express inicia en PORT
        |
        v
 Repositorios usan getMongoDB()
        |
        v
 SIGINT/SIGTERM -> server.close() -> closeMongoDB()
```
