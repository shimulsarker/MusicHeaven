package com.musicheaven.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONException;

@CapacitorPlugin(name = "AudioFolderPicker")
public class AudioFolderPickerPlugin extends Plugin {

    private static final Set<String> AUDIO_EXTENSIONS = new HashSet<>(
        Arrays.asList("mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "webm", "wma")
    );

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPickerResult");
    }

    @ActivityCallback
    private void folderPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Uri treeUri = result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null
            ? result.getData().getData()
            : null;
        if (treeUri == null) {
            JSObject cancelledResult = new JSObject();
            cancelledResult.put("cancelled", true);
            cancelledResult.put("files", new JSArray());
            call.resolve(cancelledResult);
            return;
        }

        int grantFlags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, grantFlags);
        } catch (SecurityException exception) {
            call.reject("Android did not grant persistent access to the selected folder.", exception);
            return;
        }

        new Thread(() -> {
            try {
                ContentResolver resolver = getContext().getContentResolver();
                String rootDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
                String folderName = getDisplayName(
                    resolver,
                    DocumentsContract.buildDocumentUriUsingTree(treeUri, rootDocumentId)
                );
                if (folderName == null || folderName.isEmpty()) folderName = "Imported folder";

                List<JSObject> entries = new ArrayList<>();
                collectAudioFiles(resolver, treeUri, rootDocumentId, folderName, entries);

                JSArray files = new JSArray();
                for (JSObject entry : entries) files.put(entry);

                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("folderName", folderName);
                response.put("files", files);
                getActivity().runOnUiThread(() -> call.resolve(response));
            } catch (Exception exception) {
                getActivity().runOnUiThread(() ->
                    call.reject("Unable to read audio files from the selected folder.", exception)
                );
            }
        }, "AudioFolderScanner").start();
    }

    private void collectAudioFiles(
        ContentResolver resolver,
        Uri treeUri,
        String documentId,
        String relativeDirectory,
        List<JSObject> files
    ) throws JSONException {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId);
        String[] projection = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        };

        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) throw new IllegalStateException("Android could not list the selected folder.");

            int idColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int mimeColumn = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE);
            int sizeColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);

            while (cursor.moveToNext()) {
                String childId = cursor.getString(idColumn);
                String name = cursor.getString(nameColumn);
                String mimeType = cursor.getString(mimeColumn);
                if (name == null || name.isEmpty()) continue;

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    collectAudioFiles(resolver, treeUri, childId, relativeDirectory + "/" + name, files);
                } else if (isAudioFile(name, mimeType)) {
                    Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, childId);
                    JSObject file = new JSObject();
                    file.put("uri", fileUri.toString());
                    file.put("name", name);
                    file.put("relativePath", relativeDirectory + "/" + name);
                    file.put("mimeType", mimeType == null ? "" : mimeType);
                    if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) file.put("size", cursor.getLong(sizeColumn));
                    files.add(file);
                }
            }
        }
    }

    private String getDisplayName(ContentResolver resolver, Uri documentUri) {
        try (Cursor cursor = resolver.query(
            documentUri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME));
            }
        }
        return null;
    }

    private boolean isAudioFile(String name, String mimeType) {
        if (mimeType != null && mimeType.toLowerCase(Locale.ROOT).startsWith("audio/")) return true;

        int extensionIndex = name.lastIndexOf('.');
        if (extensionIndex < 0 || extensionIndex == name.length() - 1) return false;
        String extension = name.substring(extensionIndex + 1).toLowerCase(Locale.ROOT);
        if (AUDIO_EXTENSIONS.contains(extension)) return true;

        String guessedMimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        return guessedMimeType != null && guessedMimeType.toLowerCase(Locale.ROOT).startsWith("audio/");
    }
}
