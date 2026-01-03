/**
 * PARSER DIRETTA.IT AVANZATO CON PUPPETEER
 * Estrae dati reali usando rendering JavaScript
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

/**
 * Configurazione ottimizzata per Render.com
 */
const PUPPETEER_CONFIG = {
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
    '--no-zygote'
  ],
  defaultViewport: chromium.defaultViewport,
  executablePath: null, // Sarà impostato dinamicamente
  headless: chromium.headless
};

/**
 * Inizializza browser Puppeteer
 */
async function initBrowser() {
  PUPPETEER_CONFIG.executablePath = await chromium.executablePath();
  return await puppeteer.launch(PUPPETEER_CONFIG);
}

/**
 * Scraper principale Diretta.it
 */
async function scrapeDirettaLive(leagueFilter = null) {
  let browser;
  const startTime = Date.now();
  
  try {
    console.log('🚀 [Diretta Puppeteer] Avvio scraper avanzato...');
    
    browser = await initBrowser();
    const page = await browser.newPage();
    
    // Headers realistici
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Blocca risorse non necessarie per velocità
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    console.log('📡 [Diretta] Caricamento pagina...');
    await page.goto('https://www.diretta.it/calcio/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Attendi il caricamento dei match
    await page.waitForSelector('[data-event-row="true"]', { timeout: 15000 });
    
    // Chiudi eventuali popup cookie
    try {
      await page.evaluate(() => {
        const cookieBtn = document.querySelector('[id*="cookie"], [class*="cookie"], [id*="consent"]');
        if (cookieBtn) cookieBtn.click();
      });
    } catch (e) {}
    
    console.log('🔍 [Diretta] Estrazione dati...');
    
    // Estrai tutti i match
    const matches = await page.evaluate((filter) => {
      const results = [];
      
      // Trova tutte le partite
      const matchElements = document.querySelectorAll('[data-event-row="true"]');
      
      matchElements.forEach((matchEl) => {
        try {
          // Squadre
          const participants = matchEl.querySelectorAll('[data-testid="wcl-matchRow-participant"]');
          if (participants.length < 2) return;
          
          const homeTeam = participants[0].querySelector('[data-testid="wcl-scores-simple-text-01"]')?.textContent?.trim();
          const awayTeam = participants[1].querySelector('[data-testid="wcl-scores-simple-text-01"]')?.textContent?.trim();
          
          if (!homeTeam || !awayTeam) return;
          
          // Punteggi
          const scores = matchEl.querySelectorAll('[data-testid="wcl-matchRowScore"]');
          let homeScore = scores[0]?.textContent?.trim();
          let awayScore = scores[1]?.textContent?.trim();
          
          // Converti '-' in null
          homeScore = (homeScore && homeScore !== '-') ? parseInt(homeScore) : null;
          awayScore = (awayScore && awayScore !== '-') ? parseInt(awayScore) : null;
          
          // Status
          const isLive = matchEl.classList.contains('eventmatch--live') || 
                        matchEl.querySelector('[data-state="live"]') !== null;
          
          const status = isLive ? 'LIVE' : 'SCHEDULED';
          
          // Minuto o orario
          let minute = null;
          if (isLive) {
            // Cerca minuto
            const stageEl = matchEl.querySelector('.eventstage--block');
            if (stageEl) {
              const text = stageEl.textContent.trim();
              const minMatch = text.match(/(\d+)/);
              if (minMatch) minute = minMatch[1] + "'";
            }
          } else {
            // Orario programmato
            const timeEl = matchEl.querySelector('.eventtime');
            if (timeEl) minute = timeEl.textContent.trim();
          }
          
          // Trova lega (risale nell'HTML)
          let league = 'Unknown';
          let prevElement = matchEl.previousElementSibling;
          let attempts = 0;
          
          while (prevElement && attempts < 20) {
            if (prevElement.classList.contains('headerLeague')) {
              const leagueEl = prevElement.querySelector('[data-testid="wcl-scores-simple-text-01"]');
              if (leagueEl) {
                league = leagueEl.textContent.trim();
                break;
              }
            }
            prevElement = prevElement.previousElementSibling;
            attempts++;
          }
          
          // Filtra per lega se richiesto
          if (filter && !league.toLowerCase().includes(filter.toLowerCase())) {
            return;
          }
          
          // URL partita
          const linkEl = matchEl.querySelector('a.eventRowLink');
          const matchUrl = linkEl ? `https://www.diretta.it${linkEl.getAttribute('href')}` : null;
          
          // ID dalla URL
          const matchId = matchUrl ? matchUrl.split('?mid=')[1] : null;
          
          results.push({
            id: matchId,
            homeTeam,
            awayTeam,
            homeScore,
            awayScore,
            status,
            minute,
            league,
            url: matchUrl
          });
          
        } catch (err) {
          console.error('Errore parsing match:', err.message);
        }
      });
      
      return results;
    }, leagueFilter);
    
    await browser.close();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Diretta] ${matches.length} partite estratte in ${elapsed}s`);
    
    return matches;
    
  } catch (error) {
    console.error('❌ [Diretta] Errore scraping:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Filtra solo partite live
 */
async function scrapeDirettaLiveOnly() {
  const allMatches = await scrapeDirettaLive();
  return allMatches.filter(m => m.status === 'LIVE');
}

/**
 * Filtra per lega specifica
 */
async function scrapeDirettaLeague(leagueName) {
  return await scrapeDirettaLive(leagueName);
}

module.exports = {
  scrapeDirettaLive,
  scrapeDirettaLiveOnly,
  scrapeDirettaLeague
};
