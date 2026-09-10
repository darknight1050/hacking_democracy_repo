-- Confirmed coins are a per-project lower bound, not a lock on the entire wallet.
ALTER TABLE cumulative_cart ADD COLUMN confirmed jsonb NOT NULL DEFAULT '{}';
UPDATE cumulative_cart c SET confirmed=COALESCE((
  SELECT jsonb_object_agg(x.id,x.coins) FROM (
    SELECT v.suggestion_id AS id,sum(v.points_spent)::int AS coins
    FROM vote v JOIN ballot b ON b.id=v.ballot_id
    WHERE b.participant_id=c.participant_id AND b.method='cumulative'
      AND b.submitted_at IS NOT NULL AND b.superseded_at IS NULL AND v.value>0
    GROUP BY v.suggestion_id
  ) x
),'{}');
-- Restore any old draft reductions below confirmed allocations without altering vote history.
UPDATE cumulative_cart c SET allocations=c.allocations || (
  SELECT COALESCE(jsonb_object_agg(key,GREATEST(value::int,COALESCE((c.allocations->>key)::int,0))),'{}')
  FROM jsonb_each_text(c.confirmed)
);
-- Legacy editable receipts may have drafts that conflict with locked coins.
UPDATE cumulative_cart c SET allocations=confirmed,revision=revision+1
WHERE (SELECT sum(value::int) FROM jsonb_each_text(c.allocations))>100;

CREATE TABLE hidden_achievement (
  participant_id uuid NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  achievement text NOT NULL CHECK (achievement='never-gonna-give-you-up'),
  earned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(participant_id,achievement)
);
