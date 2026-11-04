-- Datos de cuenta para el backend confiable; sin acceso nuevo para anon/authenticated.
BEGIN;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT (id, email, created_at) ON auth.users TO service_role;
GRANT SELECT (perfil_usuario_id, carrera_id) ON public.usuario_carrera TO service_role;
GRANT SELECT (id, nombre, institucion_id) ON public.carrera TO service_role;
COMMIT;
