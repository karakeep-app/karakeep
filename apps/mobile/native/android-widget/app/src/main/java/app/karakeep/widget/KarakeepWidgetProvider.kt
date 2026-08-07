package app.karakeep.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import android.app.PendingIntent
import android.os.Build
import android.util.Log

/**
 * Karakeep Android Widget - Displays bookmark search results on the home screen.
 */
class KarakeepWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "KarakeepWidget"
        const val ACTION_ITEM_CLICK = "app.karakeep.widget.ACTION_ITEM_CLICK"
        const val ACTION_REFRESH = "app.karakeep.widget.ACTION_REFRESH"
        const val EXTRA_BOOKMARK_URL = "app.karakeep.widget.EXTRA_BOOKMARK_URL"
        const val EXTRA_BOOKMARK_ID = "app.karakeep.widget.EXTRA_BOOKMARK_ID"
        const val PREFS_NAME = "KarakeepWidgetPrefs"
        const val PREF_QUERY_PREFIX = "query_"
        const val DEFAULT_QUERY = "-is:archived"
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_ITEM_CLICK -> {
                val url = intent.getStringExtra(EXTRA_BOOKMARK_URL)
                if (url != null) {
                    val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    try {
                        context.startActivity(openIntent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to open URL: $url", e)
                    }
                }
            }
            ACTION_REFRESH -> {
                val appWidgetManager = AppWidgetManager.getInstance(context)
                val componentName = android.content.ComponentName(context, KarakeepWidgetProvider::class.java)
                val appWidgetIds = appWidgetManager.getAppWidgetIds(componentName)
                for (appWidgetId in appWidgetIds) {
                    updateAppWidget(context, appWidgetManager, appWidgetId)
                }
            }
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove("$PREF_QUERY_PREFIX$appWidgetId").apply()
        }
    }
}

internal fun updateAppWidget(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int
) {
    val query = getWidgetQuery(context, appWidgetId)
    val views = RemoteViews(context.packageName, R.layout.widget_karakeep)

    // Set up the list view with RemoteViewsService
    val intent = Intent(context, KarakeepWidgetRemoteViewsService::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        putExtra("query", query)
        data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }
    views.setRemoteAdapter(R.id.widget_list_view, intent)
    views.setEmptyView(R.id.widget_list_view, R.id.widget_empty_text)

    // Set the title
    views.setTextViewText(R.id.widget_title, "Karakeep")
    views.setTextViewText(R.id.widget_subtitle, query)

    // Set up refresh button click
    val refreshIntent = Intent(context, KarakeepWidgetProvider::class.java).apply {
        action = KarakeepWidgetProvider.ACTION_REFRESH
    }
    val refreshPendingIntent = PendingIntent.getBroadcast(
        context, appWidgetId, refreshIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    views.setOnClickPendingIntent(R.id.widget_refresh_btn, refreshPendingIntent)

    // Set up item click PendingIntent template
    val itemClickIntent = Intent(context, KarakeepWidgetProvider::class.java).apply {
        action = KarakeepWidgetProvider.ACTION_ITEM_CLICK
    }
    val itemClickPendingIntent = PendingIntent.getBroadcast(
        context, 0, itemClickIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
    views.setPendingIntentTemplate(R.id.widget_list_view, itemClickPendingIntent)

    appWidgetManager.updateAppWidget(appWidgetId, views)
    appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list_view)
}

internal fun getWidgetQuery(context: Context, appWidgetId: Int): String {
    val prefs = context.getSharedPreferences(
        KarakeepWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE
    )
    return prefs.getString(
        "${KarakeepWidgetProvider.PREF_QUERY_PREFIX}$appWidgetId",
        KarakeepWidgetProvider.DEFAULT_QUERY
    ) ?: KarakeepWidgetProvider.DEFAULT_QUERY
}
