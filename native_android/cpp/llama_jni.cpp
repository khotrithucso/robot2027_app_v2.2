#include <jni.h>
#include <string>
#include <vector>
#include <mutex>
#include <thread>
#include <algorithm>
#include <android/log.h>
#include "llama.h"

#define LOG_TAG "Robot2027_LlamaJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static llama_model * g_model = nullptr;
static llama_context * g_ctx = nullptr;
static std::mutex g_mutex;

extern "C" JNIEXPORT jboolean JNICALL
Java_vn_io_khotrithucso_robot2027_LocalLLMPlugin_nativeLoadModel(
        JNIEnv * env,
        jobject /* this */,
        jstring jModelPath,
        jint nCtx,
        jint nThreads) {
    std::lock_guard<std::mutex> lock(g_mutex);

    const char * modelPath = env->GetStringUTFChars(jModelPath, nullptr);
    LOGI("Loading GGUF model (ARM SIMD) from: %s", modelPath);

    if (g_ctx != nullptr) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model != nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
    }

    llama_backend_init();

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;

    g_model = llama_model_load_from_file(modelPath, mparams);
    env->ReleaseStringUTFChars(jModelPath, modelPath);

    if (g_model == nullptr) {
        LOGE("Failed to load GGUF model!");
        return JNI_FALSE;
    }

    // Ghim 4 nhân hiệu năng cao để tránh nghẽn đồng bộ với nhân tiết kiệm điện
    int optimalThreads = nThreads > 0 ? std::min(4, std::max(2, (int)nThreads)) : 4;

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = nCtx > 0 ? nCtx : 512;
    cparams.n_batch = 256;
    cparams.n_threads = optimalThreads;
    cparams.n_threads_batch = optimalThreads;

    g_ctx = llama_init_from_model(g_model, cparams);
    if (g_ctx == nullptr) {
        LOGE("Failed to create persistent llama_context!");
        llama_model_free(g_model);
        g_model = nullptr;
        return JNI_FALSE;
    }

    LOGI("GGUF model ready (threads=%d, n_ctx=%d, n_batch=256)!", optimalThreads, cparams.n_ctx);
    return JNI_TRUE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_vn_io_khotrithucso_robot2027_LocalLLMPlugin_nativeGenerate(
        JNIEnv * env,
        jobject /* this */,
        jstring jPrompt,
        jint maxTokens) {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (g_model == nullptr || g_ctx == nullptr) {
        return env->NewStringUTF("ERROR: Model not loaded");
    }

    llama_kv_cache_clear(g_ctx);

    const char * promptCStr = env->GetStringUTFChars(jPrompt, nullptr);
    std::string prompt(promptCStr);
    env->ReleaseStringUTFChars(jPrompt, promptCStr);

    const llama_vocab * vocab = llama_model_get_vocab(g_model);

    int n_prompt_tokens = -llama_tokenize(vocab, prompt.c_str(), prompt.size(), nullptr, 0, true, true);
    if (n_prompt_tokens <= 0) {
        return env->NewStringUTF("ERROR: Tokenize failed");
    }

    std::vector<llama_token> tokens(n_prompt_tokens);
    llama_tokenize(vocab, prompt.c_str(), prompt.size(), tokens.data(), tokens.size(), true, true);

    auto sparams = llama_sampler_chain_default_params();
    llama_sampler * smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(24));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(0.6f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(1234));

    llama_batch batch = llama_batch_get_one(tokens.data(), tokens.size());
    if (llama_decode(g_ctx, batch) != 0) {
        llama_sampler_free(smpl);
        return env->NewStringUTF("ERROR: Prompt decode failed");
    }

    std::string output;
    int limit = maxTokens > 0 ? maxTokens : 32;

    for (int i = 0; i < limit; i++) {
        llama_token new_token = llama_sampler_sample(smpl, g_ctx, -1);

        if (llama_vocab_is_eog(vocab, new_token)) {
            break;
        }

        char buf[256];
        int n = llama_token_to_piece(vocab, new_token, buf, sizeof(buf), 0, true);
        if (n > 0) {
            output.append(buf, n);
        }

        if (output.find("<|im_end|>") != std::string::npos ||
            output.find("<|endoftext|>") != std::string::npos ||
            output.find("\n") != std::string::npos) {
            break;
        }

        // Chốt câu ngay sau dấu kết thúc câu để phản hồi dưới ~1 giây
        if (i >= 7 && !output.empty()) {
            char lastCh = output.back();
            if (lastCh == '.' || lastCh == '!' || lastCh == '?') {
                break;
            }
        }

        batch = llama_batch_get_one(&new_token, 1);
        if (llama_decode(g_ctx, batch) != 0) {
            break;
        }
    }

    llama_sampler_free(smpl);
    return env->NewStringUTF(output.c_str());
}
