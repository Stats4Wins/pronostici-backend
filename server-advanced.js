// ===================================
// SCRAPER AVANZATO + DIRETTA.IT API
// server-advanced.js v2.2.0 - Lightweight
// ===================================

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const NodeCache = require('node-cache');
const { scrapeDirettaLive, scrapeDirettaLiveOnly, scrapeDirettaLeague } = require('./parser-diretta-api');

const app = express();
const PORT = process.env.PORT || 3001;

// Cache: 30 secondi per FlashScore, 60 secondi per Diretta API
const cache = new NodeCache({ stdTTL: 30 });

let direttaCachedData = null;
let direttaLastFetch = null;
const DIRETTA_CACHE_DURATION = 60000; // 1 minuto

app.use(cors());
app.use(express.json());

// ===================================
// SCRAPER FLASHSCORE (PUPPETEER)
// ===================================

async function scrapeFlashScoreAdvanced() {
  let browser;
  try {
    console.log('🔍 Avvio scraping FlashScore...');
    
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
              events: []
            });
          }
        } catch (err) {
          console.error('Errore parsing:', err);
        }
      });
      
      return matches;
    });
    
    console.log(`✅ FlashScore: ${liveMatches.length} partite`);
    await browser.close();
    return liveMatches;
    
  } catch (error) {
    console.error('❌ Errore FlashScore:', error);
    if (browser) await browser.close();
    throw error;
  }
}

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
    
    console.log(`✅ Serie A: ${matches.length} partite`);
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

app.get('/', (req, res) => {
  const baseUrl = req.protocol + '://' + req.get('host');
  res.json({
    name: 'Pronostici Backend API',
    version: '2.2.0',
    status: 'online',
    features: [
      'FlashScore scraping with Puppeteer (heavy)',
      'Diretta.it API parser (lightweight, FAST)',
      'Smart caching (30s FlashScore, 60s Diretta)',
      'No browser needed for Diretta endpoints',
      'Real data from mobile API'
    ],
    endpoints: {
      health: `${baseUrl}/api/health`,
      stats: `${baseUrl}/api/stats`,
      liveScores: `${baseUrl}/api/live-scores (Puppeteer - slow)`,
      serieA: `${baseUrl}/api/live-scores/serie-a (Puppeteer - slow)`,
      league: `${baseUrl}/api/live-scores/league/:league (Puppeteer - slow)`,
      direttaLive: `${baseUrl}/api/diretta/live (API - FAST ⚡)`,
      direttaLeague: `${baseUrl}/api/diretta/league/:name (API - FAST ⚡)`,
      direttaStatus: `${baseUrl}/api/diretta/status/:status (API - FAST ⚡)`
    },
    recommendation: 'Use /api/diretta/* endpoints for better performance (no Puppeteer)'
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
// DIRETTA.IT API ENDPOINTS (LIGHTWEIGHT)
// ===================================

/**
 * GET /api/diretta/live
 * FAST: usa API mobile FlashScore (no Puppeteer)
 */
app.get('/api/diretta/live', async (req, res) => {
  try {
    const now = Date.now();
    
    // Cache check
    if (direttaCachedData && direttaLastFetch && (now - direttaLastFetch) < DIRETTA_CACHE_DURATION) {
      return res.json({
        timestamp: new Date().toISOString(),
        total: direttaCachedData.length,
        matches: direttaCachedData,
        cached: true,
        cacheAge: Math.floor((now - direttaLastFetch) / 1000),
        source: 'FlashScore Mobile API'
      });
    }

    // Fetch from API
    console.log('⚡ [API] Fetching from FlashScore API...');
    const matches = await scrapeDirettaLive();
    
    // Update cache
    direttaCachedData = matches;
    direttaLastFetch = now;

    res.json({
      timestamp: new Date().toISOString(),
      total: matches.length,
      matches: matches,
      cached: false,
      source: 'FlashScore Mobile API'
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch matches',
      message: error.message
    });
  }
});

/**
 * GET /api/diretta/league/:name
 * FAST: filtra per lega
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
      source: 'FlashScore Mobile API'
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/diretta/status/:status
 * FAST: filtra per status
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
      source: 'FlashScore Mobile API'
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
    version: '2.2.0'
  });
});

app.get('/api/stats', (req, res) => {
  const keys = cache.keys();
  res.json({
    version: '2.2.0',
    cached_endpoints: keys.length,
    keys: keys,
    uptime: process.uptime(),
    flashscore_puppeteer: {
      ttl_seconds: 30,
      note: 'Slow, uses browser'
    },
    diretta_api: {
      active: !!direttaCachedData,
      age_seconds: direttaLastFetch ? Math.floor((Date.now() - direttaLastFetch) / 1000) : null,
      matches_count: direttaCachedData?.length || 0,
      ttl_seconds: 60,
      note: 'FAST, no browser needed'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n⚡ Pronostici Backend v2.2.0 - LIGHTWEIGHT`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`\n📊 Endpoints:`);
  console.log(`\n   FLASHSCORE (Puppeteer - SLOW):`);
  console.log(`   ├─ GET /api/live-scores`);
  console.log(`   ├─ GET /api/live-scores/serie-a`);
  console.log(`   └─ GET /api/live-scores/league/:league`);
  console.log(`\n   DIRETTA API (No browser - FAST ⚡):`);
  console.log(`   ├─ GET /api/diretta/live`);
  console.log(`   ├─ GET /api/diretta/league/:name`);
  console.log(`   └─ GET /api/diretta/status/:status`);
  console.log(`\n   UTILITY:`);
  console.log(`   ├─ GET /api/health`);
  console.log(`   ├─ GET /api/stats`);
  console.log(`   └─ GET /`);
  console.log(`\n✨ Recommendation: Use /api/diretta/* for best performance!\n`);
});
