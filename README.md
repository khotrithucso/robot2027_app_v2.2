# Robot 2027 - App Version 2.2 (Full Complete Build)

## Tính năng mới trong V2.2
1. **Bộ não AI $\le$ 100 MB tối ưu ARM SIMD (`Q4_0_4_8`):**
   - Toàn bộ 6 model chọn sẵn đều $\le$ 100 MB (mặc định `SmolLM2-135M-Instruct-Q4_0_4_8.gguf` 91.7 MB).
   - Tinh chỉnh C++ NDK (`n_threads = 4`, `n_batch = 256`, `n_ctx = 512`, ngắt sớm theo dấu kết thúc câu) cho tốc độ phản hồi ~1 giây.
2. **Sửa lỗi nút Micro bằng Native `SpeechBridgePlugin.java` + `<queries>` Android 11+:**
   - Nhận diện giọng nói tiếng Anh (`en-US`) trực tiếp qua `SpeechRecognizer` gốc của Android, hiện chữ real-time khi nói và tự động gửi.
3. **10 Biểu cảm khuôn mặt Robot Real-Time:**
   - `IDLE_ALIVE`, `LISTENING_ATTENTIVE`, `THINKING_PONDER`, `SPEAKING_CHEERFUL`, `HAPPY_EXCITED`, `LOVE_WARM`, `CURIOUS_TILT`, `SURPRISED_WOW`, `EMPATHY_CARE`, `PLAYFUL_WINK` với nhịp dừng nghỉ tự nhiên.
4. **Nút Loa (`🔊`) phát âm lại trên MỌI tin nhắn (cả Người dùng & Robot)** + **Kết nối Backend `https://khotrithucso.io.vn/robot2027_2/`**.
