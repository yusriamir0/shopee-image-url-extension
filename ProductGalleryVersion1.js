function getShopeeImageBase() {
    const host = location.hostname;
    const country = host.split(".")[1]; // shopee.my → my
    return `https://down-${country}.img.susercontent.com/file/`;
}

async function shopeeFetch(url) {
    const res = await fetch(url, {
        credentials: "include",
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${url}`);
    }

    return res.json();
}

async function getProductGalleryImages({
    shopId,
    itemId,
    displayModelId = 0,
    tzOffset = 480,
}) {
    const base = location.origin;

    const url =
        `${base}/api/v4/pdp/get_pc` +
        `?shop_id=${shopId}` +
        `&item_id=${itemId}` +
        `&display_model_id=${displayModelId}` +
        `&detail_level=0` +
        `&tz_offset_in_minutes=${tzOffset}`;

    const json = await shopeeFetch(url);

    const images = json?.data?.gallery_image;
    if (!Array.isArray(images)) {
        console.error("Images not found. Check JSON structure.");
        return [];
    }

    const cdn = getShopeeImageBase();
    const imageUrls = images.map(id => cdn + id);

    console.log("Gallery Images:", imageUrls);
    return imageUrls;
}

// Note: If you want to use this in the extension popup,
// the fetch logic must run via the content script due to origin restrictions.
