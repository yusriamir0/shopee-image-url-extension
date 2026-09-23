/**
 * RatingImages.js
 * Injected into the page's MAIN world via chrome.scripting.executeScript.
 * 
 * Extracts all rating images from all pages by intercepting get_ratings 
 * network requests and auto-paginating through the reviews.
 *
 * Returns: { success: true, images: Array<{ url: string, date: string }> }
 */
async function scrapeRatingImages() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Use a Map to deduplicate by URL and store the date
    window.__capturedImagesMap = window.__capturedImagesMap || new Map();
    const map = window.__capturedImagesMap;

    // Track in-flight JSON parses so we can await them before reading map.size
    window.__capturedImagesParses = window.__capturedImagesParses || [];
    const parses = window.__capturedImagesParses;

    // Hook fetch to grab images directly from the API response
    if (!window.__imgFetchHooked) {
        window.__imgFetchHooked = true;
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

            if (reqUrl.includes('get_ratings')) {
                // Create and register the capture promise BEFORE awaiting the response,
                // so the pagination loop sees it as in-flight from the moment fetch is called.
                let resolveCapture;
                const capturePromise = new Promise(r => { resolveCapture = r; });
                parses.push(capturePromise);

                const response = await origFetch(...args);
                response.clone().json().then(data => {
                    const ratings = data?.data?.ratings || [];
                    ratings.forEach(r => {
                        if (r.images && r.images.length > 0) {
                            const dateObj = new Date(r.ctime * 1000);
                            const year = dateObj.getFullYear();
                            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const day = String(dateObj.getDate()).padStart(2, '0');
                            const hours = String(dateObj.getHours()).padStart(2, '0');
                            const mins = String(dateObj.getMinutes()).padStart(2, '0');
                            const dateStr = `${year}-${month}-${day} ${hours}-${mins}`;

                            r.images.forEach(imgId => {
                                const url = `https://down-my.img.susercontent.com/file/${imgId}`;
                                if (!map.has(url) || map.get(url) === "From DOM" || map.get(url) === "Unknown Date") {
                                    map.set(url, dateStr);
                                    console.log(`[RatingImages] ✅ Found image: ${imgId} | ${dateStr}`);
                                }
                            });
                        }
                    });
                }).catch(() => { }).finally(() => resolveCapture());

                return response;
            }

            return origFetch(...args);
        };
    }

    // Step 1: Click "With Media"
    const withMediaEl = [...document.querySelectorAll('div, span')]
        .find(el => el.textContent?.trim().startsWith('With Media'));

    if (!withMediaEl) {
        return { success: false, error: '"With Media" filter not found.' };
    }

    withMediaEl.click();
    await sleep(2500);

    // Helper to extract images directly from the page DOM (handles cached pages)
    function scrapeDOMForImages() {
        // Look inside elements that typically hold ratings
        const ratingSections = document.querySelectorAll('.product-ratings, .shopee-product-rating, .shopee-product-comment-list, .product-ratings__list, div[class*="product-rating"]');
        
        ratingSections.forEach(section => {
            // Find normal image tags
            section.querySelectorAll('img').forEach(img => {
                const src = img.src || "";
                const match = src.match(/file\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    let imgId = match[1];
                    if (imgId.endsWith('_tn')) imgId = imgId.slice(0, -3); // remove thumbnail suffix
                    const url = `https://down-my.img.susercontent.com/file/${imgId}`;
                    if (!map.has(url)) {
                        map.set(url, "From DOM");
                        console.log(`[RatingImages] ✅ Found image from DOM (img): ${imgId}`);
                    }
                }
            });
            
            // Find background images
            section.querySelectorAll('div').forEach(div => {
                const style = window.getComputedStyle(div).backgroundImage;
                if (style && style.includes('url(')) {
                    const match = style.match(/file\/([a-zA-Z0-9_-]+)/);
                    if (match) {
                        let imgId = match[1];
                        if (imgId.endsWith('_tn')) imgId = imgId.slice(0, -3);
                        const url = `https://down-my.img.susercontent.com/file/${imgId}`;
                        if (!map.has(url)) {
                            map.set(url, "From DOM");
                            console.log(`[RatingImages] ✅ Found image from DOM (bg): ${imgId}`);
                        }
                    }
                }
            });
        });
    }

    // Step 2: Loop pagination
    const MAX_PAGES = 50;

    for (let page = 1; page <= MAX_PAGES; page++) {
        // Await all in-flight fetch parses before reading the map size
        await Promise.all(parses.splice(0));
        await sleep(500);

        // Fallback: Scrape the DOM for images that might have been loaded from cache
        scrapeDOMForImages();

        console.log(`[RatingImages] Page ${page} processing... total images so far: ${map.size}`);

        const ratingsNav = document.querySelector(
            'nav.product-ratings__page-controller, nav.shopee-page-controller'
        );
        if (!ratingsNav) { console.log('[RatingImages] No nav — done.'); break; }

        const activeBtn = ratingsNav.querySelector('.shopee-button-solid--primary');
        const currentPage = parseInt(activeBtn?.textContent?.trim() || '0', 10);

        const lastPage = [...ratingsNav.querySelectorAll(
            'button.shopee-button-solid--primary, button.shopee-button-no-outline'
        )].reduce((max, btn) => {
            const n = parseInt(btn.textContent?.trim(), 10);
            return isNaN(n) ? max : Math.max(max, n);
        }, 1);

        if (currentPage >= lastPage) {
            console.log(`[RatingImages] Page ${currentPage} is the last. Done.`);
            break;
        }

        const rightArrow = ratingsNav.querySelector('button.shopee-icon-button--right');
        if (!rightArrow || rightArrow.disabled || rightArrow.hasAttribute('disabled')) {
            console.log('[RatingImages] Right arrow unavailable. Done.');
            break;
        }

        console.log(`[RatingImages] Navigating page ${currentPage} → ${currentPage + 1} of ${lastPage}`);
        rightArrow.click();
        await sleep(2500);

        // Await any fetches triggered by the page navigation before checking newPage
        await Promise.all(parses.splice(0));

        const newPage = parseInt(
            document.querySelector(
                'nav.product-ratings__page-controller .shopee-button-solid--primary, ' +
                'nav.shopee-page-controller .shopee-button-solid--primary'
            )?.textContent?.trim() || '0', 10
        );
        if (newPage === currentPage) {
            console.log('[RatingImages] Page did not advance — stopping.');
            break;
        }
    }

    // Final drain: await any remaining in-flight parses
    await Promise.all(parses.splice(0));

    const result = Array.from(map.entries()).map(([url, date]) => ({ url, date }));
    console.log(`[RatingImages] ✅ Done. ${result.length} image(s) captured.`);
    return { success: true, images: result };
}
