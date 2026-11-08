#pragma once

#include <string>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <cstdlib>
#include <cmath>

namespace stream_asr {

struct AudioConfig {
    int sampleRate = 16000;
    int chunkSize = 1600;       // 100ms
    float preEmphasis = 0.97f;
};

struct VadConfig {
    bool enabled = true;
    float speechProbThreshold = 0.5f;       // Probability threshold for speech frame
    float speechPauseThreshold = 0.925f;    // Ratio of silence frames in end window (baseline: 92.5%)
    int minSpeechDurationMs = 480;          // Speech onset window (baseline: 480ms -> 48 frames)
    int maxPauseDurationMs = 2080;          // Speech end silence window (baseline: 2080ms -> 208 frames)
    int maxSegmentDurationSec = 20;         // Max continuous utterance duration before forcing segment break (baseline: 20s)
};

struct DecoderConfig {
    int maxTokenNum = 256;                   // Maximum tokens generated per chunk/utterance
    float temperature = 0.0f;
    int blankId = 0;                         // CTC blank token ID
    int sosId = 1;                           // Start of sentence token ID
    int eosId = 2;                           // End of sentence token ID
    int placeholderTokenId = 64;             // Causal decoder blank placeholder token ID ([PLHD32])
    int maxRepeatTokens = 15;                // Max consecutive identical tokens before breaking loop
};

struct RuntimeConfig {
    int mode = 3;                            // 1: instant stream, 2: offline, 3: universal stream + vad, 4: universal offline
    bool enableTwoPass = false;              // Mode 3 pure causal streaming by default (zero PCM backlog/re-encode)
    bool enablePostSmooth = true;            // Smooth disfluency and filter formatting tags
    int numThreads = 1;                      // MNN backend thread count
    AudioConfig audio;
    VadConfig vad;
    DecoderConfig decoder;
};

// Lightweight, zero-dependency, exception-free JSON parser for RuntimeConfig
inline void parseConfigJson(const std::string& json, RuntimeConfig& cfg) {
    auto findNumber = [&](const std::string& key, double defaultVal) -> double {
        size_t pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return defaultVal;
        pos = json.find(':', pos);
        if (pos == std::string::npos) return defaultVal;
        pos++;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\r' || json[pos] == '\n')) pos++;
        if (pos < json.size()) {
            char* endPtr = nullptr;
            double val = std::strtod(json.c_str() + pos, &endPtr);
            if (endPtr != json.c_str() + pos && std::isfinite(val)) {
                return val;
            }
        }
        return defaultVal;
    };

    auto findBool = [&](const std::string& key, bool defaultVal) -> bool {
        size_t pos = json.find("\"" + key + "\"");
        if (pos == std::string::npos) return defaultVal;
        pos = json.find(':', pos);
        if (pos == std::string::npos) return defaultVal;
        size_t comma = json.find_first_of(",}", pos);
        if (comma == std::string::npos) comma = json.size();
        size_t tPos = json.find("true", pos);
        size_t fPos = json.find("false", pos);
        if (tPos != std::string::npos && tPos < comma) return true;
        if (fPos != std::string::npos && fPos < comma) return false;
        return defaultVal;
    };

    // Mode
    if (json.find("\"mode\"") != std::string::npos) {
        int m = static_cast<int>(findNumber("mode", cfg.mode));
        if (m >= 1 && m <= 4) cfg.mode = m;
    }

    // Threads
    if (json.find("\"num_threads\"") != std::string::npos) {
        int t = static_cast<int>(findNumber("num_threads", cfg.numThreads));
        if (t >= 1 && t <= 16) cfg.numThreads = t;
    } else if (json.find("\"numThreads\"") != std::string::npos) {
        int t = static_cast<int>(findNumber("numThreads", cfg.numThreads));
        if (t >= 1 && t <= 16) cfg.numThreads = t;
    }

    // Post smooth
    if (json.find("\"enablePostSmooth\"") != std::string::npos) {
        cfg.enablePostSmooth = findBool("enablePostSmooth", cfg.enablePostSmooth);
    } else if (json.find("\"enable_post_smooth\"") != std::string::npos) {
        cfg.enablePostSmooth = findBool("enable_post_smooth", cfg.enablePostSmooth);
    }

    // Audio config
    if (json.find("\"sample_rate\"") != std::string::npos) {
        cfg.audio.sampleRate = static_cast<int>(findNumber("sample_rate", cfg.audio.sampleRate));
    } else if (json.find("\"sampleRate\"") != std::string::npos) {
        cfg.audio.sampleRate = static_cast<int>(findNumber("sampleRate", cfg.audio.sampleRate));
    }
    if (json.find("\"chunk_size\"") != std::string::npos) {
        cfg.audio.chunkSize = static_cast<int>(findNumber("chunk_size", cfg.audio.chunkSize));
    } else if (json.find("\"chunkSize\"") != std::string::npos) {
        cfg.audio.chunkSize = static_cast<int>(findNumber("chunkSize", cfg.audio.chunkSize));
    }
    if (json.find("\"pre_emphasis\"") != std::string::npos) {
        double pe = findNumber("pre_emphasis", cfg.audio.preEmphasis);
        if (pe >= 0.0 && pe < 1.0) cfg.audio.preEmphasis = static_cast<float>(pe);
    }

    // VAD config
    if (json.find("\"enabled\"") != std::string::npos) {
        cfg.vad.enabled = findBool("enabled", cfg.vad.enabled);
    }
    if (json.find("\"speech_prob_threshold\"") != std::string::npos) {
        double v = findNumber("speech_prob_threshold", cfg.vad.speechProbThreshold);
        cfg.vad.speechProbThreshold = std::clamp(static_cast<float>(v), 0.05f, 0.95f);
    } else if (json.find("\"vadThreshold\"") != std::string::npos) {
        double v = findNumber("vadThreshold", cfg.vad.speechProbThreshold);
        cfg.vad.speechProbThreshold = std::clamp(static_cast<float>(v), 0.05f, 0.95f);
    }

    if (json.find("\"speech_pause_threshold\"") != std::string::npos) {
        double v = findNumber("speech_pause_threshold", cfg.vad.speechPauseThreshold);
        cfg.vad.speechPauseThreshold = std::clamp(static_cast<float>(v), 0.1f, 0.99f);
    } else if (json.find("\"speechPauseThreshold\"") != std::string::npos) {
        double v = findNumber("speechPauseThreshold", cfg.vad.speechPauseThreshold);
        cfg.vad.speechPauseThreshold = std::clamp(static_cast<float>(v), 0.1f, 0.99f);
    }

    if (json.find("\"min_speech_duration_ms\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("min_speech_duration_ms", cfg.vad.minSpeechDurationMs));
        if (v >= 50 && v <= 2000) cfg.vad.minSpeechDurationMs = v;
    } else if (json.find("\"minSpeechDurationMs\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("minSpeechDurationMs", cfg.vad.minSpeechDurationMs));
        if (v >= 50 && v <= 2000) cfg.vad.minSpeechDurationMs = v;
    }

    if (json.find("\"max_pause_duration_ms\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("max_pause_duration_ms", cfg.vad.maxPauseDurationMs));
        if (v >= 200 && v <= 5000) cfg.vad.maxPauseDurationMs = v;
    } else if (json.find("\"maxPauseDurationMs\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("maxPauseDurationMs", cfg.vad.maxPauseDurationMs));
        if (v >= 200 && v <= 5000) cfg.vad.maxPauseDurationMs = v;
    }

    if (json.find("\"max_segment_duration_sec\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("max_segment_duration_sec", cfg.vad.maxSegmentDurationSec));
        if (v >= 3 && v <= 60) cfg.vad.maxSegmentDurationSec = v;
    } else if (json.find("\"maxSegmentDurationSec\"") != std::string::npos) {
        int v = static_cast<int>(findNumber("maxSegmentDurationSec", cfg.vad.maxSegmentDurationSec));
        if (v >= 3 && v <= 60) cfg.vad.maxSegmentDurationSec = v;
    }

    // Decoder config
    if (json.find("\"max_token_num\"") != std::string::npos) {
        int tok = static_cast<int>(findNumber("max_token_num", cfg.decoder.maxTokenNum));
        if (tok > 0 && tok <= 2048) cfg.decoder.maxTokenNum = tok;
    } else if (json.find("\"maxTokenNum\"") != std::string::npos) {
        int tok = static_cast<int>(findNumber("maxTokenNum", cfg.decoder.maxTokenNum));
        if (tok > 0 && tok <= 2048) cfg.decoder.maxTokenNum = tok;
    }

    if (json.find("\"max_repeat_tokens\"") != std::string::npos) {
        int r = static_cast<int>(findNumber("max_repeat_tokens", cfg.decoder.maxRepeatTokens));
        if (r >= 2 && r <= 100) cfg.decoder.maxRepeatTokens = r;
    } else if (json.find("\"maxRepeatTokens\"") != std::string::npos) {
        int r = static_cast<int>(findNumber("maxRepeatTokens", cfg.decoder.maxRepeatTokens));
        if (r >= 2 && r <= 100) cfg.decoder.maxRepeatTokens = r;
    }

    if (json.find("\"placeholder_token_id\"") != std::string::npos) {
        cfg.decoder.placeholderTokenId = static_cast<int>(findNumber("placeholder_token_id", cfg.decoder.placeholderTokenId));
    }
    if (json.find("\"eos_id\"") != std::string::npos) {
        cfg.decoder.eosId = static_cast<int>(findNumber("eos_id", cfg.decoder.eosId));
    }
}

} // namespace stream_asr
