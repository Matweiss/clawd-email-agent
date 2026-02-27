# Email Agent - Setup Instructions

## 🚀 Email Agent Deployed!

**GitHub Repo:** https://github.com/Matweiss/clawd-email-agent

---

## ⚡ FINAL STEP: Run Database Schema

**Go to:** https://supabase.com/dashboard/project/nmhbmgtyqutbztdafzjl/sql/new

**Copy and paste this SQL:**

```sql
-- Email Agent Database Schema

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
  recipient_type text,
  deal_stage text,
  subject text,
  body text,
  tone_traits jsonb,
  greeting_style text,
  sign_off text,
  response_received boolean,
  response_time_hours int,
  effectiveness_score int,
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
CREATE INDEX IF NOT EXISTS idx_email_categories_category ON email_categories(category);
CREATE INDEX IF NOT EXISTS idx_email_categories_deal ON email_categories(deal_id);
CREATE INDEX IF NOT EXISTS idx_email_categories_received ON email_categories(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_categories_from ON email_categories(from_email);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_unread ON agent_alerts(is_read) WHERE is_read = false;

-- Enable realtime
alter publication supabase_realtime add table email_categories;
alter publication supabase_realtime add table agent_alerts;
```

Click **Run** — tables will be created!

---

## 🔧 SETUP CRON JOB

After running the SQL, add this cron job:

```bash
# Check inbox every 5 minutes
*/5 * * * * cd /root/.openclaw/workspace/clawd-email-agent && node index.js >> /var/log/email-agent.log 2>&1
```

---

## ✅ Email Agent Will:

1. **Monitor inbox** every 5 minutes
2. **Categorize emails:** 🔴 URGENT / 🟡 REPLY NEEDED / 🟢 FYI / ⚪ JUNK
3. **Learn your tone** from Sent folder
4. **Alert Work Agent** on urgent emails
5. **Store everything** in Supabase for Mission Control dashboard

---

**Ready to activate!** 🚀
