/**
 * Extracts Shop ID and Item ID from a Shopee product URL.
 * URL format: shopee.com.my/Product-Name-i.SHOP_ID.ITEM_ID
 * @param {string} urlStr - The URL of the Shopee product page.
 * @returns {object|null} - An object containing shop_id and item_id, or null if not found.
 */
function extractShopeeIds(urlStr) {
    try {
        const url = new URL(urlStr);
        // Match the -i.SHOP_ID.ITEM_ID pattern (e.g. /product-name-i.123.456)
        const regex1 = /-i\.(\d+)\.(\d+)/;
        const match1 = url.pathname.match(regex1);

        if (match1 && match1.length === 3) {
            return {
                shop_id: match1[1],
                item_id: match1[2]
            };
        }

        // Match the /product/SHOP_ID/ITEM_ID pattern (e.g. /product/123/456)
        const regex2 = /\/product\/(\d+)\/(\d+)/;
        const match2 = url.pathname.match(regex2);

        if (match2 && match2.length === 3) {
            return {
                shop_id: match2[1],
                item_id: match2[2]
            };
        }

        // Alternative: Check query parameters if applicable
        const params = new URLSearchParams(url.search);
        const shopId = params.get('shop_id') || params.get('shopid');
        const itemId = params.get('item_id') || params.get('itemid');

        if (shopId && itemId) {
            return {
                shop_id: shopId,
                item_id: itemId
            };
        }

        return null;
    } catch (e) {
        console.error('Error parsing URL:', e);
        return null;
    }
}

// Export for use in popup.js if using modules, 
// otherwise it will be available globally if included via <script>
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractShopeeIds };
}
