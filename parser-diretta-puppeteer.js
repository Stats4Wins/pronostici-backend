/**
 * PARSER DIRETTA.IT AVANZATO CON PUPPETEER + ANTI-DETECTION
 * Simula browser reale per evitare blocchi
 */

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

/**
 * Configurazione anti-detection ottimizzata
 */
const PUPPETEER_CONFIG = {
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled', // Nasconde automazione
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-gpu',
    '--single-process',
    '--no-zygote',
    '--lang=it-IT'
  ],
  defaultViewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false
  },
  executablePath: null,
  headless: chromium.headless,
  ignoreHTTPSErrors: true
};

/**
 * Evasione rilevamento bot (stealth mode)
 */
async function setupStealthMode(page) {
  // Rimuovi flag webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
    
    // Override permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    
    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
          description: "Portable Document Format",
          filename: "internal-pdf-viewer",
          length: 1,
          name: "Chrome PDF Plugin"
        }
      ]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['it-IT', 'it', 'en-US', 'en']
    });
    
    // Chrome runtime
    window.chrome = {
      runtime: {}
    };
  });
  
  // Headers realistici
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0'
  });
  
  // User agent realistico
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
}

/**
 * Inizializza browser con stealth
 */
async function initBrowser() {
  PUPPETEER_CONFIG.executablePath = await chromium.executablePath();
  return await puppeteer.launch(PUPPETEER_CONFIG);
}

/**
 * Attendi caricamento con retry multipli
 */
