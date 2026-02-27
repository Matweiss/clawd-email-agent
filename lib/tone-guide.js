// lib/tone-guide.js - Google Sheets integration for email tone
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Your tone guide spreadsheet
const SPREADSHEET_ID = '1h8kA7qyqc6s1kPQ8Qk_300Vrt79eP_TXVUauaDAtDcE';
const SHEET_NAME = 'Sheet1'; // Update if different

class ToneGuide {
  constructor() {
    this.cache = null;
    this.lastFetch = null;
  }

  async fetchToneGuide() {
    // Cache for 1 hour
    if (this.cache && this.lastFetch && (Date.now() - this.lastFetch < 3600000)) {
      return this.cache;
    }

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:Z100`, // Adjust range as needed
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('No data found in tone guide');
        return null;
      }

      // Parse the spreadsheet into structured data
      const headers = rows[0];
      const data = rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header.toLowerCase().replace(/\s+/g, '_')] = row[index] || '';
        });
        return obj;
      });

      this.cache = this.parseToneGuide(data);
      this.lastFetch = Date.now();
      
      console.log('✅ Tone guide fetched from Google Sheets');
      return this.cache;

    } catch (error) {
      console.error('❌ Error fetching tone guide:', error.message);
      return null;
    }
  }

  parseToneGuide(data) {
    const guide = {
      greeting_styles: {},
      sign_offs: {},
      tone_traits: {},
      urgency_levels: {},
      humor_usage: {},
      formality: {}
    };

    data.forEach(row => {
      // Parse based on your sheet structure
      // Adjust these based on your actual column names
      if (row.category === 'Greeting') {
        guide.greeting_styles[row.context] = row.example;
      }
      if (row.category === 'Sign-off') {
        guide.sign_offs[row.context] = row.example;
      }
      if (row.category === 'Tone') {
        guide.tone_traits[row.context] = {
          description: row.description,
          example: row.example
        };
      }
      if (row.category === 'Urgency') {
        guide.urgency_levels[row.level] = row.phrases;
      }
    });

    return guide;
  }

  async getToneForContext(recipientType, dealStage, urgency) {
    const guide = await this.fetchToneGuide();
    if (!guide) return null;

    return {
      greeting: guide.greeting_styles[recipientType] || 'Hi [name],',
      sign_off: guide.sign_offs[recipientType] || 'Best,',
      tone: guide.tone_traits[dealStage] || guide.tone_traits['default'],
      urgency_phrases: guide.urgency_levels[urgency] || ''
    };
  }

  // Analyze an email and score how well it matches Mat's tone
  async analyzeEmailTone(emailBody, recipientType) {
    const guide = await this.fetchToneGuide();
    if (!guide) return null;

    const scores = {
      formality: 0,
      humor: 0,
      urgency: 0,
      warmth: 0
    };

    // Simple keyword matching (can be enhanced with NLP)
    const humorWords = ['haha', 'lol', 'funny', 'joke', 'humorous', 'witty'];
    const urgencyWords = ['urgent', 'asap', 'immediately', 'deadline', 'eod'];
    const warmthWords = ['thanks', 'appreciate', 'great', 'awesome', 'love'];

    const lowerBody = emailBody.toLowerCase();

    humorWords.forEach(word => {
      if (lowerBody.includes(word)) scores.humor += 1;
    });

    urgencyWords.forEach(word => {
      if (lowerBody.includes(word)) scores.urgency += 1;
    });

    warmthWords.forEach(word => {
      if (lowerBody.includes(word)) scores.warmth += 1;
    });

    // Check against Mat's typical patterns
    const matPatterns = await this.getMatPatterns();
    
    return {
      scores,
      matches_mat_style: this.compareToMatStyle(scores, matPatterns),
      suggestions: this.generateSuggestions(scores, guide, recipientType)
    };
  }

  async getMatPatterns() {
    // This would analyze Mat's sent emails from the database
    // For now, return default patterns
    return {
      avg_formality: 0.7,
      avg_humor: 0.3,
      avg_urgency: 0.4,
      avg_warmth: 0.8
    };
  }

  compareToMatStyle(scores, patterns) {
    const diff = Math.abs(scores.humor - patterns.avg_humor) +
                 Math.abs(scores.urgency - patterns.avg_urgency) +
                 Math.abs(scores.warmth - patterns.avg_warmth);
    
    return diff < 1.0 ? 'high' : diff < 2.0 ? 'medium' : 'low';
  }

  generateSuggestions(scores, guide, recipientType) {
    const suggestions = [];

    if (scores.humor < 0.2 && recipientType === 'prospect_early') {
      suggestions.push('Consider adding light humor for early-stage prospects');
    }

    if (scores.urgency > 0.5 && !guide.urgency_levels['high']) {
      suggestions.push('High urgency detected but not typical for Mat - confirm this tone is intentional');
    }

    return suggestions;
  }
}

module.exports = ToneGuide;
