-- Local, additive migration. Apply before deploying F2.2-06; never at API startup.
BEGIN;
CREATE SCHEMA IF NOT EXISTS campuslink_private;
REVOKE ALL ON SCHEMA campuslink_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA campuslink_private TO service_role;

CREATE TABLE IF NOT EXISTS campuslink_private.activity_creator_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.perfil_usuario(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  previous_version timestamptz NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (reason IN ('CAMPUS_CHANGED','SUSPENDED','DEACTIVATED')),
  processed_at timestamptz,
  UNIQUE (user_id, previous_version, reason)
);
ALTER TABLE campuslink_private.activity_creator_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON campuslink_private.activity_creator_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON campuslink_private.activity_creator_changes TO service_role;
CREATE INDEX IF NOT EXISTS activity_creator_changes_pending
  ON campuslink_private.activity_creator_changes(changed_at,id) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS activity_creator_changes_reference
  ON campuslink_private.activity_creator_changes(user_id,campus_id,previous_version);

CREATE OR REPLACE FUNCTION campuslink_private.enqueue_activity_creator_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE change_reason text;
BEGIN
  IF NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta AND NEW.estado_cuenta = 'SUSPENDIDA' THEN
    change_reason := 'SUSPENDED';
  ELSIF (NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta AND NEW.estado_cuenta = 'DESACTIVADA')
    OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    change_reason := 'DEACTIVATED';
  ELSIF NEW.campus_id IS DISTINCT FROM OLD.campus_id THEN
    change_reason := 'CAMPUS_CHANGED';
  ELSE RETURN NEW;
  END IF;
  -- Even direct trusted SQL changes retain a durable intent in the same transaction.
  -- Versions must advance for writes outside the existing F2.3 repositories too.
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond', NEW.updated_at);
  INSERT INTO campuslink_private.activity_creator_changes(user_id,campus_id,previous_version,reason)
    VALUES (OLD.id,OLD.campus_id,OLD.updated_at,change_reason) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION campuslink_private.enqueue_activity_creator_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION campuslink_private.enqueue_activity_creator_change() TO service_role;
DROP TRIGGER IF EXISTS activity_creator_change ON public.perfil_usuario;
CREATE TRIGGER activity_creator_change BEFORE UPDATE OF campus_id,estado_cuenta,deleted_at
  ON public.perfil_usuario FOR EACH ROW EXECUTE FUNCTION campuslink_private.enqueue_activity_creator_change();
COMMIT;
