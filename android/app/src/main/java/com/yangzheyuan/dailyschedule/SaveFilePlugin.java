package com.yangzheyuan.dailyschedule;

import android.content.ContentValues;
import android.content.Intent;
import android.content.ClipData;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 备份文件的两个出口：**落到下载目录** 与 **弹系统分享面板**。
 *
 * 为什么需要这个插件（而不是 <a download> 或 Filesystem 插件）：
 * - Capacitor 的 WebView 没有注册 DownloadListener，`<a download>`（Blob URL）
 *   点了不会落地 —— 用户看到「导出成功」却永远找不到文件（2026-10-16 用户报告）。
 * - Filesystem 插件的公共目录（ExternalStorage / Documents）在 Android 11+ 被
 *   scoped storage 挡住。
 * 所以 `saveText` 直接用 MediaStore.Downloads（API 29+ 免权限）自己写。
 *
 * `shareText` 解决的是**另一个**（2026-10-17 用户报告的）问题：文件是落在 Download 了，
 * 但用户在手机里根本不知道去哪找。正确解法不是再写一份说明，而是**直接把文件递过去**——
 * 弹 ACTION_SEND 面板，微信 / QQ / 邮件 / 各家网盘都会出现在里面。
 * 官方 @capacitor/share 做不了这件事：它的 Android 实现只接受 `file://` 路径，
 * 而 API 29+ 我们拿到的是 MediaStore 的 `content://` Uri；且它要求额外配置
 * FileProvider。这里直接自己起 Intent，一份 @xml/file_paths 就够。
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    /** 分享用的临时目录：cache/exports（24 小时前的旧导出会被清掉） */
    private static final String SHARE_DIR = "exports";
    private static final long SHARE_TTL_MS = 24 * 60 * 60 * 1000L;

    @PluginMethod
    public void saveText(PluginCall call) {
        String filename = call.getString("filename", "backup.json");
        String text = call.getString("text", "");
        String mime = call.getString("mime", "application/json");

        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")) {
            call.reject("非法文件名");
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveViaMediaStore(call, filename, text, mime);
            } else {
                saveViaFile(call, filename, text);
            }
        } catch (Exception error) {
            call.reject("写入失败：" + error.getMessage());
        }
    }

    /**
     * 把一段文本存成临时文件后弹**系统分享面板**（微信 / QQ / 邮件 / 网盘都会出现）。
     *
     * 走 FileProvider（manifest 里已声明 authority=`${applicationId}.fileprovider`，
     * 路径定义见 res/xml/file_paths.xml 的 cache-path）换取一个带临时读授权的
     * content Uri —— Android 7+ 直接把 `file://` 塞进 Intent 会抛 FileUriExposedException。
     */
    @PluginMethod
    public void shareText(PluginCall call) {
        String filename = call.getString("filename", "backup.json");
        String text = call.getString("text", "");
        String mime = call.getString("mime", "application/json");

        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")) {
            call.reject("非法文件名");
            return;
        }

        try {
            File dir = new File(getContext().getCacheDir(), SHARE_DIR);
            purgeOldExports(dir);
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("无法创建临时导出目录");
                return;
            }

            File file = new File(dir, filename);
            // 同名覆盖：同一个文件反复导出不会堆出一串备份副本
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes("UTF-8"));
                out.flush();
            }

            android.net.Uri uri =
                    androidx.core.content.FileProvider.getUriForFile(
                            getContext(),
                            getContext().getPackageName() + ".fileprovider",
                            file);

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mime);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.putExtra(Intent.EXTRA_SUBJECT, filename);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ 接收方可能拿不到 EXTRA_STREAM 的读授权，ClipData 兜一层
                intent.setClipData(ClipData.newRawUri("", uri));
            }

            Intent chooser = Intent.createChooser(intent, "发送备份文件 / 保存到网盘");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            result.put("name", filename);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("分享失败：" + error.getMessage());
        }
    }

    /** 清掉一天前的临时导出文件：分享只要一个当下有效的 Uri，不负责长期留存 */
    private void purgeOldExports(File dir) {
        File[] children = dir.listFiles();
        if (children == null) return;
        long cutoff = System.currentTimeMillis() - SHARE_TTL_MS;
        for (File child : children) {
            if (child.isFile() && child.lastModified() < cutoff) {
                // 删不掉就算了：缓存目录由系统回收，不该因为一次失败让导出崩掉
                child.delete();
            }
        }
    }

    /** API 29+：MediaStore.Downloads，免权限 */
    private void saveViaMediaStore(PluginCall call, String filename, String text, String mime)
            throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        android.net.Uri uri =
                getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("无法在下载目录创建文件");
            return;
        }

        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                call.reject("无法打开输出流");
                return;
            }
            out.write(text.getBytes("UTF-8"));
            out.flush();
        } catch (Exception error) {
            // 写坏了的半成品文件要清掉，别在用户下载目录留垃圾
            getContext().getContentResolver().delete(uri, null, null);
            throw error;
        }

        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        getContext().getContentResolver().update(uri, values, null, null);

        JSObject result = new JSObject();
        result.put("uri", uri.toString());
        /*
          🔴 必须回填**真实**的文件名。同一天第二次导出时 MediaStore 会自动把重名文件
          改成「xxx (1).json」，若这里把请求时传进来的名字回给 UI，提示里写的名字与
          手机里实际存在的那个对不上 —— 用户照着名字找，找不到。
        */
        result.put("name", resolveDisplayName(uri, filename));
        call.resolve(result);
    }

    private String resolveDisplayName(android.net.Uri uri, String fallback) {
        try (android.database.Cursor cursor =
                     getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String name = cursor.getString(index);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception error) {
            // 查名字只是提示用，失败就退回传入的文件名
        }
        return fallback;
    }

    /** API 24-28：File 直写公共 Download 目录（需 WRITE_EXTERNAL_STORAGE，manifest maxSdk=28） */
    private void saveViaFile(PluginCall call, String filename, String text) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("无法创建下载目录");
            return;
        }
        File file = new File(dir, filename);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes("UTF-8"));
            out.flush();
        }
        JSObject result = new JSObject();
        result.put("uri", android.net.Uri.fromFile(file).toString());
        result.put("name", filename);
        call.resolve(result);
    }
}
