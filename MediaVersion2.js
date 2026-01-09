if (!window.__fetchHooked) {
  window.__fetchHooked = true;

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (typeof args[0] === "string" && args[0].includes("get_ratings")) {
      response
        .clone()
        .json()
        .then(data => {
          console.log("📸 Shopee review data captured:", data);

          const images = [];

          data?.data?.ratings?.forEach(r => {
            if (r.images?.length) {
              r.images.forEach(img =>
                images.push(`https://${img}`)
              );
            }
          });

          console.log("🖼 Review Images:", images);
        });
    }

    return response;
  };
}
