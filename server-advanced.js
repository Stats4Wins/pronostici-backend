// ===================================
// SCRAPER AVANZATO CON EVENTI + DIRETTA.IT
// server-advanced.js
// ===================================

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const NodeCache = require('node-cache');
const axios = require('axios');
const DirettaParser = require('./DirettaParser');

const app = express();
const PORT = process.env.PORT || 3001;

// Cache: 30 secondi per live scores (aggiornamento rapido)
const cache = new NodeCache({ stdTTL: 30 });

// Cache Diretta.it: 1 minuto
let direttaCachedData = null;
let direttaLastFetch = null;
const DIRETTA_CACHE_DURATION = 60000; // 1 minuto

app.use(cors());
app.use(express.json());

// ===================================
// DIRETTA.IT HELPERS
// ===================================

async function fetchDirettaHTML() {
  const response = await axios.get('https://www.diretta.it/calcio/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
    },
    timeout: 15000
  });
  return response.data;
}

// ===================================
// SCRAPER AVANZATO CON EVENTI
// ===================================

async function scrapeFlashScoreAdvanced() {
  let browser;
  try {
    console.log('🔍 Avvio scraping avanzato FlashScore...');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto('https://www.flashscore.it/calcio/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.sportName.soccer', { timeout: 10000 });
    
    // Estrai partite con eventi
    const liveMatches = await page.evaluate(() => {
      const matches = [];
      const matchElements = document.querySelectorAll('.event__match--live');
      
      matchElements.forEach((match) => {
        try {
          const homeTeam = match.querySelector('.event__participant--home')?.textContent.trim();
          const awayTeam = match.querySelector('.event__participant--away')?.textContent.trim();
          const homeScore = parseInt(match.querySelector('.event__score--home')?.textContent.trim() || '0');
          const awayScore = parseInt(match.querySelector('.event__score--away')?.textContent.trim() || '0');
          const time = match.querySelector('.event__time')?.textContent.trim() || '';
          const stage = match.querySelector('.event__stage--block')?.textContent.trim() || '';
          
          // Estrai eventi (gol, cartellini) se visibili
          const events = [];
          const incidentsContainer = match.querySelector('.event__incidents');
          
          if (incidentsContainer) {
            const incidents = incidentsContainer.querySelectorAll('.incident');
            incidents.forEach(incident => {
              const incidentTime = incident.querySelector('.incident__time')?.textContent.trim();
              const incidentPlayer = incident.querySelector('.incident__participant')?.textContent.trim();
              const incidentIcon = incident.querySelector('.incident__icon');
              
              let type = 'unknown';
              if (incidentIcon) {
                if (incidentIcon.classList.contains('soccer-ball')) type = 'goal';
                else if (incidentIcon.classList.contains('y-card')) type = 'yellowcard';
                else if (incidentIcon.classList.contains('r-card')) type = 'redcard';
                else if (incidentIcon.classList.contains('substitution')) type = 'substitution';
              }
              
              if (incidentTime && incidentPlayer) {
                events.push({
                  minute: parseInt(incidentTime.replace("'", '')),
                  type,
                  player: incidentPlayer,
                  team: incident.classList.contains('incident--home') ? 'home' : 'away'
                });
              }
            });
          }
          
          // Cerca competizione
          let competition = 'N/A';
          let currentElement = match.closest('.sportName')?.previousElementSibling;
          while (currentElement && !competition.includes('Serie')) {
            const leagueEl = currentElement.querySelector('.event__title--name');
            if (leagueEl) {
              competition = leagueEl.textContent.trim();
              break;
            }
            currentElement = currentElement.previousElementSibling;
          }
          
          if (homeTeam && awayTeam) {
            matches.push({
              id: `${homeTeam}-${awayTeam}-${Date.now()}`.replace(/\s/g, '-').toLowerCase(),
              homeTeam,
              awayTeam,
              homeScore,
              awayScore,
              time: stage || time,
              status: stage === 'Intervallo' ? 'HALFTIME' : 'IN_PLAY',
              competition,
              events: events.sort((a, b) => b.minute - a.minute) // Ordina per minuto desc
            });
          }
        } catch (err) {
          console.error('Errore parsing:', err);
        }
      });
      
      return matches;
    });
    
    console.log(`✅ Estratte ${liveMatches.length} partite con ${liveMatches.reduce((sum, m) => sum + m.events.length, 0)} eventi totali`);
    
    await browser.close();
    return liveMatches;
    
  } catch (error) {
    console.error('❌ Errore:', error);
    if (browser) await browser.close();
    throw error;
  }
}

