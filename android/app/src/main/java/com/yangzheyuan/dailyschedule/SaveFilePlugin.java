package com.yangzheyuan.dailyschedule;

import android.content.ContentValues;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 把一段文本写进**公共「下载」目录**（/storage/emulated/0/Download），
 * 让用户能在系统文件管理 App 里直接找到（本项目纯本地无账号，备份文件是
 * 换机 / 重装时唯一的数据生命线，必须落在用户看得见的地方）。
 *
 * 为什么需要这个插件：Capacitor 的 WebView 没有注册 DownloadListener，
 * `<a download>`（Blob URL）点了不会落地 —— 用户看到「导出成功」却永远
 * 找不到文件（2026-10-16 用户报告）。Filesystem 插件的公共目录
 * （ExternalStorage / Documents）在 Android 11+ 又被 scoped storage 挡住，
 * 所以这里直接用 MediaStore.Downloads（API 29+ 免权限）自己写。
 *
 * 两条写入路径：
 * - API 29+：MediaStore.Downloads insert → IS_PENDING 期间写流 → 置 0 发布。
 *   免运行时权限，且文件管理 App 立即可见（记录直接进 MediaStore 数据库）。
 * - API 24-28：File 直写公共 Download 目录，依赖 manifest 里
 *   WRITE_EXTERNAL_STORAGE（maxSdkVersion=28）。
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

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
        call.resolve(result);
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
        call.resolve(result);
    }
}
