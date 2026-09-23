/**
 * background.js — Service Worker
 *
 * Replaces the default_popup with a manually managed popup window so that:
 *   - Clicking the extension icon OPENS the popup as a detached window
 *     (it stays open when the user clicks elsewhere on the page)
 *   - Clicking the icon again CLOSES the popup (toggle behaviour)
 *
 * The active tab's ID and URL are passed to popup.html via query-string params
 * so popup.js can inject scripts into the correct Shopee tab.
 */

let popupWindowId = null;

chrome.action.onClicked.addListener(async (tab) => {

    // ── Toggle: if window is already open, close it ──────────────────────
    if (popupWindowId !== null) {
        try {
            const existing = await chrome.windows.get(popupWindowId);
            if (existing) {
                await chrome.windows.remove(popupWindowId);
                popupWindowId = null;
                return;
            }
        } catch (_) {
            // Window was already closed externally — fall through to create
            popupWindowId = null;
        }
    }

    // ── Open a new detached popup window ─────────────────────────────────
    const popupUrl =
        chrome.runtime.getURL('popup.html') +
        `?tabId=${tab.id}&tabUrl=${encodeURIComponent(tab.url || '')}`;

    const win = await chrome.windows.create({
        url: popupUrl,
        type: 'popup',   // frameless popup window
        width: 660,
        height: 760,
        focused: true
    });

    popupWindowId = win.id;
});

// ── Track when the user manually closes the popup window ─────────────────
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popupWindowId) {
        popupWindowId = null;
    }
});
