-- Email Agent Database Schema
-- Run this in Supabase SQL Editor

-- Email categories table
CREATE TABLE IF NOT EXISTS email_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  thread_id text,
  subject text,
  from_email text NOT NULL,
  from_name text,
  to_email text,
  category text NOT NULL CHECK (category IN ('URGENT', 'REPLY_NEEDED', 'FYI', 'JUNK')),
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'concerned', 'negative')),
  deal_id text,
  deal_name text,
  thread_depth int DEFAULT 1,
  body_preview text,
  is_processed boolean DEFAULT false,
  received_at timestamptz,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Email tone training table
CREATE TABLE IF NOT EXISTS email_tone_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_email_id text,
  recipient_type text, -- prospect, customer, internal, partner
  deal_stage text,
  subject text,
  body text,
  tone_traits jsonb, -- {formality: 0.8, humor: 0.3, urgency: 0.5}
  greeting_style text,
  sign_off text,
  response_received boolean,
  response_time_hours int,
  effectiveness_score int, -- 1-10
  analyzed_at timestamptz DEFAULT now()
);

-- Agent alerts table (for Work Agent)
CREATE TABLE IF NOT EXISTS agent_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Deal contacts mapping
CREATE TABLE IF NOT EXISTS deal_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  deal_id text,
  deal_name text,
  stage text,
  contact_name text,
  company text,
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_categories_category ON email_categories(category);
CREATE INDEX idx_email_categories_deal ON email_categories(deal_id);
CREATE INDEX idx_email_categories_received ON email_categories(received_at DESC);
CREATE INDEX idx_email_categories_from ON email_categories(from_email);
CREATE INDEX idx_agent_alerts_unread ON agent_alerts(is_read) WHERE is_read = false;
CREATE INDEX idx_tone_training_recipient ON email_tone_training(recipient_type);

-- Enable realtime
alter publication supabase_realtime add table email_categories;
alter publication supabase_realtime add table agent_alerts;
