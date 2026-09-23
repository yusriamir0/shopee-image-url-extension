document.addEventListener('DOMContentLoaded', async () => {
    const statusMessage = document.getElementById('status-message');
    const statusIcon = document.getElementById('status-icon');
    const statusCard = document.getElementById('status-card');
    const idContainer = document.getElementById('id-container');
    const shopIdValue = document.getElementById('shop-id');
    const itemIdValue = document.getElementById('item-id');
    const galleryBtn = document.getElementById('gallery-btn');
    const variationBtn = document.getElementById('variation-btn');
    const ratingBtn = document.getElementById('rating-btn');
    const videoBtn = document.getElementById('video-btn');
    const downloadVideoBtn = document.getElementById('download-video-btn');
    const galleryContainer = document.getElementById('gallery-container');
    const urlResults = document.getElementById('url-results');

    let currentShopId = null;
    let currentItemId = null;
    let currentTabId = null;
    let lastVideoUrls = [];
    let lastRatingUrls = []; // stored after scan so download btn can use them

    // ── Read tab info passed by background.js via URL query params ─────────
    const params = new URLSearchParams(window.location.search);
    const paramTabId  = params.get('tabId');
    const paramTabUrl = params.get('tabUrl') ? decodeURIComponent(params.get('tabUrl')) : '';
    if (paramTabId) currentTabId = parseInt(paramTabId, 10);

    // Setup: Get Tab and IDs
    // Priority: URL params (set by background.js) → fallback to active tab query
    try {
        let tabUrl = paramTabUrl;
        if (!currentTabId) {
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tab && tab.url) { currentTabId = tab.id; tabUrl = tab.url; }
        }
        if (currentTabId && tabUrl) {
            const ids = extractShopeeIds(tabUrl);
            if (ids) {
                currentShopId = ids.shop_id;
                currentItemId = ids.item_id;
                shopIdValue.textContent = currentShopId;
                itemIdValue.textContent = currentItemId;
                idContainer.classList.remove('hidden');
                galleryContainer.classList.remove('hidden'); // Show container for buttons
            }
        } // end if currentTabId
    } catch (e) {
        console.error("Popup setup error:", e);
    }

    // This function will be injected into the MAIN world (website context)
    async function fetchFromMainWorld(shopId, itemId) {
        const url = `https://shopee.com.my/api/v4/pdp/get_pc?shop_id=${shopId}&item_id=${itemId}&display_model_id=0&model_selection_logic=3&detail_level=0&tz_offset_in_minutes=480`;

        try {
            const res = await fetch(url, { credentials: "include" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const json = await res.json();
            const data = json?.data;

            // 1. Gallery Images
            const galleryImages = data?.product_images?.images || [];
            const galleryUrls = galleryImages.map(id => `https://down-my.img.susercontent.com/file/${id}`);

            // 2. Variation Images
            const variationImages = new Set();

            // Try different common Shopee paths for variation data
            const tiers = data?.item?.tier_variations || data?.tier_variation_display_indicators || [];

            // console.log("🧩 Variation Tiers found:", tiers);

            // Extract from tiers
            if (Array.isArray(tiers)) {
                tiers.forEach(tier => {
                    // Check if images is a direct array of IDs in the tier (common in some API responses)
                    if (Array.isArray(tier.images)) {
                        tier.images.forEach(imgId => {
                            if (imgId) variationImages.add(`https://down-my.img.susercontent.com/file/${imgId}`);
                        });
                    }
                    // Check if images are within the options (common in others)
                    tier?.options?.forEach(opt => {
                        if (opt.image) {
                            variationImages.add(`https://down-my.img.susercontent.com/file/${opt.image}`);
                        }
                    });
                });
            }

            // 3. Rating Images (Merge PC data with hooked data)
            const ratingImagesPC = data?.ratings?.media?.image?.image_id || [];
            const ratingUrlsFromPC = ratingImagesPC.map(id => `https://down-my.img.susercontent.com/file/${id}`);
            const hookedImages = window.__capturedRatingImages || [];
            const allRatingUrls = [...new Set([...ratingUrlsFromPC, ...hookedImages])];

            // console.log("🎨 Final Rating Images URLs:", allRatingUrls);

            return {
                success: true,
                galleryUrls,
                ratingUrls: allRatingUrls,
                variationUrls: [...variationImages]
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async function handleFetch(type) {
        console.log(`[CLICK] ${type.toUpperCase()} button triggered`);
        if (!currentShopId || !currentItemId) return;

        let btn;
        if (type === 'gallery') btn = galleryBtn;
        else if (type === 'variation') btn = variationBtn;
        else if (type === 'rating') btn = ratingBtn;
        else if (type === 'video') btn = videoBtn;
        const originalText = btn.textContent;

        btn.disabled = true;
        btn.textContent = 'Loading...';
        urlResults.innerHTML = '';

        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                world: "MAIN",
                func: fetchFromMainWorld,
                args: [currentShopId, currentItemId]
            });

            const result = results[0]?.result;
            if (result && result.success) {
                let urls = [];
                if (type === 'gallery') urls = result.galleryUrls;
                else if (type === 'variation') urls = result.variationUrls;
                else if (type === 'rating') urls = result.ratingUrls;

                console.log(`[SUCCESS] Found ${urls.length} images for ${type}`);
                displayUrls(urls);
            } else {
                console.error(`[ERROR] Fetch failed for ${type}:`, result?.error);
                urlResults.innerHTML = `<div class="error-text">Fetch Result: ${result?.error || 'Unknown Error'}</div>`;
            }
        } catch (err) {
            console.error(`[CRITICAL] Scripting error on ${type}:`, err);
            urlResults.innerHTML = `<div class="error-text">Setup Error: ${err.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    galleryBtn.addEventListener('click', () => handleFetch('gallery'));
    variationBtn.addEventListener('click', () => handleFetch('variation'));

    // ── Rating Images Button ──────────────────────────────────────────────
    ratingBtn.addEventListener('click', async () => {
        if (!currentTabId) return;
        const originalText = ratingBtn.textContent;
        ratingBtn.disabled = true;
        ratingBtn.textContent = '⏳ Scanning...';
        urlResults.innerHTML = '';
        
        // ensure download button is hidden initially
        const downloadRatingBtn = document.getElementById('download-rating-btn');
        downloadRatingBtn.classList.add('hidden');

        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                world: 'MAIN',
                func: scrapeRatingImages   // defined in RatingImages.js
            });

            const result = results[0]?.result;
            if (result && result.success) {
                const images = result.images || [];
                console.log(`[RATING] Found ${images.length} rating image(s)`);
                lastRatingUrls = images;
                
                // Reuse displayVideoUrls logic but map fields
                displayUrlsWithDate(images, '🖼️');
                
                if (images.length > 0) {
                    downloadRatingBtn.classList.remove('hidden');
                    downloadRatingBtn.textContent = `⬇️ Download ${images.length} Image(s)`;
                }
            } else {
                console.error('[RATING] Error:', result?.error);
                urlResults.innerHTML = `<div class="error-text">Rating Error: ${result?.error || 'Unknown error'}</div>`;
            }
        } catch (err) {
            console.error('[RATING] Script error:', err);
            urlResults.innerHTML = `<div class="error-text">Script Error: ${err.message}</div>`;
        } finally {
            ratingBtn.disabled = false;
            ratingBtn.textContent = originalText;
        }
    });

    // ── Download Rating Images Button ─────────────────────────────────────
    const downloadRatingBtn = document.getElementById('download-rating-btn');
    downloadRatingBtn.addEventListener('click', async () => {
        if (!lastRatingUrls.length) return;

        const total = lastRatingUrls.length;
        downloadRatingBtn.disabled = true;
        const dateCounts = {};

        for (let i = 0; i < total; i++) {
            const { url, date } = lastRatingUrls[i];
            downloadRatingBtn.textContent = `⬇️ Downloading ${i + 1} / ${total}…`;

            try {
                let baseName = 'image';
                if (date && date !== 'Unknown Date') {
                    baseName = date.replace(/:/g, '-');
                }

                dateCounts[baseName] = (dateCounts[baseName] || 0) + 1;
                const count = dateCounts[baseName];

                // Append .jpg
                const filename = count === 1 ? `${baseName}.jpg` : `${baseName} (${count}).jpg`;

                await chrome.downloads.download({
                    url,
                    filename,
                    conflictAction: 'uniquify'
                });
            } catch (e) {
                console.error(`[DOWNLOAD] Failed for ${url}:`, e);
            }

            await new Promise(r => setTimeout(r, 400));
        }

        downloadRatingBtn.textContent = `✅ All ${total} image(s) downloaded!`;
        setTimeout(() => {
            downloadRatingBtn.disabled = false;
            downloadRatingBtn.textContent = `⬇️ Download ${total} Image(s)`;
        }, 3000);
    });

    // ── Video Button ──────────────────────────────────────────────────────
    videoBtn.addEventListener('click', async () => {
        if (!currentTabId) return;
        const originalText = videoBtn.textContent;
        videoBtn.disabled = true;
        videoBtn.textContent = '⏳ Scanning...';
        urlResults.innerHTML = '';

        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                world: 'MAIN',
                func: scrapeRatingVideos   // defined in Video.js (loaded in popup.html)
            });

            const result = results[0]?.result;
            if (result && result.success) {
                const videos = result.videos || [];
                console.log(`[VIDEO] Found ${videos.length} video(s) with dates`);
                lastVideoUrls = videos;
                displayVideoUrls(videos);
                if (videos.length > 0) {
                    downloadVideoBtn.classList.remove('hidden');
                    downloadVideoBtn.textContent = `⬇️ Download ${videos.length} Video(s)`;
                }
            } else {
                console.error('[VIDEO] Error:', result?.error);
                urlResults.innerHTML = `<div class="error-text">Video Error: ${result?.error || 'Unknown error'}</div>`;
            }
        } catch (err) {
            console.error('[VIDEO] Script error:', err);
            urlResults.innerHTML = `<div class="error-text">Script Error: ${err.message}</div>`;
        } finally {
            videoBtn.disabled = false;
            videoBtn.textContent = originalText;
        }
    });

    // ── Download Video Button ──────────────────────────────────────────────
    downloadVideoBtn.addEventListener('click', async () => {
        if (!lastVideoUrls.length) return;

        const total = lastVideoUrls.length;
        downloadVideoBtn.disabled = true;

        const dateCounts = {};

        for (let i = 0; i < total; i++) {
            const { url, date } = lastVideoUrls[i];
            downloadVideoBtn.textContent = `⬇️ Downloading ${i + 1} / ${total}…`;

            try {
                // If there's no date, fallback to 'video'
                let baseName = 'video';
                if (date && date !== 'Unknown Date') {
                    baseName = date.replace(/:/g, '-');
                }

                dateCounts[baseName] = (dateCounts[baseName] || 0) + 1;
                const count = dateCounts[baseName];

                // Append (2), (3) if same date appears multiple times
                const filename = count === 1 ? `${baseName}.mp4` : `${baseName} (${count}).mp4`;

                await chrome.downloads.download({
                    url,
                    filename,
                    conflictAction: 'uniquify'
                });
            } catch (e) {
                console.error(`[DOWNLOAD] Failed for ${url}:`, e);
            }

            await new Promise(r => setTimeout(r, 400));
        }

        downloadVideoBtn.textContent = `✅ All ${total} video(s) downloaded!`;
        setTimeout(() => {
            downloadVideoBtn.disabled = false;
            downloadVideoBtn.textContent = `⬇️ Download ${total} Video(s)`;
        }, 3000);
    });

    function displayUrls(urls) {
        console.log(`[RENDER] Displaying ${urls.length} URLs in popup UI`);
        if (!urls || urls.length === 0) {
            urlResults.innerHTML = '<div class="url-item">No images found.</div>';
            return;
        }
        urls.forEach((u, idx) => {
            const item = document.createElement('div');
            item.className = 'url-item';

            const imgContainer = document.createElement('div');
            imgContainer.className = 'url-image-container';

            // Thumbnail (The trigger)
            const img = document.createElement('img');
            img.src = u;
            img.className = 'url-image';

            // Floating Preview (The result)
            const preview = document.createElement('img');
            preview.src = u;
            preview.className = 'url-image-hover-preview';

            imgContainer.appendChild(img);
            imgContainer.appendChild(preview);

            const text = document.createElement('div');
            text.className = 'url-text';
            text.textContent = u;

            item.appendChild(imgContainer);
            item.appendChild(text);
            urlResults.appendChild(item);
        });
    }

    // ── Media URL display with Date ──────────────────────────────────────────
    function displayUrlsWithDate(items, emojiIcon = '🎬') {
        console.log(`[RENDER] Displaying ${items.length} item(s)`);
        if (!items || items.length === 0) {
            urlResults.innerHTML = '<div class="url-item">No items found.</div>';
            return;
        }
        items.forEach(({ url, date }) => {
            const item = document.createElement('div');
            item.className = 'url-item video-url-item';

            const icon = document.createElement('div');
            icon.className = 'video-icon';
            icon.textContent = emojiIcon;

            const meta = document.createElement('div');
            meta.className = 'video-meta';

            const urlText = document.createElement('div');
            urlText.className = 'url-text';
            urlText.textContent = url;

            meta.appendChild(urlText);

            if (date) {
                const dateText = document.createElement('div');
                dateText.className = 'video-date';
                dateText.textContent = '📅 ' + date;
                meta.appendChild(dateText);
            }

            const copyBtn = document.createElement('button');
            copyBtn.className = 'video-copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.title = 'Copy URL';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(url).then(() => {
                    copyBtn.textContent = '✓';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
            });

            item.appendChild(icon);
            item.appendChild(meta);
            item.appendChild(copyBtn);
            urlResults.appendChild(item);
        });
    }

    // Replace displayVideoUrls calls with displayUrlsWithDate
    function displayVideoUrls(videos) {
        displayUrlsWithDate(videos, '🎬');
    }
});
