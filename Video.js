/**
 * Video.js
 * Injected into the page's MAIN world via chrome.scripting.executeScript.
 *
 * Each captured video is returned as { url, date } where date is extracted
 * from the review's .XYk98l element (e.g. "2025-12-28 11:52").
 *
 * Date association technique:
 *   window.__pendingVideoDate is set to the current thumbnail's date BEFORE
 *   clicking it. The fetch hook reads this at request-time (before the async
 *   .then() fires), so every video URL loaded during that click inherits
 *   the correct date.
 *
 * Returns: { success: true, videos: Array<{ url: string, date: string }> }
 *       or { success: false, error: string }
 */
async function scrapeRatingVideos() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const TIME_RE = /^\d+:\d+$/;

    // Flexible regex — any regional Shopee VOD CDN
    const VOD_URL_RE = /https?:\/\/[^\s"'\\,\]\[{}]+vod\.susercontent\.com[^\s"'\\,\]\[{}]*/g;

    // ── Storage ───────────────────────────────────────────────────────────────
    window.__capturedVideoUrls = new Set();           // URL dedup
    window.__capturedVideos    = [];                  // [{url, date}] result array
    window.__pendingVideoDate  = '';                  // set before each thumbnail click

    const seenUrls = window.__capturedVideoUrls;
    const videos   = window.__capturedVideos;

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: extract unique Video ID from URL
    // ─────────────────────────────────────────────────────────────────────────
    function getVideoId(url) {
        try {
            const parts = url.split('?')[0].split('/');
            const filename = parts[parts.length - 1];
            return filename.split('.')[0]; // e.g. ph-11110103-6v6x7-mp0rtgf34m4s8c
        } catch(e) {
            return url;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: add a VOD URL + date pair (deduplicates by Video ID)
    // ─────────────────────────────────────────────────────────────────────────
    function addVodUrl(url, date) {
        if (!url || typeof url !== 'string') return;
        const clean = url.replace(/\\/g, '').split('"')[0];
        if (!clean.includes('vod.susercontent.com')) return;

        const vidId = getVideoId(clean);
        const existing = videos.find(v => getVideoId(v.url) === vidId);

        if (existing) {
            // Update the date if we now have one (and it's not a placeholder)
            if ((!existing.date || existing.date === 'Unknown Date') && date && date !== 'Unknown Date') {
                existing.date = date;
                console.log(`[Video.js] 🔄 Updated date for ${vidId} -> ${date}`);
            }
            return;
        }

        seenUrls.add(clean);
        videos.push({ url: clean, date: date || '' });
        console.log(`[Video.js] ✅ Added ${vidId} | ${date || '(no date)'}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: scan a text blob for VOD URLs and add them with the given date
    // ─────────────────────────────────────────────────────────────────────────
    function scanText(text, date) {
        if (!text || !text.includes('vod.susercontent')) return;
        const hits = text.match(VOD_URL_RE);
        if (hits) hits.forEach(u => addVodUrl(u, date));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: get review date from a thumbnail wrapper's ancestor .XYk98l
    //   Text format: "Philippines | 2025-12-28 11:52 | Variation: Clown"
    //   Returns:     "2025-12-28 11:52"  (or '' if not found)
    // ─────────────────────────────────────────────────────────────────────────
    function getReviewDate(wrapper) {
        let el = wrapper.parentElement;
        while (el && el !== document.body) {
            const dateEl = el.querySelector('.XYk98l');
            if (dateEl) {
                const match = (dateEl.textContent || '').match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                if (match) return match[1];
            }
            // Fallback: search all text in the review container
            const match = (el.textContent || '').match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
            if (match) return match[1];
            el = el.parentElement;
        }
        return 'Unknown Date';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hook 1: fetch — scan RESPONSE BODY; use __pendingVideoDate captured at
    //   request-time (before the async .then() fires)
    // ─────────────────────────────────────────────────────────────────────────
    if (!window.__videoFetchHooked) {
        window.__videoFetchHooked = true;
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const dateAtRequest = window.__pendingVideoDate;
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
            
            if (reqUrl.includes('vod.susercontent.com')) {
                addVodUrl(reqUrl, dateAtRequest);
            }

            const response = await origFetch(...args);
            response.clone().text().then(text => scanText(text, dateAtRequest)).catch(() => {});
            return response;
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hook 2: XHR — scan RESPONSE BODY on load
    // ─────────────────────────────────────────────────────────────────────────
    if (!window.__videoXhrHooked) {
        window.__videoXhrHooked = true;
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__xhrDate = window.__pendingVideoDate;
            return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function (...args) {
            const date = this.__xhrDate || '';
            this.addEventListener('load', function () {
                scanText(this.responseText, date);
            });
            return origSend.call(this, ...args);
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hook 3: MutationObserver — catch <video src> attribute changes
    // ─────────────────────────────────────────────────────────────────────────
    function snapshotVideoDom(date) {
        document.querySelectorAll('video').forEach(v => {
            [v.src, v.currentSrc, v.getAttribute('src')].forEach(s => addVodUrl(s, date));
            v.querySelectorAll('source').forEach(s => addVodUrl(s.getAttribute('src'), date));
        });
    }

    const observer = new MutationObserver(() => snapshotVideoDom(window.__pendingVideoDate));
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Click "With Media" filter
    // ─────────────────────────────────────────────────────────────────────────
    const withMediaEl = [...document.querySelectorAll('span')]
        .find(el => el.textContent?.trim().startsWith('With Media'));

    if (!withMediaEl) {
        observer.disconnect();
        return { success: false, error: '"With Media" filter not found on page.' };
    }

    withMediaEl.click();
    await sleep(2500);

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    function getVideoWrappers() {
        return [...document.querySelectorAll('.rating-media-list__image-wrapper')]
            .filter(w =>
                [...w.querySelectorAll('.rating-media-list__video-cover span')]
                    .some(s => TIME_RE.test(s.textContent?.trim()))
            );
    }

    function closeViewer() {
        const btn = document.querySelector(
            '.shopee-popup__close-btn, .shopee-lightbox__close, [data-testid="modal-close-btn"]'
        );
        if (btn) btn.click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Loop over pages
    // ─────────────────────────────────────────────────────────────────────────
    const MAX_PAGES = 50;

    for (let page = 1; page <= MAX_PAGES; page++) {
        await sleep(1000);

        const wrappers = getVideoWrappers();
        console.log(`[Video.js] Page ${page}: ${wrappers.length} video thumbnail(s) — captured: ${videos.length}`);

        for (let i = 0; i < wrappers.length; i++) {
            // Re-query each iteration to avoid stale DOM references
            const fresh = getVideoWrappers();
            if (i >= fresh.length) break;

            const wrapper = fresh[i];

            // ── Extract review date from this thumbnail's ancestor ──────────
            const date = getReviewDate(wrapper);
            window.__pendingVideoDate = date; // hook reads this at request-time

            const clickTarget =
                wrapper.querySelector('.shopee-rating-media-list-image__content--blur') ||
                wrapper.querySelector('.shopee-rating-media-list-image__content') ||
                wrapper;

            clickTarget.click();
            await sleep(2500);

            snapshotVideoDom(date);

            console.log(`[Video.js]   [${i + 1}/${wrappers.length}] date="${date}" — total: ${videos.length}`);

            closeViewer();
            await sleep(1000);
            window.__pendingVideoDate = ''; // clear after each thumbnail
        }

        // ── Pagination ────────────────────────────────────────────────────
        const ratingsNav = document.querySelector(
            'nav.product-ratings__page-controller, nav.shopee-page-controller'
        );
        if (!ratingsNav) { console.log('[Video.js] No nav — done.'); break; }

        const activeBtn   = ratingsNav.querySelector('.shopee-button-solid--primary');
        const currentPage = parseInt(activeBtn?.textContent?.trim() || '0', 10);

        const lastPage = [...ratingsNav.querySelectorAll(
            'button.shopee-button-solid--primary, button.shopee-button-no-outline'
        )].reduce((max, btn) => {
            const n = parseInt(btn.textContent?.trim(), 10);
            return isNaN(n) ? max : Math.max(max, n);
        }, 1);

        if (currentPage >= lastPage) {
            console.log(`[Video.js] Page ${currentPage} is the last. Done.`);
            break;
        }

        const rightArrow = ratingsNav.querySelector('button.shopee-icon-button--right');
        if (!rightArrow || rightArrow.disabled || rightArrow.hasAttribute('disabled')) {
            console.log('[Video.js] Right arrow unavailable. Done.');
            break;
        }

        console.log(`[Video.js] Navigating page ${currentPage} → ${currentPage + 1} of ${lastPage}`);
        rightArrow.click();
        await sleep(2500);

        const newPage = parseInt(
            document.querySelector(
                'nav.product-ratings__page-controller .shopee-button-solid--primary, ' +
                'nav.shopee-page-controller .shopee-button-solid--primary'
            )?.textContent?.trim() || '0', 10
        );
        if (newPage === currentPage) {
            console.log('[Video.js] Page did not advance — stopping.');
            break;
        }
    }

    observer.disconnect();
    window.__pendingVideoDate = '';

    // ── Filter out background videos that were never clicked ──────────────
    const finalVideos = videos.filter(v => v.date !== '');

    console.log(`[Video.js] ✅ Done. ${finalVideos.length} valid video(s) captured.`);
    return { success: true, videos: finalVideos };
}
