package app.karakeep.widget

import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

class KarakeepWidgetRemoteViewsFactory(private val context: Context, private val intent: Intent) : RemoteViewsService.RemoteViewsFactory {
    companion object {
        private const val TAG = "KarakeepWidgetFactory"
        private const val MAX_ITEMS = 20
    }
    private var bookmarks: List<BookmarkItem> = emptyList()

    data class BookmarkItem(val id: String, val title: String, val url: String?, val domain: String?, val tags: List<String>, val createdAt: String?)

    override fun onCreate() {}
    override fun onDataSetChanged() {
        val query = intent.getStringExtra("query") ?: KarakeepWidgetProvider.DEFAULT_QUERY
        bookmarks = try { fetchBookmarks(query) } catch (e: Exception) { Log.e(TAG, "Failed", e); emptyList() }
    }
    override fun onDestroy() { bookmarks = emptyList() }
    override fun getCount() = bookmarks.size
    override fun getItemAt(position: Int): RemoteViews? {
        if (position >= bookmarks.size) return null
        val bookmark = bookmarks[position]
        val views = RemoteViews(context.packageName, R.layout.widget_list_item)
        views.setTextViewText(R.id.item_title, bookmark.title.ifEmpty { bookmark.url ?: "Untitled" })
        val domainText = bookmark.domain ?: ""
        views.setTextViewText(R.id.item_domain, domainText)
        views.setViewVisibility(R.id.item_domain, if (domainText.isNotEmpty()) android.view.View.VISIBLE else android.view.View.GONE)
        val tagsText = bookmark.tags.take(3).joinToString(" · ") { "#$it" }
        views.setTextViewText(R.id.item_tags, tagsText)
        views.setViewVisibility(R.id.item_tags, if (tagsText.isNotEmpty()) android.view.View.VISIBLE else android.view.View.GONE)
        val fillInIntent = Intent().apply {
            putExtra(KarakeepWidgetProvider.EXTRA_BOOKMARK_URL, bookmark.url)
            putExtra(KarakeepWidgetProvider.EXTRA_BOOKMARK_ID, bookmark.id)
        }
        views.setOnClickFillInIntent(R.id.item_container, fillInIntent)
        return views
    }
    override fun getLoadingView() = RemoteViews(context.packageName, R.layout.widget_list_item_loading)
    override fun getViewTypeCount() = 1
    override fun getItemId(position: Int) = if (position < bookmarks.size) bookmarks[position].id.hashCode().toLong() else position.toLong()
    override fun hasStableIds() = false

    private fun fetchBookmarks(query: String): List<BookmarkItem> {
        val settings = KarakeepSettings.read(context) ?: return emptyList()
        val response = KarakeepApi.searchBookmarks(settings.serverUrl, settings.apiKey, query, MAX_ITEMS) ?: return emptyList()
        val items = mutableListOf<BookmarkItem>()
        val array = response.optJSONArray("result")?.optJSONObject(0)?.optJSONObject("result")?.optJSONArray("data") ?: response.optJSONArray("bookmarks") ?: JSONArray()
        for (i in 0 until array.length()) {
            val bookmark = array.optJSONObject(i) ?: continue
            val content = bookmark.optJSONObject("content")
            val tagsArray = bookmark.optJSONArray("tags")
            val tags = mutableListOf<String>()
            if (tagsArray != null) for (j in 0 until tagsArray.length()) tagsArray.optJSONObject(j)?.optString("name")?.let { tags.add(it) }
            val url = content?.optString("url")
            val domain = try { url?.let { java.net.URI(it).host } } catch (_: Exception) { null }
            items.add(BookmarkItem(bookmark.optString("id"), content?.optString("title") ?: bookmark.optString("title") ?: "", url, domain, tags, bookmark.optString("createdAt")))
        }
        return items
    }
}