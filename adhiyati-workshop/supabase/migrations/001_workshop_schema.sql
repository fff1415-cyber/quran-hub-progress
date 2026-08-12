-- ورشة تطوير مشروع أضحيتي 1447هـ — Schema

CREATE TABLE IF NOT EXISTS workshop_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  current_stage TEXT NOT NULL DEFAULT 'registration',
  current_slide INTEGER NOT NULL DEFAULT 1,
  voting_active BOOLEAN NOT NULL DEFAULT false,
  improvement_voting_active BOOLEAN NOT NULL DEFAULT false,
  results_visible BOOLEAN NOT NULL DEFAULT false,
  locked_topics INTEGER[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO workshop_state (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM workshop_state);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL,
  custom_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  voter_id TEXT NOT NULL,
  voter_type TEXT NOT NULL CHECK (voter_type IN ('participant', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, voter_id)
);

CREATE TABLE IF NOT EXISTS improvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS improvement_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id UUID NOT NULL REFERENCES improvements(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  voter_id TEXT NOT NULL,
  voter_type TEXT NOT NULL CHECK (voter_type IN ('participant', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (improvement_id, voter_id)
);

ALTER PUBLICATION supabase_realtime ADD TABLE workshop_state;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
ALTER PUBLICATION supabase_realtime ADD TABLE topic_reservations;
ALTER PUBLICATION supabase_realtime ADD TABLE challenges;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE improvements;
ALTER PUBLICATION supabase_realtime ADD TABLE improvement_votes;

ALTER TABLE workshop_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all workshop_state" ON workshop_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all teams" ON teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all team_members" ON team_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all topic_reservations" ON topic_reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all challenges" ON challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all votes" ON votes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all improvements" ON improvements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all improvement_votes" ON improvement_votes FOR ALL USING (true) WITH CHECK (true);
