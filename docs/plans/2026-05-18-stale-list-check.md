# Stale List Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prompt the user on their first shortlist/reject action each day if stale items exist, offering to clear them before continuing.

**Architecture:** Add a `lastActionDate` key to chrome.storage.local (YYYY-MM-DD string, local time). Before processing any shortlist/reject click on search pages, check if today's date differs from `lastActionDate` and jobs exist. If so, inject a Shadow DOM modal with two choices. The original click action completes after the user decides.

**Tech Stack:** Chrome Extension (Manifest V3), vanilla JS, Shadow DOM, chrome.storage.local

---

### Task 1: Add storage helpers for lastActionDate

**Files:**
- Modify: `content/content.js:211-255` (storage helpers section)

**Step 1: Add two helper functions after the existing storage helpers**

After the `isShortlisted` function (line 255), add:

```javascript
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
```

**Step 2: Commit**

```bash
git add content/content.js
git commit -m "Add lastActionDate storage helpers and getTodayDateStr utility"
```

---

### Task 2: Build the stale-list modal (Shadow DOM)

**Files:**
- Modify: `content/content.js` (new function, after storage helpers)

**Step 1: Add the modal injection function**

Add after the helpers from Task 1:

```javascript
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
```

**Step 2: Commit**

```bash
git add content/content.js
git commit -m "Add stale-list Shadow DOM modal component"
```

---

### Task 3: Add the stale-list check gate function

**Files:**
- Modify: `content/content.js` (new function, after showStaleListModal)

**Step 1: Add the gate function that orchestrates the check**

```javascript
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
```

**Step 2: Commit**

```bash
git add content/content.js
git commit -m "Add stale-list gate function with clear/keep logic"
```

---

### Task 4: Wire the gate into shortlist and reject click handlers

**Files:**
- Modify: `content/content.js:308-354` (addBtn and rejectBtn click handlers in `createSearchButtons`)

**Step 1: Add `await checkStaleList()` as the first line in both handlers**

The addBtn click handler (currently starting at line 308) becomes:

```javascript
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
```

The rejectBtn click handler (currently starting at line 332) becomes:

```javascript
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
```

**Step 2: Verify that after clearing, the button states on all visible cards reset**

The existing `chrome.storage.onChanged` listener (line 749) already handles this - when `jobs` changes to `{}`, it calls `applyState(null)` on every button group, resetting all cards to their default state.

**Step 3: Commit**

```bash
git add content/content.js
git commit -m "Wire stale-list check into shortlist and reject click handlers"
```

---

### Task 5: Manual testing

**Steps:**
1. Load the extension in Chrome (chrome://extensions, developer mode, load unpacked)
2. Go to Upwork search results
3. Shortlist a job - should work normally (no modal, sets lastActionDate to today)
4. Open DevTools > Application > Local Storage > extension ID - verify `lastActionDate` is today's date
5. Manually edit `lastActionDate` to yesterday's date (e.g. `2026-05-17`)
6. Click shortlist or reject on another job - modal should appear with item count
7. Click "Clear & continue" - all previous items should vanish, card states reset, and the clicked action should complete
8. Repeat step 5-6, this time click "Keep adding" - previous items remain, clicked action completes
9. Click another button - no modal should appear (lastActionDate is now today)

**Step 1: Commit final state**

```bash
git add -A
git commit -m "v1.2.0 - Add stale list check on first daily action"
```
