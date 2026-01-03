// ===================================
// SCRAPER AVANZATO CON EVENTI + DIRETTA.IT PUPPETEER
// server-advanced.js v2.1.0
// ===================================

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const NodeCache = require('node-cache');
const { scrapeDirettaLive, scrapeDirettaLiveOnly, scrapeDirettaLeague } = require('./parser-diretta-puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;

// Cache: 30 secondi per live scores (aggiornamento rapido)
const cache = new NodeCache({ stdTTL: 30 });

// Cache Diretta.it: 1 minuto (dati reali)
let direttaCachedData = null;
let direttaLastFetch = null;
const DIRETTA_CACHE_DURATION = 60000; // 1 minuto

app.use(cors());
app.use(express.json());

// ===================================
// SCRAPER AVANZATO FLASHSCORE
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
              events: events.sort((a, b) => b.minute - a.minute)
            });
          }
        } catch (err) {
          console.error('Errore parsing:', err);
        }
      });
      
      return matches;
    });
    
    console.log(`✅ Estratte ${liveMatches.length} partite FlashScore`);
    
    await browser.close();
    return liveMatches;
    
  } catch (error) {
    console.error('❌ Errore FlashScore:', error);
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
    
    await page.goto('https://www.flashscore.it/calcio/italia/serie-a/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
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
    version: '2.1.0',
    status: 'online',
    features: [
      'FlashScore scraping with Puppeteer',
      'Diretta.it advanced scraping with real data',
      'Smart caching (30s FlashScore, 60s Diretta)',
      'League filtering',
      'Status filtering'
    ],
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
      direttaLive: 'REAL DATA from Diretta.it (Puppeteer scraping)',
      direttaLeague: 'Filter Diretta.it by league name (REAL DATA)',
      direttaStatus: 'Filter Diretta.it by status: live or scheduled (REAL DATA)'
    }
  });
});

// ===================================
// FLASHSCORE ENDPOINTS (PUPPETEER)
// ===================================

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
// DIRETTA.IT ENDPOINTS (PUPPETEER AVANZATO)
// ===================================

/**
 * GET /api/diretta/live
 * DATI REALI da Diretta.it con Puppeteer
 */
app.get('/api/diretta/live', async (req, res) => {
  try {
    const now = Date.now();
    
    // Usa cache se valida
    if (direttaCachedData && direttaLastFetch && (now - direttaLastFetch) < DIRETTA_CACHE_DURATION) {
      return res.json({
        timestamp: new Date().toISOString(),
        total: direttaCachedData.length,
        matches: direttaCachedData,
        cached: true,
        cacheAge: Math.floor((now - direttaLastFetch) / 1000),
        source: 'Diretta.it (Puppeteer)'
      });
    }

    // Scraping REALE
    console.log('🌐 [API] Fetching REAL data from Diretta.it...');
    const matches = await scrapeDirettaLive();
    
    // Aggiorna cache
    direttaCachedData = matches;
    direttaLastFetch = now;

    res.json({
      timestamp: new Date().toISOString(),
      total: matches.length,
      matches: matches,
      cached: false,
      source: 'Diretta.it (Puppeteer)'
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
 * Filtra DATI REALI per campionato
 */
app.get('/api/diretta/league/:name', async (req, res) => {
  try {
    const { name } = req.params;
    console.log(`🎯 [API] Fetching league: ${name}`);
    
    const matches = await scrapeDirettaLeague(name);
    
    res.json({
      timestamp: new Date().toISOString(),
      league: name,
      total: matches.length,
      matches: matches,
      source: 'Diretta.it (Puppeteer)'
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/diretta/status/:status
 * Filtra DATI REALI per status (live o scheduled)
 */
app.get('/api/diretta/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    let matches;
    if (status.toLowerCase() === 'live') {
      console.log('🔴 [API] Fetching LIVE matches only...');
      matches = await scrapeDirettaLiveOnly();
    } else {
      const allMatches = await scrapeDirettaLive();
      matches = allMatches.filter(m => 
        m.status.toLowerCase() === status.toLowerCase()
      );
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      status,
      total: matches.length,
      matches: matches,
      source: 'Diretta.it (Puppeteer)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===================================
// UTILITY ENDPOINTS
// ===================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '2.1.0'
  });
});

app.get('/api/stats', (req, res) => {
  const keys = cache.keys();
  res.json({
    version: '2.1.0',
    cached_endpoints: keys.length,
    keys: keys,
    uptime: process.uptime(),
    flashscore_cache: {
      ttl_seconds: 30
    },
    diretta_cache: {
      active: !!direttaCachedData,
      age_seconds: direttaLastFetch ? Math.floor((Date.now() - direttaLastFetch) / 1000) : null,
      matches_count: direttaCachedData?.length || 0,
      ttl_seconds: 60
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Pronostici Backend v2.1.0 - REAL DATA SCRAPER`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\n📊 Available Endpoints:`);
  console.log(`\n   FLASHSCORE (Puppeteer):`);
  console.log(`   ├─ GET /api/live-scores (all matches)`);
  console.log(`   ├─ GET /api/live-scores/serie-a (Serie A only)`);
  console.log(`   └─ GET /api/live-scores/league/:league (filter)`);
  console.log(`\n   DIRETTA.IT (Puppeteer REAL DATA):`);
  console.log(`   ├─ GET /api/diretta/live (all matches - REAL)`);
  console.log(`   ├─ GET /api/diretta/league/:name (filter by league - REAL)`);
  console.log(`   └─ GET /api/diretta/status/:status (live/scheduled - REAL)`);
  console.log(`\n   UTILITY:`);
  console.log(`   ├─ GET /api/health (health check)`);
  console.log(`   ├─ GET /api/stats (cache stats)`);
  console.log(`   └─ GET / (API documentation)\n`);
  console.log(`✨ Nota: Diretta.it ora usa scraping Puppeteer per dati REALI!\n`);
});
