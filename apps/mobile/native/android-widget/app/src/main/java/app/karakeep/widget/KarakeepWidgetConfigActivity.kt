package app.karakeep.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class KarakeepWidgetConfigActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 48, 48, 48) }
        layout.addView(TextView(this).apply { text = "Karakeep Widget Settings"; textSize = 20f; setPadding(0, 0, 0, 32) })
        layout.addView(TextView(this).apply { text = "Search Query:"; textSize = 14f; setPadding(0, 0, 0, 8) })
        layout.addView(TextView(this).apply { text = "Examples: -is:archived, is:fav, #tagname"; textSize = 12f; setTextColor(0xFF6B7280.toInt()); setPadding(0, 0, 0, 16) })
        val queryInput = EditText(this).apply { setText(KarakeepWidgetProvider.DEFAULT_QUERY); hint = "Enter search query..."; setSingleLine(true) }
        layout.addView(queryInput)
        layout.addView(Button(this).apply {
            text = "Save"
            setPadding(0, 32, 0, 0)
            setOnClickListener {
                val query = queryInput.text.toString().trim().ifEmpty { KarakeepWidgetProvider.DEFAULT_QUERY }
                getSharedPreferences(KarakeepWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE).edit().putString("${KarakeepWidgetProvider.PREF_QUERY_PREFIX}$appWidgetId", query).apply()
                val mgr = AppWidgetManager.getInstance(this@KarakeepWidgetConfigActivity)
                updateAppWidget(this@KarakeepWidgetConfigActivity, mgr, appWidgetId)
                setResult(RESULT_OK, Intent().apply { putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId) })
                finish()
            }
        })
        setContentView(layout)
    }
}