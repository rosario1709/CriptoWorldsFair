-- Independent journal deliberately has no FK lock on the workflow row.
-- A decision survives a workflow rollback after on-chain confirmation.
CREATE TABLE IF NOT EXISTS verification_intents (
  key text PRIMARY KEY,
  agreement_id text NOT NULL,
  content_hash text NOT NULL,
  data jsonb NOT NULL
);
