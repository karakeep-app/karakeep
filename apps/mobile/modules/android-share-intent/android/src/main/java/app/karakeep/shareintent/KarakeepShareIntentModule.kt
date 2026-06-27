package app.karakeep.shareintent

import android.content.ContentResolver
import android.content.Intent
import android.database.Cursor
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import android.webkit.MimeTypeMap
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

class KarakeepShareIntentModule : Module() {
    companion object {
        private const val TAG = "KarakeepShareIntent"
        var instance: KarakeepShareIntentModule? = null

        fun notifyShareIntent(value: Bundle) {
            instance?.sendEvent("onChange", mapOf("value" to value))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("KarakeepShareIntentModule")

        Events("onChange")

        OnCreate {
            instance = this@KarakeepShareIntentModule
        }

        OnDestroy {
            instance = null
        }

        AsyncFunction("getShareIntent") {
            val intent = KarakeepShareIntentSingleton.peekShareIntent()
            if (intent != null) {
                val result = handleShareIntent(intent)
                return@AsyncFunction bundleToMap(result)
            }
            return@AsyncFunction null
        }

        Function("clearShareIntent") {
            KarakeepShareIntentSingleton.clear()
            Log.d(TAG, "clearShareIntent: cleared")
        }

        Function("hasShareIntent") {
            return@Function KarakeepShareIntentSingleton.isPending
        }

        OnNewIntent { intent ->
            Log.d(TAG, "onNewIntent: action=${intent.action} type=${intent.type}")
            if (isShareIntent(intent)) {
                val result = handleShareIntent(intent)
                if (result != null) {
                    notifyShareIntent(result)
                }
            }
        }
    }

    private fun isShareIntent(intent: Intent): Boolean {
        return (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) &&
            intent.type != null
    }

    private fun handleShareIntent(intent: Intent): Bundle? {
        Log.d(TAG, "handleShareIntent: action=${intent.action} type=${intent.type}")

        return try {
            when {
                intent.action == Intent.ACTION_SEND && intent.type == "text/plain" -> {
                    handleTextIntent(intent)
                }
                intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true -> {
                    // Other text types (text/html, etc.) - try to extract text, fall back to file
                    handleTextIntent(intent) ?: handleSingleFileIntent(intent)
                }
                intent.action == Intent.ACTION_SEND -> {
                    handleSingleFileIntent(intent)
                }
                intent.action == Intent.ACTION_SEND_MULTIPLE -> {
                    handleMultipleFilesIntent(intent)
                }
                else -> {
                    Log.w(TAG, "handleShareIntent: unsupported action=${intent.action}")
                    null
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "handleShareIntent: error processing intent", e)
            null
        }
    }

    private fun handleTextIntent(intent: Intent): Bundle? {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (text.isNullOrBlank()) {
            Log.d(TAG, "handleTextIntent: no text found")
            return null
        }

        Log.d(TAG, "handleTextIntent: text=$text")

        return Bundle().apply {
            putString("text", text)
            putString("type", "text")
        }
    }

    private fun handleSingleFileIntent(intent: Intent): Bundle? {
        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }

        if (uri == null) {
            Log.d(TAG, "handleSingleFileIntent: no URI found")
            return null
        }

        Log.d(TAG, "handleSingleFileIntent: uri=$uri")
        val fileInfo = getFileInfo(uri) ?: return null

        return Bundle().apply {
            putString("type", "file")
            putParcelableArrayList("files", arrayListOf(fileInfo))
        }
    }

    private fun handleMultipleFilesIntent(intent: Intent): Bundle? {
        val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }

        if (uris.isNullOrEmpty()) {
            Log.d(TAG, "handleMultipleFilesIntent: no URIs found")
            return null
        }

        Log.d(TAG, "handleMultipleFilesIntent: ${uris.size} files")

        val files = arrayListOf<Bundle>()
        for (uri in uris) {
            val fileInfo = getFileInfo(uri)
            if (fileInfo != null) {
                files.add(fileInfo)
            }
        }

        if (files.isEmpty()) return null

        return Bundle().apply {
            putString("type", "file")
            putParcelableArrayList("files", files)
        }
    }

