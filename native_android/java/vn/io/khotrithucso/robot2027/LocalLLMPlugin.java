package vn.io.khotrithucso.robot2027;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalLLM")
public class LocalLLMPlugin extends Plugin {

    static {
        System.loadLibrary("robot_llama");
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private native boolean nativeLoadModel(String modelPath, int nCtx, int nThreads);
    private native String nativeGenerate(String prompt, int maxTokens);

    private File getModelsDir() {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    @PluginMethod
    public void checkModels(PluginCall call) {
        executor.execute(() -> {
            File[] list = getModelsDir().listFiles();
            JSArray arr = new JSArray();
            if (list != null) {
                for (File f : list) {
                    if (f.isFile() && f.getName().endsWith(".gguf") && f.length() > 5 * 1024 * 1024) {
                        JSObject item = new JSObject();
                        item.put("name", f.getName());
                        item.put("sizeMB", Math.round(f.length() / (1024.0 * 1024.0)));
                        arr.put(item);
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("models", arr);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String urlStr = call.getString("url", "");
        String fileName = call.getString("fileName", "model.gguf");

        if (urlStr.isEmpty()) {
            call.reject("URL trống");
            return;
        }

        executor.execute(() -> {
            File partFile = new File(getModelsDir(), fileName + ".part");
            File finalFile = new File(getModelsDir(), fileName);
            try {
                HttpURLConnection conn = openWithRedirects(urlStr, 6);
                int code = conn.getResponseCode();
                if (code >= 400) {
                    call.reject("HTTP Error " + code + " khi tải model");
                    return;
                }

                long totalBytes = conn.getContentLengthLong();
                long downloaded = 0;
                long lastNotify = 0;

                try (InputStream is = conn.getInputStream();
                     FileOutputStream fos = new FileOutputStream(partFile)) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = is.read(buf)) != -1) {
                        fos.write(buf, 0, read);
                        downloaded += read;

                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 250) {
                            lastNotify = now;
                            JSObject prog = new JSObject();
                            int pct = totalBytes > 0 ? (int) ((downloaded * 100L) / totalBytes) : 0;
                            prog.put("percent", pct);
                            prog.put("downloadedMB", Math.round(downloaded / (1024.0 * 1024.0)));
                            prog.put("totalMB", totalBytes > 0 ? Math.round(totalBytes / (1024.0 * 1024.0)) : 0);
                            notifyListeners("downloadProgress", prog);
                        }
                    }
                    fos.flush();
                }

                if (finalFile.exists()) finalFile.delete();
                if (!partFile.renameTo(finalFile)) {
                    call.reject("Không thể lưu file model sau khi tải");
                    return;
                }

                JSObject ret = new JSObject();
                ret.put("fileName", fileName);
                ret.put("sizeMB", Math.round(finalFile.length() / (1024.0 * 1024.0)));
                call.resolve(ret);
            } catch (Exception e) {
                if (partFile.exists()) partFile.delete();
                call.reject("Lỗi tải model: " + e.getMessage());
            }
        });
    }

    private HttpURLConnection openWithRedirects(String urlStr, int maxRedirects) throws Exception {
        String current = urlStr;
        for (int i = 0; i < maxRedirects; i++) {
            URL url = new URL(current);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "Robot2027-Android");
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                code == HttpURLConnection.HTTP_MOVED_TEMP ||
                code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                if (loc == null) break;
                current = new URL(url, loc).toString();
                conn.disconnect();
                continue;
            }
            return conn;
        }
        throw new Exception("Quá nhiều chuyển hướng URL");
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String fileName = call.getString("fileName", "");
        int nCtx = call.getInt("nCtx", 512);
        int nThreads = call.getInt("nThreads", 4);

        executor.execute(() -> {
            try {
                File target = new File(getModelsDir(), fileName);
                if (!target.exists()) {
                    call.reject("Không tìm thấy file model: " + fileName);
                    return;
                }
                boolean ok = nativeLoadModel(target.getAbsolutePath(), nCtx, nThreads);
                if (ok) {
                    JSObject ret = new JSObject();
                    ret.put("status", "loaded");
                    call.resolve(ret);
                } else {
                    call.reject("llama.cpp không thể nạp file GGUF này");
                }
            } catch (Exception e) {
                call.reject("Lỗi nạp model: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt", "");
        int maxTokens = call.getInt("maxTokens", 32);

        if (prompt.isEmpty()) {
            call.reject("Prompt trống");
            return;
        }

        executor.execute(() -> {
            try {
                String result = nativeGenerate(prompt, maxTokens);
                JSObject ret = new JSObject();
                ret.put("text", result);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Lỗi C++: " + e.getMessage());
            }
        });
    }
}
