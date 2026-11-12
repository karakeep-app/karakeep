package app.karakeep.widget

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

object KarakeepApi {
    private const val TAG = "KarakeepApi"
    private const val CONNECT_TIMEOUT = 10_000
    private const val READ_TIMEOUT = 15_000

    fun searchBookmarks(serverUrl: String, apiKey: String, query: String, limit: Int = 20): JSONObject? {
        var conn: HttpURLConnection? = null
        try {
            val input = JSONObject().apply {
                put("0", JSONObject().apply {
                    put("json", JSONObject().apply {
                        put("text", query)
                        put("limit", limit)
                    })
                })
            }
            val encodedInput = URLEncoder.encode(input.toString(), "UTF-8")
            val urlStr = "${serverUrl.trimEnd('/')}/api/trpc/bookmarks.searchBookmarks?batch=1&input=$encodedInput"
            val url = URL(urlStr)
            conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer $apiKey")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                connectTimeout = CONNECT_TIMEOUT
                readTimeout = READ_TIMEOUT
            }
            val responseCode = conn.responseCode
            if (responseCode != 200) {
                Log.e(TAG, "API returned $responseCode")
                return null
            }
            val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
            return JSONObject(body)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch bookmarks", e)
            return null
        } finally {
            conn?.disconnect()
        }
    }
}

data class KarakeepSettings(val serverUrl: String, val apiKey: String) {
    companion object {
        private const val PREFS_NAME = "karakeep_settings"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_API_KEY = "api_key"

        fun read(context: Context): KarakeepSettings? {
            // 1. Try deterministic lookup from known SharedPreferences store
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val url = prefs.getString(KEY_SERVER_URL, null)
                val key = prefs.getString(KEY_API_KEY, null)
                if (!url.isNullOrEmpty() && !key.isNullOrEmpty()) {
                    return KarakeepSettings(url, key)
                }
            } catch (_: Exception) {}

            // 2. Try Expo SecureStore with known key patterns
            try {
                val prefs = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
                // Check for known Karakeep setting keys first
                val knownKeys = listOf("karakeep_server", "karakeep_api_key", "serverUrl", "apiKey")
                var serverUrl: String? = null
                var apiKey: String? = null
                for (key in knownKeys) {
                    prefs.getString(key, null)?.let { value ->
                        when {
                            key.contains("server", ignoreCase = true) || key.contains("url", ignoreCase = true) -> serverUrl = value
                            key.contains("api", ignoreCase = true) || key.contains("key", ignoreCase = true) -> apiKey = value
                        }
                    }
                }
                if (!serverUrl.isNullOrEmpty() && !apiKey.isNullOrEmpty()) {
                    return KarakeepSettings(serverUrl, apiKey)
                }

                // 3. Fallback: scan for JSON entries containing both fields
                for ((_, value) in prefs.all) {
                    if (value is String && value.contains("apiKey") && value.contains("address")) {
                        try {
                            val json = JSONObject(value)
                            val ak = json.optString("apiKey", "")
                            val addr = json.optString("address", "")
                            if (ak.isNotEmpty() && addr.isNotEmpty()) {
                                return KarakeepSettings(addr, ak)
                            }
                        } catch (_: Exception) {}
                    }
                }
            } catch (_: Exception) {}

            return null
        }
    }
}
