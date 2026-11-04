-- Aplicar después de f2_3_01_autenticacion.sql, con conexión propietaria.
-- Express administra admisión, verificación, provisión y reintentos.
-- Esta migración aporta integridad estructural, aislamiento y datos mínimos de catálogo.
BEGIN;

-- Retira solo la tabla temporal agregada por un borrador anterior de F2.3-02.
-- Si contiene registros, aborta la transacción para que se revisen antes de limpiarla.
DO $$
DECLARE pending_rows bigint;
BEGIN
  IF to_regclass('public.registro_institucional_pendiente') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.registro_institucional_pendiente' INTO pending_rows;
    IF pending_rows > 0 THEN
      RAISE EXCEPTION 'Temporary registration table contains % rows; review them before cleanup', pending_rows;
    END IF;
    DROP TABLE public.registro_institucional_pendiente;
  END IF;
END $$;

-- `dominio_institucional` ya pertenece al esquema existente de CampusLink.
ALTER TABLE public.dominio_institucional ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dominio_institucional FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.dominio_institucional TO service_role;
GRANT SELECT ON public.institucion, public.campus TO service_role;
GRANT SELECT, INSERT ON public.perfil_usuario TO service_role;

-- La pareja campus/institución debe ser coherente según la clave foránea compuesta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.campus'::regclass AND conname = 'campus_id_institucion_unique') THEN
    ALTER TABLE public.campus ADD CONSTRAINT campus_id_institucion_unique UNIQUE (id, institucion_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.perfil_usuario'::regclass AND conname = 'perfil_campus_institucion_fkey') THEN
    ALTER TABLE public.perfil_usuario ADD CONSTRAINT perfil_campus_institucion_fkey
      FOREIGN KEY (campus_id, institucion_id) REFERENCES public.campus(id, institucion_id);
  END IF;
END $$;

-- Reutiliza la institución DuocUC existente para el mapa; no crea campus ficticios.
DO $$
DECLARE duoc_id uuid; matches integer;
BEGIN
  SELECT count(*), (array_agg(id))[1] INTO matches, duoc_id
    FROM public.institucion WHERE lower(regexp_replace(nombre, '\s', '', 'g')) = 'duocuc';
  IF matches > 1 THEN RAISE EXCEPTION 'Multiple DuocUC institutions; resolve the catalog before migration'; END IF;
  IF matches = 0 THEN
    INSERT INTO public.institucion(nombre) VALUES ('DuocUC') RETURNING id INTO duoc_id;
  END IF;
  INSERT INTO public.dominio_institucional(dominio,institucion_id) VALUES ('duocuc.cl',duoc_id)
    ON CONFLICT (dominio) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.dominio_institucional WHERE dominio = 'duocuc.cl' AND institucion_id = duoc_id) THEN
    RAISE EXCEPTION 'duocuc.cl is mapped to a different institution; resolve the catalog';
  END IF;
END $$;

COMMIT;
