# Upwork Job Shortlister Chrome Extension

A Chrome extension for shortlisting and reviewing Upwork jobs in two rounds: a quick first pass to collect jobs, then a detailed review with star ratings to narrow down to the best ones to apply to.

[Video Guide](https://www.loom.com/share/498f713da2db4539aed3cc3f54a07843)

## Features

- **Round 1 - Quick shortlisting:** Browse Upwork job search results and click the + button to add jobs to your shortlist
- **Round 2 - Detailed review:** Open all shortlisted jobs in tabs, then rate each one 1-5 stars or reject it using the review overlay
- **Auto-detect applications:** When you visit a job you've already applied to, it's automatically marked as "Applied"
- **Cross-tab sync:** Shortlisted, rejected, and applied states sync instantly across all open Upwork tabs
- **Sort and filter:** Sort by rating, date added, or title. Filter by status (unrated, rated, applied, rejected)
- **Visual indicators on search results:**
  - Green checkmark + green overlay = shortlisted
  - Red X + dimmed card = rejected
  - Blue envelope + blue overlay = applied

## Installation

1. Download the latest release ZIP from the [Releases page](../../releases)
2. Unzip the file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the unzipped folder
6. Navigate to Upwork and start shortlisting

## Usage

### Shortlisting jobs (search results page)

Each job card on Upwork search results has two buttons in the top right:
- **+** (green) - Add to shortlist. Click again to remove.
- **x** (grey) - Reject. Dims the card so you can skip past it.

### Reviewing jobs (job detail pages)

- **Shortlist button** - Floating button to add the current job
- **Review overlay** - Appears on shortlisted jobs with 5 stars and a reject button. Minimise it if it's in the way.

### Popup (extension icon)

- View all shortlisted jobs with their ratings and status
- **Open All in Tabs** - Opens all non-rejected jobs as new tabs
- Sort by rating, date added, or title
- Filter by status
- Clear the entire list (with confirmation)

## Permissions

- `storage` - Save your shortlist locally in Chrome
- `activeTab` / `tabs` - Open shortlisted jobs in new tabs
- Host permission for `upwork.com` - Inject buttons and overlays on Upwork pages

No data is sent anywhere. Everything stays in your browser.

## License

MIT