async function waitForMatchesWithRetry(page, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  ⏳ Tentativo ${attempt}/${maxRetries}: attesa elementi...`);
      
      // Attendi sia il container che gli elementi
      await Promise.race([
        page.waitForSelector('[data-event-row="true"]', { timeout: 10000 }),
        page.waitForSelector('.event__match', { timeout: 10000 }),
        page.waitForSelector('[class*="event"][class*="match"]', { timeout: 10000 })
      ]);
      
      console.log(`  ✅ Elementi trovati al tentativo ${attempt}`);
      return true;
      
    } catch (err) {
      console.log(`  ⚠️ Tentativo ${attempt} fallito: ${err.message}`);
      
      if (attempt < maxRetries) {
        // Scroll per triggerare lazy loading
        await page.evaluate(() => {
          window.scrollBy(0, 500);
        });
        await page.waitForTimeout(2000);
      }
    }
  }
  
  return false;
}

/**
 * Scraper principale Diretta.it con anti-detection
 */
async function scrapeDirettaLive(leagueFilter = null) {
  let browser;
  const startTime = Date.now();
  
  try {
    console.log('🚀 [Diretta Stealth] Avvio scraper con anti-detection...');
    
    browser = await initBrowser();
    const page = await browser.newPage();
    
    // Setup stealth mode
    await setupStealthMode(page);
    
    // NON bloccare risorse per evitare sospetti
    console.log('📡 [Diretta] Caricamento pagina (modalità stealth)...');
    
    await page.goto('https://www.diretta.it/calcio/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Attendi caricamento JS
    await page.waitForTimeout(3000);
    
    // Chiudi popup cookie se presente
    try {
      await page.evaluate(() => {
        const selectors = [
          '#onetrust-accept-btn-handler',
          '[id*="cookie"][id*="accept"]',
          '[class*="cookie"][class*="accept"]',
          'button[id*="consent"]',
          '.consent-accept'
        ];
        
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.click();
            break;
          }
        }
      });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('  ℹ️ Nessun popup cookie da chiudere');
    }
    
    console.log('🔍 [Diretta] Ricerca elementi partite...');
    
    // Attendi elementi con retry
    const found = await waitForMatchesWithRetry(page);
    
    if (!found) {
      // Fallback: prova URL alternativo
      console.log('⚠️ [Diretta] Nessun elemento trovato, provo URL alternativo...');
      await page.goto('https://www.flashscore.it/calcio/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(3000);
    }
    
    console.log('📊 [Diretta] Estrazione dati...');
    
    // Estrai partite usando selettori multipli
    const matches = await page.evaluate((filter) => {
      const results = [];
      
      // Selettori multipli per compatibilità
      const matchSelectors = [
        '[data-event-row="true"]',
        '.event__match',
        '[class*="eventmatch"]'
      ];
      
      let matchElements = [];
      for (const selector of matchSelectors) {
        matchElements = document.querySelectorAll(selector);
        if (matchElements.length > 0) {
          console.log(`Found ${matchElements.length} matches with selector: ${selector}`);
          break;
        }
      }
      
      if (matchElements.length === 0) {
        console.error('No match elements found with any selector');
        return [];
      }
      
      matchElements.forEach((matchEl, index) => {
        try {
          // Prova diversi metodi di estrazione
          let homeTeam, awayTeam, homeScore, awayScore, status, minute, league;
          
          // Metodo 1: data-testid (Diretta.it)
          const participants = matchEl.querySelectorAll('[data-testid="wcl-matchRow-participant"]');
          if (participants.length >= 2) {
            homeTeam = participants[0].querySelector('[data-testid="wcl-scores-simple-text-01"]')?.textContent?.trim();
            awayTeam = participants[1].querySelector('[data-testid="wcl-scores-simple-text-01"]')?.textContent?.trim();
          }
          
          // Metodo 2: classi FlashScore
          if (!homeTeam || !awayTeam) {
            homeTeam = matchEl.querySelector('.event__participant--home')?.textContent?.trim();
            awayTeam = matchEl.querySelector('.event__participant--away')?.textContent?.trim();
          }
          
          if (!homeTeam || !awayTeam) return;
          
          // Punteggi
          const scoreEls = matchEl.querySelectorAll('[data-testid="wcl-matchRowScore"]');
          if (scoreEls.length >= 2) {
            homeScore = scoreEls[0]?.textContent?.trim();
            awayScore = scoreEls[1]?.textContent?.trim();
          } else {
            homeScore = matchEl.querySelector('.event__score--home')?.textContent?.trim();
            awayScore = matchEl.querySelector('.event__score--away')?.textContent?.trim();
          }
          
          homeScore = (homeScore && homeScore !== '-') ? parseInt(homeScore) : null;
          awayScore = (awayScore && awayScore !== '-') ? parseInt(awayScore) : null;
          
          // Status
          const isLive = matchEl.classList.contains('eventmatch--live') || 
                        matchEl.classList.contains('event__match--live') ||
                        matchEl.querySelector('[data-state="live"]') !== null;
          
          status = isLive ? 'LIVE' : 'SCHEDULED';
          
          // Minuto
          if (isLive) {
            const stageEl = matchEl.querySelector('.eventstage--block, .event__stage');
            if (stageEl) {
              const text = stageEl.textContent.trim();
              const minMatch = text.match(/(\d+)/);
              if (minMatch) minute = minMatch[1] + "'";
            }
          } else {
            const timeEl = matchEl.querySelector('.eventtime, .event__time');
            if (timeEl) minute = timeEl.textContent.trim();
          }
          
          // Lega
          let prevElement = matchEl.previousElementSibling;
          let attempts = 0;
          league = 'Unknown';
          
          while (prevElement && attempts < 20) {
            if (prevElement.classList.contains('headerLeague') || 
                prevElement.classList.contains('event__header')) {
              const leagueEl = prevElement.querySelector('[data-testid="wcl-scores-simple-text-01"], .event__title--name');
              if (leagueEl) {
                league = leagueEl.textContent.trim();
                break;
              }
            }
            prevElement = prevElement.previousElementSibling;
            attempts++;
          }
          
          // Filtra per lega
          if (filter && !league.toLowerCase().includes(filter.toLowerCase())) {
            return;
          }
          
          // URL
          const linkEl = matchEl.querySelector('a.eventRowLink, a[href*="partita"]');
          let matchUrl = null;
          if (linkEl) {
            const href = linkEl.getAttribute('href');
            matchUrl = href.startsWith('http') ? href : `https://www.diretta.it${href}`;
          }
          
          const matchId = matchUrl ? matchUrl.split('?mid=')[1] || `match_${index}` : `match_${index}`;
          
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
          console.error(`Error parsing match ${index}:`, err.message);
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