    private fun getFileInfo(uri: Uri): Bundle? {
        val context = appContext.reactContext ?: return null
        val contentResolver = context.contentResolver

        return try {
            // Get the file path - copy to cache if needed
            val filePath = getAccessibleFilePath(uri, contentResolver)

            // Get file metadata from ContentResolver
            var fileName: String? = null
            var fileSize: Long? = null

            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        fileName = cursor.getString(nameIndex)
                    }
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                        fileSize = cursor.getLong(sizeIndex)
                    }
                }
            }

            // Determine MIME type
            val mimeType = contentResolver.getType(uri)
                ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                    MimeTypeMap.getFileExtensionFromUrl(filePath)
                )
                ?: "application/octet-stream"

            // If we still don't have a filename, derive from path
            if (fileName == null && filePath != null) {
                fileName = File(filePath).name
            }

            Log.d(TAG, "getFileInfo: path=$filePath name=$fileName mime=$mimeType size=$fileSize")

            // Get image dimensions if applicable
            var width: Int? = null
            var height: Int? = null
            if (mimeType.startsWith("image/") && filePath != null) {
                try {
                    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(filePath, options)
                    width = options.outWidth
                    height = options.outHeight
                } catch (e: Exception) {
                    Log.w(TAG, "getFileInfo: failed to get image dimensions", e)
                }
            }

            Bundle().apply {
                putString("path", filePath ?: uri.toString())
                putString("mimeType", mimeType)
                putString("fileName", fileName)
                if (fileSize != null) putLong("fileSize", fileSize!!)
                if (width != null) putInt("width", width!!)
                if (height != null) putInt("height", height!!)
            }
        } catch (e: Exception) {
            Log.e(TAG, "getFileInfo: error processing uri=$uri", e)
            null
        }
    }

    /**
     * Gets an accessible file path for the given URI.
     * For content:// URIs, copies the file to the app's cache directory.
     * This is necessary because content:// URIs from other apps may not be
     * directly accessible as file paths.
     */
    private fun getAccessibleFilePath(uri: Uri, contentResolver: ContentResolver): String? {
        // For file:// URIs, just return the path directly
        if (uri.scheme == "file") {
            return uri.path
        }

        // For content:// URIs, copy to our cache directory
        if (uri.scheme == "content") {
            return copyToCache(uri, contentResolver)
        }

        return uri.toString()
    }

    /**
     * Copies a content:// URI to the app's cache directory and returns the file path.
     */
    private fun copyToCache(uri: Uri, contentResolver: ContentResolver): String? {
        val context = appContext.reactContext ?: return null

        try {
            // Determine filename
            var fileName = "shared_file"
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex >= 0) {
                        fileName = cursor.getString(nameIndex) ?: fileName
                    }
                }
            }

            // Create cache directory for shared files
            val cacheDir = File(context.cacheDir, "shared_intent")
            if (!cacheDir.exists()) {
                cacheDir.mkdirs()
            }

            // Copy file to cache
            val outFile = File(cacheDir, fileName)
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(outFile).use { output ->
                    input.copyTo(output)
                }
            }

            Log.d(TAG, "copyToCache: copied to ${outFile.absolutePath}")
            return outFile.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "copyToCache: failed to copy uri=$uri", e)
            return null
        }
    }

    private fun bundleToMap(bundle: Bundle?): Map<String, Any?>? {
        if (bundle == null) return null

        val map = mutableMapOf<String, Any?>()
        for (key in bundle.keySet()) {
            when (val value = bundle.get(key)) {
                is String -> map[key] = value
                is Int -> map[key] = value
                is Long -> map[key] = value
                is Boolean -> map[key] = value
                is Bundle -> map[key] = bundleToMap(value)
                is ArrayList<*> -> {
                    map[key] = value.map { item ->
                        if (item is Bundle) bundleToMap(item) else item
                    }
                }
                else -> map[key] = value?.toString()
            }
        }
        return map
    }
}
