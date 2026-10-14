-- GH-38 / F2.4-01: catálogo de categorías aprobado por el usuario el 2026-10-13.
-- La categoría identifica el objeto; condición, precio y carrera son atributos independientes.
-- Reutiliza la tabla y sus valores predeterminados; `ON CONFLICT` conserva IDs y filas existentes.
INSERT INTO public.categoria_recurso_fisico (nombre)
VALUES
  ('Libros y textos'),
  ('Apuntes y material impreso'),
  ('Materiales académicos'),
  ('Instrumentos y herramientas'),
  ('Tecnología y accesorios'),
  ('Indumentaria académica'),
  ('Otros')
ON CONFLICT (nombre) DO NOTHING;
