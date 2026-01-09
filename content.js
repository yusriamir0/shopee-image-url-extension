// content.js - Simplified to match working code exactly
console.log("Shopee Content Script Active.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchGallery") {
        const { shopId, itemId } = request.payload;

        // Exact URL and fetch from the user's "working" snippet
        const url = `https://shopee.com.my/api/v4/pdp/get_pc?shop_id=${shopId}&item_id=${itemId}&display_model_id=0&model_selection_logic=3&detail_level=0&tz_offset_in_minutes=480`;

        console.log("Fetching URL from page context:", url);

        fetch(url, { credentials: "include" })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
                return res.json();
            })
            .then(json => {
                const images = json?.data?.product_images?.images;
                if (!Array.isArray(images)) {
                    sendResponse({ success: false, error: "No images in response" });
                    return;
                }

                // Hardcoded CDN for Malaysia as per working snippet
                const imageUrls = images.map(id => `https://down-my.img.susercontent.com/file/${id}`);
                console.log("Found images:", imageUrls.length);
                sendResponse({ success: true, images: imageUrls });
            })
            .catch(err => {
                console.error("Fetch failed:", err);
                sendResponse({ success: false, error: err.message });
            });

        return true; // Keep channel open
    }
});
