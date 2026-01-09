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
    const galleryContainer = document.getElementById('gallery-container');
    const urlResults = document.getElementById('url-results');

    let currentShopId = null;
    let currentItemId = null;
    let currentTabId = null;

    // Setup: Get Tab and IDs
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
            currentTabId = tab.id;
            const ids = extractShopeeIds(tab.url);
            if (ids) {
                currentShopId = ids.shop_id;
                currentItemId = ids.item_id;
                shopIdValue.textContent = currentShopId;
                itemIdValue.textContent = currentItemId;
                idContainer.classList.remove('hidden');
                galleryContainer.classList.remove('hidden'); // Show container for buttons

                // NEW: Auto-click "With Media" filter
                chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    world: "MAIN",
                    func: () => {
                        // 1. Hook fetch for ratings (RatingImages.js logic)
                        if (!window.__fetchHooked) {
                            window.__fetchHooked = true;
                            const originalFetch = window.fetch;
                            window.fetch = async (...args) => {
                                const response = await originalFetch(...args);
                                if (typeof args[0] === "string" && args[0].includes("get_ratings")) {
                                    response.clone().json().then(data => {
                                        console.log("📸 Shopee review data captured:", data);
                                        const images = [];
                                        data?.data?.ratings?.forEach(r => {
                                            if (r.images?.length) {
                                                r.images.forEach(img => {
                                                    // Extract ID from path if necessary and normalize to CDN URL
                                                    const imgId = img.split('/').pop();
                                                    images.push(`https://down-my.img.susercontent.com/file/${imgId}`);
                                                });
                                            }
                                        });
                                        // Store globally in MAIN world so fetchFromMainWorld can access it
                                        window.__capturedRatingImages = [...new Set([...(window.__capturedRatingImages || []), ...images])];
                                    });
                                }
                                return response;
                            };
                            // console.log("📸 Rating search hook active.");
                        }

                        // 2. Auto-click "With Media"
                        const target = [...document.querySelectorAll('div')]
                            .find(el => el.textContent?.trim().startsWith('With Media'));
                        if (target) {
                            target.click();
                        } else {
                            console.log("❌ 'With Media' filter not found on page.");
                        }
                    }
                }).catch(err => console.error("Script injection failed:", err));
            }
        }
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
    ratingBtn.addEventListener('click', () => handleFetch('rating'));

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
});
