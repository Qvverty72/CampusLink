# Certificado público de PostgreSQL Supabase

`prod-ca-2021.crt` se descarga del mismo origen que utiliza el dashboard oficial:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Origen verificado en `apps/studio/hooks/custom-content/custom-content.json` del
repositorio oficial `supabase/supabase` el 2026-10-09. CA: Supabase Root 2021 CA;
vigente hasta 2031-04-26. Huella SHA-256:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

No contiene credenciales ni claves privadas. Se incluye en la imagen Docker.
Para utilizarlo, añadir a `SUPABASE_DB_URL`:
`sslmode=verify-full&sslrootcert=config/supabase/ssl/prod-ca-2021.crt`.
La ruta relativa funciona desde `backendclink/` y desde `/app` en Docker.
Para otros proveedores o una CA distinta, usar el certificado correspondiente.
No desactivar la validación de certificado o hostname. Ante rotación, descargar
la CA vigente del dashboard, verificar su procedencia y reconstruir la imagen.
