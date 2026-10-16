package com.yangzheyuan.dailyschedule;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件：把备份写进公共「下载」目录（WebView 的 a download 不落地，见 SaveFilePlugin 注释）
        registerPlugin(SaveFilePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