// ===================================
// SCRAPER SPECIFICO SERIE A
// ===================================

async function scrapeSerieAOnly() {
  let browser;
  try {
    console.log('🇮🇹 Scraping Serie A...');
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // URL specifico per Serie A
    await page.goto('https://www.flashscore.it/calcio/italia/serie-a/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000); // Attendi caricamento
    
    const matches = await page.evaluate(() => {
      const results = [];
      const liveMatches = document.querySelectorAll('.event__match--live');
      
      liveMatches.forEach(match => {
        const home = match.querySelector('.event__participant--home')?.textContent.trim();
        const away = match.querySelector('.event__participant--away')?.textContent.trim();
        const homeScore = parseInt(match.querySelector('.event__score--home')?.textContent || '0');
        const awayScore = parseInt(match.querySelector('.event__score--away')?.textContent || '0');
        const time = match.querySelector('.event__time')?.textContent.trim();
        
        if (home && away) {
          results.push({
            id: `serie-a-${home}-${away}`.replace(/\s/g, '-').toLowerCase(),
            homeTeam: home,
            awayTeam: away,
            homeScore,
            awayScore,
            time: time || '',
            status: 'IN_PLAY',
            competition: 'Serie A',
            events: []
          });
        }
      });
      
      return results;
    });
    
    console.log(`✅ Serie A: ${matches.length} partite live`);
    await browser.close();
    return matches;
    
  } catch (error) {
    console.error('❌ Errore Serie A:', error);
    if (browser) await browser.close();
    throw error;
  }
}

// ===================================
// API ENDPOINTS
// ===================================

// Homepage
app.get('/', (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host');
  res.json({
    name: 'Pronostici Backend API',
    version: '2.0.0',
    status: 'online',
    endpoints: {
      health: `${baseUrl}/api/health`,
      stats: `${baseUrl}/api/stats`,
      liveScores: `${baseUrl}/api/live-scores`,
      serieA: `${baseUrl}/api/live-scores/serie-a`,
      league: `${baseUrl}/api/live-scores/league/:league`,
      direttaLive: `${baseUrl}/api/diretta/live`,
      direttaLeague: `${baseUrl}/api/diretta/league/:name`,
      direttaStatus: `${baseUrl}/api/diretta/status/:status`
    },
    documentation: {
      health: 'Server health check',
      stats: 'Cache statistics',
      liveScores: 'All live matches from FlashScore (Puppeteer)',
      serieA: 'Live Serie A matches only (Puppeteer)',
      league: 'Filter FlashScore by league name',
      direttaLive: 'All matches from Diretta.it (HTML parsing)',
      direttaLeague: 'Filter Diretta.it by league name',
      direttaStatus: 'Filter Diretta.it by status (live/finished/scheduled)'
    }
  });
});

// ===================================
// FLASHSCORE ENDPOINTS (PUPPETEER)
// ===================================

// Tutte le partite live
app.get('/api/live-scores', async (req, res) => {
  try {
    const cached = cache.get('all-live');
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }
    
    const matches = await scrapeFlashScoreAdvanced();
    cache.set('all-live', matches);
    
    res.json({ success: true, data: matches, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Solo Serie A
app.get('/api/live-scores/serie-a', async (req, res) => {
  try {
    const cached = cache.get('serie-a-live');
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }
    
    const matches = await scrapeSerieAOnly();
    cache.set('serie-a-live', matches);
    
    res.json({ success: true, data: matches, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Filtra per campionato
app.get('/api/live-scores/league/:league', async (req, res) => {
  try {
    const { league } = req.params;
    const cacheKey = `league-${league}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }
    
    const allMatches = await scrapeFlashScoreAdvanced();
    const filtered = allMatches.filter(m => 
      m.competition.toLowerCase().includes(league.toLowerCase())
    );
    
    cache.set(cacheKey, filtered);
    res.json({ success: true, data: filtered, cached: false });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================
// DIRETTA.IT ENDPOINTS (HTML PARSING)
// ===================================

/**
 * GET /api/diretta/live
 * Tutte le partite da Diretta.it (live, scheduled, finished)
 */
app.get('/api/diretta/live', async (req, res) => {
  try {
    const now = Date.now();
    
    // Usa cache se valida
    if (direttaCachedData && direttaLastFetch && (now - direttaLastFetch) < DIRETTA_CACHE_DURATION) {
      return res.json({
        ...direttaCachedData,
        cached: true,
        cacheAge: Math.floor((now - direttaLastFetch) / 1000)
      });
    }

    // Scarica e parsa
    console.log('📥 Fetching from Diretta.it...');
    const html = await fetchDirettaHTML();
    const data = DirettaParser.parseMatches(html);
    
    // Aggiorna cache
    direttaCachedData = data;
    direttaLastFetch = now;

    res.json({
      ...data,
      cached: false
    });
  } catch (error) {
    console.error('❌ Error fetching Diretta.it:', error.message);
    res.status(500).json({
      error: 'Failed to fetch live matches',
      message: error.message
    });
  }
});

/**
 * GET /api/diretta/league/:name
 * Filtra partite Diretta.it per campionato
 */
app.get('/api/diretta/league/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!direttaCachedData) {
      const html = await fetchDirettaHTML();
      direttaCachedData = DirettaParser.parseMatches(html);
      direttaLastFetch = Date.now();
    }

    const filtered = DirettaParser.filterByLeague(direttaCachedData.matches, name);
    
    res.json({
      league: name,
      total: filtered.length,
      matches: filtered
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/diretta/status/:status
 * Filtra per status (live, finished, scheduled)
 */
app.get('/api/diretta/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    if (!direttaCachedData) {
      const html = await fetchDirettaHTML();
      direttaCachedData = DirettaParser.parseMatches(html);
      direttaLastFetch = Date.now();
    }

    const filtered = DirettaParser.filterByStatus(direttaCachedData.matches, status);
    
    res.json({
      status,
      total: filtered.length,
      matches: filtered
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================================
// UTILITY ENDPOINTS
// ===================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Stats
app.get('/api/stats', (req, res) => {
  const keys = cache.keys();
  res.json({
    cached_endpoints: keys.length,
    keys: keys,
    uptime: process.uptime(),
    diretta_cache: {
      active: !!direttaCachedData,
      age_seconds: direttaLastFetch ? Math.floor((Date.now() - direttaLastFetch) / 1000) : null,
      matches_count: direttaCachedData?.total || 0
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Pronostici Backend v2.0`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\n📊 Available Endpoints:`);
  console.log(`\n   FLASHSCORE (Puppeteer):`);
  console.log(`   ├─ GET /api/live-scores (all matches)`);
  console.log(`   ├─ GET /api/live-scores/serie-a (Serie A only)`);
  console.log(`   └─ GET /api/live-scores/league/:league (filter)`);
  console.log(`\n   DIRETTA.IT (HTML Parser):`);
  console.log(`   ├─ GET /api/diretta/live (all matches)`);
  console.log(`   ├─ GET /api/diretta/league/:name (filter by league)`);
  console.log(`   └─ GET /api/diretta/status/:status (live/finished/scheduled)`);
  console.log(`\n   UTILITY:`);
  console.log(`   ├─ GET /api/health (health check)`);
  console.log(`   ├─ GET /api/stats (cache stats)`);
  console.log(`   └─ GET / (API documentation)\n`);
});
