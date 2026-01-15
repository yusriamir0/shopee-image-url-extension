# 🛍️ Shopee Malaysia Detector

A powerful Chrome extension for extracting and managing product images from Shopee Malaysia listings. This extension provides seamless access to product gallery images, variation images, and customer review images directly from any Shopee product page.

![Version](https://img.shields.io/badge/version-1.0.1-orange)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **🖼️ Image Gallery Extraction** - Extract all product gallery images with a single click
- **🎨 Variation Images** - Capture product variation images (colors, sizes, styles)
- **⭐ Rating Images** - Collect customer review images from product ratings
- **🔍 Auto-Detection** - Automatically detects Shopee Malaysia product pages
- **📋 URL Display** - Shows full CDN URLs for easy copying and downloading
- **🎯 Hover Preview** - Preview images at 80% scale by hovering over thumbnails
- **🌙 Modern Dark UI** - Sleek, glassmorphic design with smooth animations

## 🚀 Installation

### From Source

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/yourusername/shopee-extension.git
   ```

2. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)

3. **Load the extension**
   - Click "Load unpacked"
   - Select the `shopee-extension` folder

4. **Start using**
   - Visit any Shopee Malaysia product page
   - Click the extension icon to access features

## 📖 Usage

### Basic Workflow

1. **Navigate to a Shopee Malaysia product page**
   - Example: `https://shopee.com.my/Product-Name-i.123456.789012`

2. **Click the extension icon**
   - The popup will automatically detect the Shop ID and Item ID

3. **Extract images**
   - Click **"Image Gallery"** to get all product photos
   - Click **"Variation Images"** to get color/size variant images
   - Click **"Rating Images"** to get customer review photos

4. **View and copy URLs**
   - Hover over thumbnails to preview images
   - Click on URLs to select and copy them

### Advanced Features

#### Auto-Filter Activation
The extension automatically clicks the "With Media" filter on product pages to ensure rating images are loaded properly.

#### Fetch Hook System
Uses a sophisticated fetch interception system to capture rating images from Shopee's API calls in real-time.

## 🏗️ Project Structure

```
shopee-extension/
├── manifest.json              # Extension configuration
├── popup.html                 # Extension popup UI
├── popup.js                   # Main popup logic
├── popup.css                  # Styling with glassmorphism
├── content.js                 # Content script for page interaction
├── convertToID.js             # URL parser for Shop/Item IDs
├── ProductGalleryVersion1.js  # Gallery image extraction logic
├── VariationVersion1.js       # Variation image extraction logic
├── RatingImages.js            # Rating image fetch hook
├── MediaVersion2.js           # Alternative media extraction
└── Kopi.png                   # Extension icon
```

### File Descriptions

| File | Purpose |
|------|---------|
| **manifest.json** | Chrome extension configuration with permissions and content scripts |
| **popup.html** | Extension popup interface with buttons and display area |
| **popup.js** | Main logic for handling button clicks, API calls, and UI updates |
| **popup.css** | Modern dark theme with glassmorphic design and animations |
| **content.js** | Content script that runs on Shopee pages to fetch data |
| **convertToID.js** | Utility to extract Shop ID and Item ID from Shopee URLs |
| **ProductGalleryVersion1.js** | Standalone function to get product gallery images |
| **VariationVersion1.js** | Standalone function to get variation images |
| **RatingImages.js** | Fetch hook to intercept and capture rating images |
| **MediaVersion2.js** | Alternative version of media extraction logic |

## 🔧 Technical Details

### API Endpoints

The extension interacts with Shopee's internal API:

```
https://shopee.com.my/api/v4/pdp/get_pc
```

**Parameters:**
- `shop_id` - Unique shop identifier
- `item_id` - Unique product identifier
- `display_model_id` - Model variation (default: 0)
- `model_selection_logic` - Selection logic (default: 3)
- `detail_level` - Detail level (default: 0)
- `tz_offset_in_minutes` - Timezone offset (default: 480 for Malaysia)

### CDN Structure

Images are served from Shopee's CDN:
```
https://down-my.img.susercontent.com/file/{IMAGE_ID}
```

### Permissions

```json
{
  "permissions": ["activeTab", "scripting"],
  "host_permissions": [
    "https://shopee.com.my/*",
    "https://*.img.susercontent.com/*"
  ]
}
```

## 🎨 UI Components

### Popup Interface

- **Header** - Extension branding with gradient logo
- **Status Card** - Shows detection status and product IDs
- **Action Buttons** - Three primary buttons for different image types
- **Results Display** - Scrollable list with thumbnails and URLs
- **Footer** - Version information

### Design System

```css
--primary-color: #ee4d2d;        /* Shopee Orange */
--bg-color: #121212;              /* Dark background */
--card-bg: #1e1e1e;               /* Card background */
--glass-bg: rgba(255,255,255,0.05); /* Glassmorphic effect */
```

## 🔍 How It Works

### 1. URL Detection
```javascript
// Extracts IDs from URL patterns:
// shopee.com.my/Product-Name-i.SHOP_ID.ITEM_ID
// shopee.com.my/product/SHOP_ID/ITEM_ID
```

### 2. Data Fetching
```javascript
// Executes in MAIN world context to access Shopee's cookies
chrome.scripting.executeScript({
  target: { tabId: currentTabId },
  world: "MAIN",
  func: fetchFromMainWorld,
  args: [shopId, itemId]
});
```

### 3. Image Extraction
- **Gallery**: `json.data.product_images.images`
- **Variations**: `json.data.item.tier_variations[].images`
- **Ratings**: Intercepted from `get_ratings` API calls

### 4. URL Construction
```javascript
const cdn = "https://down-my.img.susercontent.com/file/";
const imageUrls = imageIds.map(id => cdn + id);
```

## 🛠️ Development

### Prerequisites
- Google Chrome (or Chromium-based browser)
- Basic knowledge of JavaScript and Chrome Extensions

### Local Development

1. **Make changes to the code**
2. **Reload the extension**
   - Go to `chrome://extensions/`
   - Click the refresh icon on your extension
3. **Test on a Shopee product page**

### Debugging

- **Popup Console**: Right-click extension icon → "Inspect popup"
- **Content Script Console**: F12 on Shopee page → Console tab
- **Background Logs**: Check `chrome://extensions/` → "Inspect views"

## 📝 Code Examples

### Extract Gallery Images Programmatically

```javascript
// In content script or MAIN world context
async function getGalleryImages(shopId, itemId) {
  const url = `https://shopee.com.my/api/v4/pdp/get_pc?shop_id=${shopId}&item_id=${itemId}&display_model_id=0&detail_level=0&tz_offset_in_minutes=480`;
  
  const response = await fetch(url, { credentials: "include" });
  const json = await response.json();
  
  const images = json?.data?.product_images?.images || [];
  return images.map(id => `https://down-my.img.susercontent.com/file/${id}`);
}
```

### Parse Shopee URLs

```javascript
const ids = extractShopeeIds("https://shopee.com.my/Product-i.123.456");
console.log(ids); // { shop_id: "123", item_id: "456" }
```

## 🐛 Known Issues

- Rating images require the "With Media" filter to be active (auto-handled)
- Some variation images may not be available for all products
- Extension only works on Shopee Malaysia domain

## 🔮 Future Enhancements

- [ ] Support for other Shopee regions (SG, TH, PH, etc.)
- [ ] Bulk download functionality
- [ ] Image quality selector
- [ ] Export to CSV/JSON
- [ ] Product information extraction
- [ ] Price tracking features

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This extension is for educational and personal use only. Please respect Shopee's Terms of Service and use this tool responsibly. The developers are not responsible for any misuse of this extension.

## 👨‍💻 Author

Created with ❤️ for the Shopee community

## 🙏 Acknowledgments

- Shopee Malaysia for their platform
- Chrome Extensions documentation
- The open-source community

---

**Note**: This extension is not affiliated with, endorsed by, or connected to Shopee in any way.
