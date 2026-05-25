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
            val conn = url.openConnection() as HttpURLConnection
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
        }
    }
}

data class KarakeepSettings(val serverUrl: String, val apiKey: String) {
    companion object {
        private val SECURE_STORE_PREFS = listOf("SecureStore", "RKStorage", "karakeep_settings")
        fun read(context: Context): KarakeepSettings? {
            for (prefsName in SECURE_STORE_PREFS) {
                try {
                    val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
                    for ((key, value) in prefs.all) {
                        if (value is String) {
                            try {
                                val json = JSONObject(value)
                                val apiKey = json.optString("apiKey", "")
                                val address = json.optString("address", "")
                                if (apiKey.isNotEmpty() && address.isNotEmpty()) {
                                    return KarakeepSettings(address, apiKey)
                                }
                            } catch (_: Exception) {}
                        }
                    }
                } catch (_: Exception) {}
            }
            return null
        }
    }
}