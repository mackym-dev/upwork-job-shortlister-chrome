// ==========================================================
// Upwork Job Shortlister - Popup
// ==========================================================

(function () {
  'use strict';

  const jobListEl = document.getElementById('jobList');
  const emptyEl = document.getElementById('empty');
  const statsEl = document.getElementById('stats');
  const sortByEl = document.getElementById('sortBy');
  const filterByEl = document.getElementById('filterBy');
  const openAllBtn = document.getElementById('openAllBtn');
  const clearBtn = document.getElementById('clearBtn');
  const clearConfirm = document.getElementById('clearConfirm');
  const clearYes = document.getElementById('clearYes');
  const clearNo = document.getElementById('clearNo');

  // ----------------------------------------------------------
  // Storage helpers
  // ----------------------------------------------------------
  function getJobs() {
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => resolve(result.jobs));
    });
  }

  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get({
        settings: { sortBy: 'rating', filterBy: 'all' }
      }, result => resolve(result.settings));
    });
  }

  function saveSettings(settings) {
    return new Promise(resolve => {
      chrome.storage.local.set({ settings }, resolve);
    });
  }

  function removeJob(jobId) {
    return new Promise(resolve => {
      chrome.storage.local.get({ jobs: {} }, result => {
        const jobs = result.jobs;
        delete jobs[jobId];
        chrome.storage.local.set({ jobs }, resolve);
      });
    });
  }

  function clearAllJobs() {
    return new Promise(resolve => {
      chrome.storage.local.set({ jobs: {} }, resolve);
    });
  }

  // ----------------------------------------------------------
  // Sorting and filtering
  // ----------------------------------------------------------
  function sortJobs(jobs, sortBy) {
    return jobs.sort((a, b) => {
      // Rejected always last
      if (a.status === 'rejected' && b.status !== 'rejected') return 1;
      if (b.status === 'rejected' && a.status !== 'rejected') return -1;

      switch (sortBy) {
        case 'rating':
          const rA = a.rating || 0;
          const rB = b.rating || 0;
          if (rB !== rA) return rB - rA;
          return (b.shortlistedAt || 0) - (a.shortlistedAt || 0);

        case 'shortlistedAt':
          return (b.shortlistedAt || 0) - (a.shortlistedAt || 0);

        case 'title':
          return (a.title || '').localeCompare(b.title || '');

        default:
          return 0;
      }
    });
  }

  function filterJobs(jobs, filterBy) {
    switch (filterBy) {
      case 'unrated':
        return jobs.filter(j => j.status === 'shortlisted');
      case 'rated':
        return jobs.filter(j => j.status === 'rated');
      case 'applied':
        return jobs.filter(j => j.status === 'applied');
      case 'rejected':
        return jobs.filter(j => j.status === 'rejected');
      default:
        return jobs;
    }
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  function timeAgo(timestamp) {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(diff / 604800000);
    const months = Math.floor(diff / 2592000000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    if (weeks < 5) return weeks + 'w ago';
    return months + 'mo ago';
  }

  function renderStars(rating) {
    if (!rating) return '';
    let stars = '';
    for (let i = 1; i <= 5; i++) {
      stars += i <= rating ? '\u2605' : '\u2606';
    }
    return stars;
  }

  function renderJobCard(job) {
    const card = document.createElement('div');
    const statusSuffix = job.status === 'rejected' ? ' rejected' : job.status === 'applied' ? ' applied' : '';
    card.className = 'job-card' + statusSuffix;

    const starsHtml = job.rating
      ? `<span class="job-rating">${renderStars(job.rating)}</span>`
      : '';

    const statusClass = job.status || 'shortlisted';
    const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);

    card.innerHTML = `
      <div class="job-card-header">
        <a class="job-title" href="${escapeHtml(job.url || '#')}" target="_blank" title="${escapeHtml(job.title || 'Untitled')}">${escapeHtml(job.title || 'Untitled')}</a>
        <button class="job-remove" data-id="${escapeHtml(job.id)}" title="Remove from list">\u00d7</button>
      </div>
      <div class="job-meta">
        ${job.budget ? `<span class="job-budget">${escapeHtml(job.budget)}</span>` : ''}
        ${starsHtml}
        <span class="job-status ${statusClass}">${statusLabel}</span>
        ${job.postedTimestamp ? `<span class="job-posted">${escapeHtml(timeAgo(job.postedTimestamp))}</span>` : (job.postedDate ? `<span>${escapeHtml(job.postedDate)}</span>` : '')}
      </div>
    `;

    card.querySelector('.job-remove').addEventListener('click', async (e) => {
      e.preventDefault();
      await removeJob(job.id);
      render();
    });

    return card;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function render() {
    const jobs = await getJobs();
    const settings = await getSettings();
    const jobArray = Object.values(jobs);

    // Update controls to match saved settings
    sortByEl.value = settings.sortBy || 'rating';
    filterByEl.value = settings.filterBy || 'all';

    // Stats
    const total = jobArray.length;
    const rated = jobArray.filter(j => j.status === 'rated').length;
    const applied = jobArray.filter(j => j.status === 'applied').length;
    const rejected = jobArray.filter(j => j.status === 'rejected').length;
    statsEl.textContent = `${total} job${total !== 1 ? 's' : ''}`;
    if (rated) statsEl.textContent += ` | ${rated} rated`;
    if (applied) statsEl.textContent += ` | ${applied} applied`;
    if (rejected) statsEl.textContent += ` | ${rejected} rejected`;

    // Filter and sort
    let filtered = filterJobs(jobArray, settings.filterBy);
    filtered = sortJobs(filtered, settings.sortBy);

    // Render
    jobListEl.innerHTML = '';
    if (filtered.length === 0) {
      jobListEl.style.display = 'none';
      emptyEl.style.display = 'block';
      if (total > 0) {
        emptyEl.querySelector('p').textContent = 'No jobs match this filter.';
        emptyEl.querySelector('.muted').textContent = 'Try changing the filter above.';
      } else {
        emptyEl.querySelector('p').textContent = 'No jobs shortlisted yet.';
        emptyEl.querySelector('.muted').textContent = 'Browse Upwork and click the + button on job cards to add them here.';
      }
    } else {
      jobListEl.style.display = 'flex';
      emptyEl.style.display = 'none';
      filtered.forEach(job => {
        jobListEl.appendChild(renderJobCard(job));
      });
    }

    // Disable open all if no non-rejected jobs
    const openable = jobArray.filter(j => j.status !== 'rejected');
    openAllBtn.disabled = openable.length === 0;
    openAllBtn.textContent = openable.length > 0
      ? `Open ${openable.length} in Tabs`
      : 'Open All in Tabs';

    clearBtn.disabled = total === 0;
  }

  // ----------------------------------------------------------
  // Event listeners
  // ----------------------------------------------------------
  sortByEl.addEventListener('change', async () => {
    const settings = await getSettings();
    settings.sortBy = sortByEl.value;
    await saveSettings(settings);
    render();
  });

  filterByEl.addEventListener('change', async () => {
    const settings = await getSettings();
    settings.filterBy = filterByEl.value;
    await saveSettings(settings);
    render();
  });

  // Open All in Tabs
  openAllBtn.addEventListener('click', async () => {
    const jobs = await getJobs();
    const urls = Object.values(jobs)
      .filter(j => j.status !== 'rejected' && j.url)
      .map(j => j.url);

    if (urls.length === 0) return;

    chrome.runtime.sendMessage({ action: 'openTabs', urls });
  });

  // Clear list with inline confirmation
  clearBtn.addEventListener('click', () => {
    clearConfirm.style.display = 'flex';
  });

  clearNo.addEventListener('click', () => {
    clearConfirm.style.display = 'none';
  });

  clearYes.addEventListener('click', async () => {
    await clearAllJobs();
    clearConfirm.style.display = 'none';
    render();
  });

  // Stay in sync with storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.jobs) {
      render();
    }
  });

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  render();
})();
