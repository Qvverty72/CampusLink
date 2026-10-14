-- GH-38 / F2.4-01: category catalog approved by the user on 2026-10-13.
-- Category identifies the physical object, independently of condition, price or career.
-- Existing table/defaults only; repeated execution preserves IDs and existing rows.
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
