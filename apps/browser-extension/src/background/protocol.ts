export const NEW_BOOKMARK_REQUEST_KEY_NAME = "karakeep-new-bookmark";
// Set by the background script when the "Screenshot and send to Karakeep"
// context menu item is clicked. The popup (SavePage) picks this up, captures
// the active tab, uploads it, and builds the actual bookmark request itself
// -- this indirection is needed because capturing + uploading is async and
// awaiting it in the background script before calling chrome.action.openPopup()
// would lose the user-gesture context required to open the popup on Firefox.
export const SCREENSHOT_PENDING_KEY_NAME = "karakeep-screenshot-pending";
