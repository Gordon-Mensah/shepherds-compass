-- CHIEF SHEPHERD MANAGEMENT SYSTEM
-- Run this entire file in your Supabase SQL Editor

-- BACENTAS (home Bible study groups)
CREATE TABLE IF NOT EXISTS bacentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SHEPHERDS
CREATE TABLE IF NOT EXISTS shepherds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  bacenta_id UUID REFERENCES bacentas(id),
  role TEXT DEFAULT 'shepherd', -- 'shepherd' or 'leader'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SHEEP (church members)
CREATE TABLE IF NOT EXISTS sheep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  bacenta_id UUID REFERENCES bacentas(id),
  shepherd_id UUID REFERENCES shepherds(id),
  basonta TEXT, -- e.g. 'Film Stars', 'Dancing Stars', etc.
  first_timer BOOLEAN DEFAULT FALSE,
  first_timer_date DATE,
  first_timer_data JSONB, -- stores first-timer questionnaire answers
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SHEPHERD TASKS
CREATE TABLE IF NOT EXISTS shepherd_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shepherd_id UUID REFERENCES shepherds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'general', -- 'general','visit','tele_pastor','outreach','bacenta'
  status TEXT DEFAULT 'pending', -- 'pending','in_progress','done'
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SHEEP VISITS (when shepherd visits a sheep)
CREATE TABLE IF NOT EXISTS sheep_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheep_id UUID REFERENCES sheep(id) ON DELETE CASCADE,
  shepherd_id UUID REFERENCES shepherds(id),
  visit_type TEXT DEFAULT 'visit', -- 'visit' or 'tele_pastor'
  report TEXT NOT NULL,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BASONTA MONTHLY REPORTS
CREATE TABLE IF NOT EXISTS basonta_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basonta TEXT NOT NULL,
  month DATE NOT NULL, -- first day of the month
  good TEXT,
  can_be_better TEXT,
  bad TEXT,
  raw_input TEXT, -- original text from shepherd/leader
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BACENTA MONTHLY REPORTS
CREATE TABLE IF NOT EXISTS bacenta_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bacenta_id UUID REFERENCES bacentas(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  good TEXT,
  can_be_better TEXT,
  bad TEXT,
  raw_input TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OUTREACH REPORTS
CREATE TABLE IF NOT EXISTS outreach_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shepherd_id UUID REFERENCES shepherds(id) ON DELETE CASCADE,
  location TEXT,
  date DATE DEFAULT CURRENT_DATE,
  people_reached INTEGER DEFAULT 0,
  first_timers_gained INTEGER DEFAULT 0,
  report TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI CHAT HISTORY
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CAMPAIGNS (scaffolded for later)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'planning', -- 'planning','active','completed'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FIRST TIMER QUESTIONS (configurable)
INSERT INTO campaigns (name, description, status) VALUES 
  ('Sample Campaign', 'Configure your first campaign here.', 'planning')
ON CONFLICT DO NOTHING;
