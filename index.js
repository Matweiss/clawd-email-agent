/**
 * Email Agent - Main Entry Point
 * Monitors inbox, categorizes emails, learns tone
 */

const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Gmail API setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

class EmailAgent {
  constructor() {
    this.categories = {
      URGENT: '🔴',
      REPLY_NEEDED: '🟡',
      FYI: '🟢',
      JUNK: '⚪'
    };
  }

  async checkInbox() {
    console.log('📧 Checking inbox...');
    
    try {
      // Get unread emails from last 24 hours
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: `is:unread after:${oneDayAgo}`,
        maxResults: 50
      });

      const messages = response.data.messages || [];
      console.log(`Found ${messages.length} unread emails`);

      for (const message of messages) {
        await this.processEmail(message.id);
      }

      // Log completion
      await this.logActivity('Inbox check completed', {
        emailsChecked: messages.length
      });

    } catch (error) {
      console.error('❌ Error checking inbox:', error.message);
      await this.logActivity('Inbox check failed', {
        error: error.message
      }, 'error');
    }
  }

  async processEmail(messageId) {
    try {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
      const to = headers.find(h => h.name === 'To')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();

      // Get email body
      let body = '';
      if (email.data.payload.parts) {
        const textPart = email.data.payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
        }
      }

      // Categorize
      const category = await this.categorizeEmail({ from, subject, body, to });

      // Check if from active deal contact
      const dealInfo = await this.checkDealAssociation(from);

      // Store in database
      const { data, error } = await supabase
        .from('email_categories')
        .upsert({
          message_id: messageId,
          subject: subject,
          from_email: this.extractEmail(from),
          from_name: this.extractName(from),
          category: category,
          deal_id: dealInfo?.dealId || null,
          deal_name: dealInfo?.dealName || null,
          sentiment: this.analyzeSentiment(body),
          thread_id: email.data.threadId,
          received_at: new Date(date),
          processed_at: new Date()
        });

      if (error) throw error;

      // Alert if urgent
      if (category === 'URGENT') {
        await this.alertWorkAgent({
          messageId,
          subject,
          from,
          dealInfo,
          body: body.substring(0, 200)
        });
      }

      console.log(`✅ Categorized: ${category} - ${subject.substring(0, 50)}`);

    } catch (error) {
      console.error(`❌ Error processing email ${messageId}:`, error.message);
    }
  }

  async categorizeEmail({ from, subject, body, to }) {
    const sender = from.toLowerCase();
    const content = (subject + ' ' + body).toLowerCase();

    // Check if from active deal
    const dealInfo = await this.checkDealAssociation(from);
    const isActiveDeal = dealInfo && ['Qualification', 'Discovery', 'Evaluation', 'Confirmation', 'Negotiation'].includes(dealInfo.stage);

    // Urgency keywords
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'contract', 'cancel', 'problem', 'issue', 'concerned', 'frustrated', 'deadline', 'eod'];
    const hasUrgentKeyword = urgentKeywords.some(kw => content.includes(kw));

    // Junk indicators
    const junkIndicators = ['unsubscribe', 'newsletter', 'marketing', 'promo', 'no-reply@', 'noreply@'];
    const isJunk = junkIndicators.some(ind => sender.includes(ind) || subject.toLowerCase().includes(ind));

    // Categorization logic
    if (isJunk) return 'JUNK';
    if (isActiveDeal && hasUrgentKeyword) return 'URGENT';
    if (isActiveDeal) return 'REPLY_NEEDED';
    if (hasUrgentKeyword) return 'REPLY_NEEDED';
    if (to.includes('mat@craftable.com')) return 'FYI';
    
    return 'FYI';
  }

  async checkDealAssociation(fromEmail) {
    try {
      const email = this.extractEmail(fromEmail);
      
      // Query HubSpot for contact with this email
      // This is a placeholder - implement actual HubSpot API call
      const { data: deal } = await supabase
        .from('deal_contacts')
        .select('deal_id, deal_name, stage')
        .eq('email', email)
        .single();

      return deal || null;
    } catch {
      return null;
    }
  }

  analyzeSentiment(text) {
    const positive = ['great', 'excellent', 'love', 'perfect', 'thanks', 'appreciate'];
    const negative = ['problem', 'issue', 'concern', 'frustrated', 'disappointed', 'cancel', 'urgent'];
    
    const lowerText = text.toLowerCase();
    const posCount = positive.filter(w => lowerText.includes(w)).length;
    const negCount = negative.filter(w => lowerText.includes(w)).length;

    if (negCount > posCount) return 'concerned';
    if (posCount > negCount) return 'positive';
    return 'neutral';
  }

  async alertWorkAgent(alert) {
    // Store in alerts table for Work Agent
    await supabase.from('agent_alerts').insert({
      agent: 'email-agent',
      alert_type: 'URGENT_EMAIL',
      title: `🔴 URGENT: ${alert.from}`,
      content: alert.subject,
      metadata: {
        messageId: alert.messageId,
        dealId: alert.dealInfo?.dealId,
        preview: alert.body
      },
      created_at: new Date()
    });

    console.log(`🚨 Alerted Work Agent: ${alert.subject}`);
  }

  async logActivity(action, details, status = 'info') {
    await supabase.from('clawd_logs').insert({
      agent: 'email-agent',
      action: action,
      status: status,
      details: details,
      created_at: new Date()
    });
  }

  extractEmail(fromString) {
    const match = fromString.match(/<([^>]+)>/);
    return match ? match[1] : fromString;
  }

  extractName(fromString) {
    const match = fromString.match(/^([^<]+)/);
    return match ? match[1].trim() : 'Unknown';
  }
}

// Run if called directly
if (require.main === module) {
  const agent = new EmailAgent();
  agent.checkInbox().then(() => {
    console.log('✅ Email check complete');
    process.exit(0);
  }).catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}

module.exports = EmailAgent;
