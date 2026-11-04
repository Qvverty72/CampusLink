-- Catálogo inicial en tabla existente. No reemplaza ni reactiva catálogos ya configurados.
BEGIN;
INSERT INTO public.mensaje_solicitud(codigo,descripcion)
SELECT codigo,descripcion FROM (VALUES
  ('ME_INTERESA','Me interesa este recurso.'),
  ('PARA_MIS_ESTUDIOS','Me interesa este recurso para mis estudios.'),
  ('QUISIERA_SOLICITARLO','Quisiera solicitar este recurso.')
) AS mensajes(codigo,descripcion)
WHERE NOT EXISTS (SELECT 1 FROM public.mensaje_solicitud)
ON CONFLICT (codigo) DO NOTHING;
COMMIT;
