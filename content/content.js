// ============================================================
// Upwork Job Shortlister - Content Script
// ============================================================

(function () {
  'use strict';

  // ----------------------------------------------------------
  // Selector config - single place to update when Upwork changes DOM
  // ----------------------------------------------------------
  const SELECTORS = {
    // Search results page
    search: {
      jobCard: '[data-test="JobsList"] article, [data-test="job-tile-list"] article, .job-tile, section.air3-card-section, .notifications-list__item',
      // Last fallback (bare a[href]) is for /ab/notifications job-alert rows,
      // which render the title as a plain link with no heading wrapper.
      jobTitle: '[data-test="job-tile-title-link UpLink"], h2 a, a.job-tile-title, h3.job-tile-title a, h3 a[href*="/jobs/"][href*="~"], a[href*="/jobs/"][href*="~"]',
      jobBudget: '[data-test="is-fixed-price"], [data-test="job-type-label"]',
      jobPosted: '[data-test="job-pubilshed-date"]',
      jobSkills: '[data-test="token"] .air3-token, [data-test="TokenClamp JobAttrs"] .air3-token',
      jobDescription: '[data-test="UpCLineClamp JobDescription"]',
      jobLocation: '[data-test="location"]',
    },
    // Job detail page
    detail: {
      title: 'h4.m-0, header h4, [data-test="JobDescription"] h4, .job-details-header h4',
      budget: '[data-test="BudgetAmount"], [data-test="job-type-label"], .budget-amount',
      budgetType: '[data-test="job-type-label"]',
      clientCountry: '[data-test="client-country"], .client-location, [data-test="LocationLabel"]',
      postedDate: '[data-test="PostedOn"], [data-test="job-pubilshed-date"], .posted-on',
      skills: '[data-test="token"] .air3-token, .up-skill-badge, [data-test="TokenClamp SkillsBadge"] .air3-token, a.air3-token',
      description: '[data-test="Description"] .break, [data-test="JobDescription"], .job-description',
    },
  };

  // ----------------------------------------------------------
  // Page type detection
  // ----------------------------------------------------------
  function getPageType() {
    const path = window.location.pathname;
    const search = window.location.search;
    if (
      path.includes('/search/jobs') ||
      path.includes('/nx/search/jobs') ||
      path.startsWith('/nx/find-work') ||
      (path.startsWith('/ab/notifications') && /[?&]tab=job_alerts\b/.test(search))
    ) {
      return 'search';
    }
    if (path.match(/\/jobs\/.*~\d+/)) {
      return 'detail';
    }
    return null;
  }

  function getJobIdFromUrl(url) {
    const match = (url || window.location.href).match(/~(\d{10,})/);
    return match ? '~' + match[1] : null;
  }

  // ----------------------------------------------------------
  // Scraping helpers
  // ----------------------------------------------------------
  function safeText(parent, selector) {
    try {
      const el = parent.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function safeTextMulti(parent, selectorString) {
    const selectors = selectorString.split(',').map(s => s.trim());
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (e) {
        // try next selector
      }
    }
    return null;
  }

  function safeHref(parent, selectorString) {
    const selectors = selectorString.split(',').map(s => s.trim());
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el && el.href) {
          return el.href;
        }
      } catch (e) {
        // try next selector
      }
    }
    return null;
  }

  function safeListText(parent, selectorString) {
    const selectors = selectorString.split(',').map(s => s.trim());
    for (const sel of selectors) {
      try {
        const els = parent.querySelectorAll(sel);
        if (els.length > 0) {
          return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
        }
      } catch (e) {
        // try next selector
      }
    }
    return [];
  }

  // Convert "posted X ago" text to an absolute timestamp
  function parsePostedDate(text) {
    if (!text) return null;
    const lower = text.toLowerCase().replace('posted', '').trim();
    const now = Date.now();
    const MS = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, quarter: 7776000000 };

    // Match patterns like "2 hours ago", "last month", "yesterday", "3 quarters ago"
    const match = lower.match(/(\d+)\s*(minute|hour|day|week|month|quarter)s?\s*ago/);
    if (match) {
      const num = parseInt(match[1]);
      const unit = match[2];
      return now - num * (MS[unit] || 0);
    }
    if (lower.includes('yesterday')) return now - MS.day;
    if (lower.includes('just now') || lower.includes('moment')) return now;
    if (lower.match(/last\s+month/)) return now - MS.month;
    if (lower.match(/last\s+week/)) return now - MS.week;
    if (lower.match(/last\s+quarter/)) return now - MS.quarter;

    return null;
  }

  function detectBudgetType(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes('hourly') || lower.includes('/hr')) return 'hourly';
    if (lower.includes('fixed')) return 'fixed';
    return null;
  }

  // ----------------------------------------------------------
  // Scrape job detail page
  // ----------------------------------------------------------
  function scrapeDetailPage() {
    const s = SELECTORS.detail;
    const title = safeTextMulti(document, s.title);
    const budget = safeTextMulti(document, s.budget);
    const budgetTypeText = safeTextMulti(document, s.budgetType);
    const clientCountry = safeTextMulti(document, s.clientCountry);
    const postedDate = safeTextMulti(document, s.postedDate);
    const skills = safeListText(document, s.skills);
    const descEl = document.querySelector(s.description.split(',')[0]) ||
                   document.querySelector(s.description.split(',')[1]) ||
                   document.querySelector(s.description.split(',')[2]);
    const fullDesc = descEl ? descEl.textContent.trim() : '';
    const descriptionSnippet = fullDesc.substring(0, 200);

    return {
      title,
      budget,
      budgetType: detectBudgetType(budgetTypeText || budget),
      clientCountry,
      postedDate,
      postedTimestamp: parsePostedDate(postedDate),
      skills,
      descriptionSnippet,
    };
  }

  // ----------------------------------------------------------
  // Scrape a single search result card
  // ----------------------------------------------------------
  function scrapeSearchCard(card) {
    const s = SELECTORS.search;
    const title = safeTextMulti(card, s.jobTitle);
    const href = safeHref(card, s.jobTitle);
    const budget = safeTextMulti(card, s.jobBudget);
    const postedDate = safeTextMulti(card, s.jobPosted);
    const skills = safeListText(card, s.jobSkills);
    const descriptionSnippet = (safeTextMulti(card, s.jobDescription) || '').substring(0, 200);
    const clientCountry = safeTextMulti(card, s.jobLocation);

    const id = href ? getJobIdFromUrl(href) : null;
    const url = href ? href.split('?')[0] : null;

    return {
      id,
      url,
      title,
      budget,
      budgetType: detectBudgetType(budget),
      clientCountry,
      postedDate,
      postedTimestamp: parsePostedDate(postedDate),
      skills,
      descriptionSnippet,
    };
  }

  // ----------------------------------------------------------
  // Storage helpers
  // ----------------------------------------------------------
  function contextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  function getJobs() {
    if (!contextValid()) return Promise.resolve({});
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => resolve(result.jobs));
    });
  }

  function saveJob(job) {
    if (!contextValid()) return Promise.resolve();
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => {
        const jobs = result.jobs;
        jobs[job.id] = job;
        chrome.storage.local.set({ jobs }, resolve);
      });
    });
  }

  function removeJob(jobId) {
    if (!contextValid()) return Promise.resolve();
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => {
        const jobs = result.jobs;
        delete jobs[jobId];
        chrome.storage.local.set({ jobs }, resolve);
      });
    });
  }

  function isShortlisted(jobId) {
    if (!contextValid()) return Promise.resolve(false);
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => {
        resolve(!!result.jobs[jobId]);
      });
    });
  }

  function getLastActionDate() {
    if (!contextValid()) return Promise.resolve(null);
    return new Promise(resolve => {
      chrome.storage.local.get({ lastActionDate: null }, result => resolve(result.lastActionDate));
    });
  }

  function setLastActionDate(dateStr) {
    if (!contextValid()) return Promise.resolve();
    return new Promise(resolve => {
      chrome.storage.local.set({ lastActionDate: dateStr }, resolve);
    });
  }

  function getTodayDateStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function showStaleListModal(itemCount) {
    return new Promise(resolve => {
      const host = document.createElement('div');
      host.className = 'ujs-stale-modal-host';
      const shadow = host.attachShadow({ mode: 'closed' });

      shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .modal {
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            padding: 24px;
            max-width: 360px;
            width: 90vw;
            text-align: center;
          }
          .modal h3 {
            margin: 0 0 8px;
            font-size: 16px;
            font-weight: 600;
            color: #111827;
          }
          .modal p {
            margin: 0 0 20px;
            font-size: 13px;
            color: #6b7280;
            line-height: 1.5;
          }
          .modal-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
          }
          .btn {
            padding: 8px 18px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
          }
          .btn-clear {
            background: #dc2626;
            color: #fff;
            border-color: #dc2626;
          }
          .btn-clear:hover {
            background: #b91c1c;
          }
          .btn-keep {
            background: #fff;
            color: #374151;
          }
          .btn-keep:hover {
            background: #f3f4f6;
          }
        </style>
        <div class="backdrop">
          <div class="modal">
            <h3>Previous items found</h3>
            <p>You have ${itemCount} item${itemCount !== 1 ? 's' : ''} on your list from a previous session. Start fresh or keep adding?</p>
            <div class="modal-actions">
              <button class="btn btn-clear" id="clearBtn">Clear & continue</button>
              <button class="btn btn-keep" id="keepBtn">Keep adding</button>
            </div>
          </div>
        </div>
      `;

      function cleanup(result) {
        host.remove();
        resolve(result);
      }

      shadow.getElementById('clearBtn').addEventListener('click', () => cleanup('clear'));
      shadow.getElementById('keepBtn').addEventListener('click', () => cleanup('keep'));

      document.body.appendChild(host);
    });
  }

  let staleCheckPromise = null;

  async function checkStaleList() {
    // If a check is already in progress (another button clicked while modal open), wait for it
    if (staleCheckPromise) return staleCheckPromise;

    const today = getTodayDateStr();
    const lastDate = await getLastActionDate();

    // Same day - no check needed
    if (lastDate === today) return;

    const jobs = await getJobs();
    const itemCount = Object.keys(jobs).length;

    // No existing items - just update the date
    if (itemCount === 0) {
      await setLastActionDate(today);
      return;
    }

    // Different day + items exist - show modal
    staleCheckPromise = showStaleListModal(itemCount).then(async (choice) => {
      if (choice === 'clear') {
        await new Promise(resolve => {
          chrome.storage.local.set({ jobs: {} }, resolve);
        });
      }
      await setLastActionDate(today);
      staleCheckPromise = null;
    });

    return staleCheckPromise;
  }

  // ----------------------------------------------------------
  // Shortlist + reject buttons on SEARCH RESULTS
  // ----------------------------------------------------------
  function createSearchButtons(jobData, existingJob, card) {
    const wrap = document.createElement('div');
    wrap.className = 'ujs-btn-group';
    wrap.dataset.ujsJobId = jobData.id;

    const addBtn = document.createElement('button');
    addBtn.className = 'ujs-shortlist-btn';
    addBtn.title = 'Add to shortlist';

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'ujs-reject-btn';
    rejectBtn.title = 'Reject';

    wrap.appendChild(addBtn);
    wrap.appendChild(rejectBtn);

    function applyState(job) {
      // Reset all states
      addBtn.classList.remove('ujs-shortlisted', 'ujs-applied');
      rejectBtn.classList.remove('ujs-rejected');
      if (card) {
        card.classList.remove('ujs-card-rejected', 'ujs-card-shortlisted', 'ujs-card-applied');
      }

      if (!job) {
        addBtn.textContent = '+';
        rejectBtn.textContent = '\u00d7';
      } else if (job.status === 'rejected') {
        addBtn.textContent = '\u2713';
        rejectBtn.textContent = '\u00d7';
        rejectBtn.classList.add('ujs-rejected');
        if (card) card.classList.add('ujs-card-rejected');
      } else if (job.status === 'applied') {
        addBtn.textContent = '\u2709';
        addBtn.classList.add('ujs-applied');
        rejectBtn.textContent = '\u00d7';
        if (card) card.classList.add('ujs-card-applied');
      } else {
        addBtn.textContent = '\u2713';
        addBtn.classList.add('ujs-shortlisted');
        rejectBtn.textContent = '\u00d7';
        if (card) card.classList.add('ujs-card-shortlisted');
      }
    }

    applyState(existingJob);

    addBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!jobData.id) return;
      await checkStaleList();
      const jobs = await getJobs();
      const existing = jobs[jobData.id];

      // Toggle off - remove from list if already shortlisted/rated
      if (existing && existing.status !== 'rejected') {
        await removeJob(jobData.id);
        applyState(null);
        return;
      }

      const job = {
        ...jobData,
        shortlistedAt: Date.now(),
        status: 'shortlisted',
        rating: null,
      };
      await saveJob(job);
      applyState(job);
    });

    rejectBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!jobData.id) return;
      await checkStaleList();
      const jobs = await getJobs();
      const existing = jobs[jobData.id];

      // Toggle off - unreject
      if (existing && existing.status === 'rejected') {
        await removeJob(jobData.id);
        applyState(null);
        return;
      }

      const job = existing || {
        ...jobData,
        shortlistedAt: Date.now(),
        rating: null,
      };
      job.status = 'rejected';
      await saveJob(job);
      applyState(job);
    });

    // Expose applyState so storage listener can update
    wrap._applyState = applyState;

    return wrap;
  }

  async function injectSearchButtons() {
    const selectorString = SELECTORS.search.jobCard;
    const selectors = selectorString.split(',').map(s => s.trim());
    let cards = [];
    for (const sel of selectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length > 0) break;
    }

    const jobs = await getJobs();

    cards.forEach(card => {
      if (card.querySelector('.ujs-btn-group')) return;

      const jobData = scrapeSearchCard(card);
      if (!jobData.id) return;

      const existingJob = jobs[jobData.id] || null;
      const wrap = createSearchButtons(jobData, existingJob, card);

      card.style.position = card.style.position || 'relative';
      card.appendChild(wrap);
    });
  }

  // ----------------------------------------------------------
  // Shortlist button on JOB DETAIL page
  // ----------------------------------------------------------
  async function injectDetailButton() {
    if (document.querySelector('.ujs-detail-btn')) return;

    const jobId = getJobIdFromUrl();
    if (!jobId) return;

    const alreadyShortlisted = await isShortlisted(jobId);

    const btn = document.createElement('button');
    btn.className = 'ujs-detail-btn';
    btn.dataset.ujsJobId = jobId;

    function updateDetailBtn(shortlisted) {
      btn.textContent = shortlisted ? '\u2713 Shortlisted' : '\u2605 Shortlist';
      btn.classList.toggle('ujs-shortlisted', shortlisted);
    }

    updateDetailBtn(alreadyShortlisted);

    btn.addEventListener('click', async () => {
      const already = await isShortlisted(jobId);
      if (already) return;

      const scraped = scrapeDetailPage();
      const job = {
        id: jobId,
        url: window.location.href.split('?')[0],
        ...scraped,
        shortlistedAt: Date.now(),
        status: 'shortlisted',
        rating: null,
      };
      await saveJob(job);
      updateDetailBtn(true);
    });

    document.body.appendChild(btn);
  }

  // ----------------------------------------------------------
  // Review overlay (Shadow DOM) on JOB DETAIL page
  // ----------------------------------------------------------
  async function injectReviewOverlay() {
    if (document.querySelector('.ujs-review-host')) return;

    const jobId = getJobIdFromUrl();
    if (!jobId) return;

    const jobs = await getJobs();
    const job = jobs[jobId];
    if (!job) return; // Only show overlay for shortlisted jobs

    const host = document.createElement('div');
    host.className = 'ujs-review-host';
    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .overlay {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 280px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          z-index: 999999;
          overflow: hidden;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .overlay.minimized {
          width: auto;
          border-radius: 50%;
        }
        .overlay.minimized .overlay-body { display: none; }
        .overlay.minimized .overlay-header { border: none; padding: 10px; }
        .overlay-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #14532d;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .overlay-header span { flex: 1; }
        .minimize-btn {
          background: none;
          border: none;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
          padding: 0 4px;
          opacity: 0.8;
        }
        .minimize-btn:hover { opacity: 1; }
        .overlay-body {
          padding: 14px;
        }
        .stars {
          display: flex;
          gap: 4px;
          margin-bottom: 12px;
          justify-content: center;
        }
        .star {
          font-size: 28px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 2px;
          color: #d1d5db;
          transition: color 0.15s, transform 0.15s;
          line-height: 1;
        }
        .star:hover { transform: scale(1.15); }
        .star.active { color: #f59e0b; }
        .actions {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .btn {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.15s;
        }
        .btn:hover { background: #f3f4f6; }
        .btn-reject {
          color: #dc2626;
          border-color: #fecaca;
        }
        .btn-reject:hover { background: #fef2f2; }
        .btn-reject.active {
          background: #dc2626;
          color: #fff;
          border-color: #dc2626;
        }
        .btn-restore {
          color: #059669;
          border-color: #a7f3d0;
        }
        .btn-restore:hover { background: #ecfdf5; }
        .status-text {
          text-align: center;
          font-size: 11px;
          color: #6b7280;
          margin-top: 8px;
        }
      </style>
      <div class="overlay" id="overlay">
        <div class="overlay-header" id="header">
          <span>Review Job</span>
          <button class="minimize-btn" id="minimizeBtn">_</button>
        </div>
        <div class="overlay-body">
          <div class="stars" id="stars">
            <button class="star" data-rating="1">\u2605</button>
            <button class="star" data-rating="2">\u2605</button>
            <button class="star" data-rating="3">\u2605</button>
            <button class="star" data-rating="4">\u2605</button>
            <button class="star" data-rating="5">\u2605</button>
          </div>
          <div class="actions" id="actions">
            <button class="btn btn-reject" id="rejectBtn">Reject</button>
          </div>
          <div class="status-text" id="statusText"></div>
        </div>
      </div>
    `;

    const overlay = shadow.getElementById('overlay');
    const stars = shadow.querySelectorAll('.star');
    const rejectBtn = shadow.getElementById('rejectBtn');
    const statusText = shadow.getElementById('statusText');
    const minimizeBtn = shadow.getElementById('minimizeBtn');
    const actionsDiv = shadow.getElementById('actions');

    // Restore state
    function renderState(j) {
      stars.forEach(s => {
        const val = parseInt(s.dataset.rating);
        s.classList.toggle('active', j.rating && val <= j.rating);
      });

      if (j.status === 'rejected') {
        rejectBtn.classList.add('active');
        rejectBtn.textContent = 'Rejected';
        // Add restore button if not present
        if (!shadow.getElementById('restoreBtn')) {
          const restoreBtn = document.createElement('button');
          restoreBtn.className = 'btn btn-restore';
          restoreBtn.id = 'restoreBtn';
          restoreBtn.textContent = 'Restore';
          restoreBtn.addEventListener('click', async () => {
            const jobs = await getJobs();
            const current = jobs[jobId];
            if (current) {
              current.status = 'shortlisted';
              await saveJob(current);
              renderState(current);
            }
          });
          actionsDiv.appendChild(restoreBtn);
        }
        statusText.textContent = 'This job has been rejected';
      } else {
        rejectBtn.classList.remove('active');
        rejectBtn.textContent = 'Reject';
        const existing = shadow.getElementById('restoreBtn');
        if (existing) existing.remove();
        if (j.rating) {
          statusText.textContent = 'Rated ' + j.rating + '/5';
        } else {
          statusText.textContent = '';
        }
      }
    }

    renderState(job);

    // Star click
    stars.forEach(starBtn => {
      starBtn.addEventListener('click', async () => {
        const rating = parseInt(starBtn.dataset.rating);
        const jobs = await getJobs();
        const current = jobs[jobId];
        if (!current) return;
        current.rating = rating;
        current.status = 'rated';
        await saveJob(current);
        renderState(current);
      });
    });

    // Reject click
    rejectBtn.addEventListener('click', async () => {
      const jobs = await getJobs();
      const current = jobs[jobId];
      if (!current) return;
      if (current.status === 'rejected') return;
      current.status = 'rejected';
      await saveJob(current);
      renderState(current);
    });

    // Minimize toggle
    let minimized = false;
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimized = !minimized;
      overlay.classList.toggle('minimized', minimized);
      minimizeBtn.textContent = minimized ? '\u2605' : '_';
    });

    document.body.appendChild(host);
  }

  // ----------------------------------------------------------
  // Auto-detect application status on job detail pages
  // ----------------------------------------------------------
  async function detectAppliedStatus() {
    if (!contextValid()) return;
    const jobId = getJobIdFromUrl();
    if (!jobId) return;

    const jobs = await getJobs();
    const job = jobs[jobId];
    if (!job) return;
    if (job.status === 'applied') return;

    // Check for "already submitted a proposal" or "View Proposal" link
    const bodyText = document.body.innerText.toLowerCase();
    const hasSubmitted = bodyText.includes('already submitted a proposal') ||
                         bodyText.includes('already applied') ||
                         bodyText.includes('view proposal');

    if (hasSubmitted) {
      job.status = 'applied';
      await saveJob(job);
    }
  }

  // Detect application on proposal/confirmation pages
  // After submitting, Upwork may show a confirmation on /proposals/job/~ID or similar
  async function detectAppliedOnProposalPage() {
    if (!contextValid()) return;
    const path = window.location.pathname;

    // Extract job ID from proposal page URL (e.g. /proposals/job/~0123456789/)
    const jobId = getJobIdFromUrl(window.location.href);
    if (!jobId) return;

    const jobs = await getJobs();
    const job = jobs[jobId];
    if (!job || job.status === 'applied') return;

    const bodyText = document.body.innerText.toLowerCase();
    const isConfirmation = bodyText.includes('proposal submitted') ||
                           bodyText.includes('your proposal') ||
                           bodyText.includes('submitted successfully') ||
                           bodyText.includes('already submitted a proposal') ||
                           bodyText.includes('view proposal');

    if (isConfirmation) {
      job.status = 'applied';
      await saveJob(job);
    }
  }

  // Watch for DOM changes that indicate a submission confirmation appeared
  function watchForApplicationConfirmation() {
    let debounceTimer = null;

    const check = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const path = window.location.pathname;
        const isProposalPage = path.includes('/proposals/') || path.includes('/apply/');
        const isDetailPage = !!path.match(/\/jobs\/.*~\d+/);

        if (isProposalPage) {
          detectAppliedOnProposalPage();
        } else if (isDetailPage) {
          detectAppliedStatus();
        }
      }, 1500);
    };

    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    check();
  }

  // ----------------------------------------------------------
  // MutationObserver for infinite scroll
  // ----------------------------------------------------------
  function observeSearchResults() {
    const observer = new MutationObserver(() => {
      injectSearchButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ----------------------------------------------------------
  // Listen for storage changes to update button states
  // ----------------------------------------------------------
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.jobs) return;
    const newJobs = changes.jobs.newValue || {};

    // Update search button groups
    document.querySelectorAll('.ujs-btn-group').forEach(wrap => {
      const id = wrap.dataset.ujsJobId;
      if (wrap._applyState) {
        wrap._applyState(newJobs[id] || null);
      }
    });

    // Update detail button
    const detailBtn = document.querySelector('.ujs-detail-btn');
    if (detailBtn) {
      const id = detailBtn.dataset.ujsJobId;
      const shortlisted = !!newJobs[id];
      detailBtn.textContent = shortlisted ? '\u2713 Shortlisted' : '\u2605 Shortlist';
      detailBtn.classList.toggle('ujs-shortlisted', shortlisted);
    }
  });

  // ----------------------------------------------------------
  // Initialization
  // ----------------------------------------------------------
  function init() {
    const pageType = getPageType();

    if (pageType === 'search') {
      injectSearchButtons();
      observeSearchResults();
    } else if (pageType === 'detail') {
      injectDetailButton();
      injectReviewOverlay();
      setTimeout(detectAppliedStatus, 1000);
    }
    watchForApplicationConfirmation();
  }

  // Upwork is an SPA - re-init on URL changes
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Small delay to let the SPA render
      setTimeout(init, 500);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Initial run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
