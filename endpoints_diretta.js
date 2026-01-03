// Aggiungi al tuo server.js

const axios = require('axios');
const DirettaParser = require('./DirettaParser');

// Cache per ridurre richieste
let cachedData = null;
let lastFetch = null;
const CACHE_DURATION = 60000; // 1 minuto

/**
 * Scarica HTML da Diretta.it
 */
async function fetchDirettaHTML() {
  const response = await axios.get('https://www.diretta.it/calcio/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
    }
  });
  return response.data;
}

/**
 * GET /api/diretta/live
 * Ottieni tutte le partite live da Diretta.it
 */
app.get('/api/diretta/live', async (req, res) => {
  try {
    const now = Date.now();
    
    // Usa cache se valida
    if (cachedData && lastFetch && (now - lastFetch) < CACHE_DURATION) {
      return res.json({
        ...cachedData,
        cached: true,
        cacheAge: Math.floor((now - lastFetch) / 1000)
      });
    }

    // Scarica e parsa
    console.log('Fetching from Diretta.it...');
    const html = await fetchDirettaHTML();
    const data = DirettaParser.parseMatches(html);
    
    // Aggiorna cache
    cachedData = data;
    lastFetch = now;

    res.json({
      ...data,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching Diretta.it:', error.message);
    res.status(500).json({
      error: 'Failed to fetch live matches',
      message: error.message
    });
  }
});

/**
 * GET /api/diretta/league/:name
 * Filtra partite per campionato
 */
app.get('/api/diretta/league/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!cachedData) {
      const html = await fetchDirettaHTML();
      cachedData = DirettaParser.parseMatches(html);
      lastFetch = Date.now();
    }

    const filtered = DirettaParser.filterByLeague(cachedData.matches, name);
    
    res.json({
      league: name,
      total: filtered.length,
      matches: filtered
    });
  } catch (error) {
    console.error('Error:', error.message);
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
    
    if (!cachedData) {
      const html = await fetchDirettaHTML();
      cachedData = DirettaParser.parseMatches(html);
      lastFetch = Date.now();
    }

    const filtered = DirettaParser.filterByStatus(cachedData.matches, status);
    
    res.json({
      status,
      total: filtered.length,
      matches: filtered
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
