package vn.io.khotrithucso.robot2027;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "SpeechBridge")
public class SpeechBridgePlugin extends Plugin {

    private static final int REQ_RECORD_AUDIO = 2027;
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final ConcurrentHashMap<String, PluginCall> pendingSpeakCalls = new ConcurrentHashMap<>();

    @Override
    public void load() {
        super.load();
        getActivity().runOnUiThread(() -> {
            tts = new TextToSpeech(getContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    tts.setLanguage(Locale.US);
                    ttsReady = true;
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {}

                        @Override
                        public void onDone(String utteranceId) {
                            PluginCall c = pendingSpeakCalls.remove(utteranceId);
                            if (c != null) c.resolve();
                        }

                        @Override
                        public void onError(String utteranceId) {
                            PluginCall c = pendingSpeakCalls.remove(utteranceId);
                            if (c != null) c.resolve();
                        }
                    });
                }
            });
        });
    }

    @PluginMethod
    public void requestMicPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQ_RECORD_AUDIO
            );
        }
        JSObject ret = new JSObject();
        ret.put("granted", ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    REQ_RECORD_AUDIO
            );
            call.reject("Ứng dụng vừa xin quyền Micro. Hãy bấm 'Cho phép' rồi bấm lại nút Micro!");
            return;
        }

        String lang = call.getString("lang", "en-US");

        getActivity().runOnUiThread(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    call.reject("Thiết bị chưa bật dịch vụ nhận diện giọng nói Google (Speech Services).");
                    return;
                }

                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.destroy();
                    } catch (Exception ignored) {}
                    speechRecognizer = null;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        JSObject ev = new JSObject();
                        ev.put("state", "ready");
                        notifyListeners("speechState", ev);
                    }

                    @Override
                    public void onBeginningOfSpeech() {}

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {}

                    @Override
                    public void onError(int error) {
                        JSObject ev = new JSObject();
                        ev.put("code", error);
                        ev.put("message", mapSpeechError(error));
                        notifyListeners("speechError", ev);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        JSObject ev = new JSObject();
                        ev.put("text", text);
                        notifyListeners("speechResult", ev);
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches != null && !matches.isEmpty()) {
                            JSObject ev = new JSObject();
                            ev.put("text", matches.get(0));
                            notifyListeners("speechPartial", ev);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                });

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

                speechRecognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Lỗi mở Micro Native: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.stopListening();
                } catch (Exception ignored) {}
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 0.96f);
        float pitch = call.getFloat("pitch", 1.08f);

        if (text.isEmpty() || !ttsReady || tts == null) {
            call.resolve();
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                String utteranceId = UUID.randomUUID().toString();
                pendingSpeakCalls.put(utteranceId, call);
                tts.setLanguage(Locale.US);
                tts.setSpeechRate(rate);
                tts.setPitch(pitch);
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
            } catch (Exception e) {
                call.resolve();
            }
        });
    }

    private String mapSpeechError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "Chưa nghe rõ câu tiếng Anh, bạn hãy bấm 🎤 và nói lại nhé!";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "Chưa thấy giọng nói, micro đã tạm nghỉ.";
            case SpeechRecognizer.ERROR_AUDIO:
                return "Lỗi thu âm phần cứng Micro.";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Nhận diện giọng nói cần mạng hoặc gói ngôn ngữ Offline tiếng Anh trên máy.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Ứng dụng chưa được cấp quyền Micro.";
            default:
                return "Lỗi nhận diện giọng nói (mã " + code + ").";
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
