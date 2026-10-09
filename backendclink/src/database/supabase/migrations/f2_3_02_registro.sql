-- F2.3-02. Apply after f2_3_01_autenticacion.sql as database owner.
-- Express owns admission, verification, provisioning and retries.
-- Structural integrity, essential isolation and MVP catalog data only.
BEGIN;

-- Remove only the temporary table added by the previous F2.3-02 draft.
-- Preserve the transaction and ask for review if it contains any registrations.
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

-- dominio_institucional already belongs to the existing CampusLink schema.
ALTER TABLE public.dominio_institucional ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dominio_institucional FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.dominio_institucional TO service_role;
GRANT SELECT ON public.institucion, public.campus TO service_role;
GRANT SELECT, INSERT ON public.perfil_usuario TO service_role;

-- A campus/institution pair must be structurally consistent.
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

-- Reuse DUOC UC already present for the map; no fictitious campuses.
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
