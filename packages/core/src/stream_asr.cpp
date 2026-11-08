#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <cmath>
#include <cstring>
#include <memory>
#include <map>
#include <algorithm>
#include <chrono>
#include <unistd.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define STREAM_ASR_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define STREAM_ASR_EXPORT
#endif

#include <MNN/Interpreter.hpp>
#include <MNN/expr/Module.hpp>
#include <MNN/expr/Expr.hpp>
#include <MNN/expr/ExprCreator.hpp>
#include <MNN/expr/Executor.hpp>
#include "core/Backend.hpp"
#include "core/KVMeta.hpp"

#include "config.h"

using namespace MNN;
using namespace MNN::Express;
using namespace stream_asr;

// ============================================================================
// 1. Endian & FlatBuffers Parsing Utilities
// ============================================================================
static inline uint16_t readU16LE(const uint8_t* p) {
    return static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
}
static inline int32_t readI32LE(const uint8_t* p) {
    return static_cast<int32_t>(
        static_cast<uint32_t>(p[0]) |
        (static_cast<uint32_t>(p[1]) << 8) |
        (static_cast<uint32_t>(p[2]) << 16) |
        (static_cast<uint32_t>(p[3]) << 24)
    );
}
static inline uint32_t readU32LE(const uint8_t* p) {
    return static_cast<uint32_t>(readI32LE(p));
}

static void getVtable(const uint8_t* buf, uint32_t tablePos, uint32_t& vtablePos, std::vector<uint16_t>& slots) {
    int32_t vtableRel = readI32LE(buf + tablePos);
    vtablePos = static_cast<uint32_t>(static_cast<int32_t>(tablePos) - vtableRel);
    uint16_t vtableSize = readU16LE(buf + vtablePos);
    int numSlots = (vtableSize - 4) / 2;
    slots.resize(numSlots);
    for (int i = 0; i < numSlots; ++i) {
        slots[i] = readU16LE(buf + vtablePos + 4 + 2 * i);
    }
}

// ============================================================================
// 2. AudioPreprocessor: 80-bin FBank + CMVN Normalizer
// ============================================================================
struct AudioPreprocessor {
    static constexpr int SAMPLE_RATE = 16000;
    static constexpr int FRAME_LEN = 400;   // 25ms
    static constexpr int FRAME_SHIFT = 160; // 10ms
    static constexpr int FFT_SIZE = 512;
    static constexpr int NUM_BINS = 80;

    float poveyWindow[FRAME_LEN];
    struct MelBin {
        int firstIdx;
        std::vector<float> weights;
    };
    MelBin bins[NUM_BINS];
    float cmvnMean[NUM_BINS];
    float cmvnScale[NUM_BINS];

    static float hzToMel(float freq) {
        return 1127.0f * std::log(1.0f + freq / 700.0f);
    }

    bool init(const std::string& cmvnPath) {
        const float twoPi = 6.28318530717958647692f;
        for (int i = 0; i < FRAME_LEN; ++i) {
            poveyWindow[i] = std::pow(0.5f - 0.5f * std::cos(twoPi * i / (FRAME_LEN - 1)), 0.85f);
        }

        float lowFreq = 20.0f;
        float highFreq = 8000.0f;
        float melLow = hzToMel(lowFreq);
        float melHigh = hzToMel(highFreq);
        float melDelta = (melHigh - melLow) / (NUM_BINS + 1);
        float fftBinWidth = static_cast<float>(SAMPLE_RATE) / FFT_SIZE;

        for (int b = 0; b < NUM_BINS; ++b) {
            float leftMel = melLow + b * melDelta;
            float centerMel = leftMel + melDelta;
            float rightMel = centerMel + melDelta;

            float leftHz = 700.0f * (std::exp(leftMel / 1127.0f) - 1.0f);
            float centerHz = 700.0f * (std::exp(centerMel / 1127.0f) - 1.0f);
            float rightHz = 700.0f * (std::exp(rightMel / 1127.0f) - 1.0f);

            int firstBin = -1;
            for (int i = 0; i <= FFT_SIZE / 2; ++i) {
                float freq = i * fftBinWidth;
                float weight = 0.0f;
                if (freq >= leftHz && freq <= centerHz) {
                    weight = (freq - leftHz) / (centerHz - leftHz);
                } else if (freq > centerHz && freq <= rightHz) {
                    weight = (rightHz - freq) / (rightHz - centerHz);
                }
                if (weight > 0.0f) {
                    if (firstBin < 0) firstBin = i;
                    bins[b].weights.push_back(weight);
                }
            }
            bins[b].firstIdx = (firstBin >= 0) ? firstBin : 0;
        }

        std::ifstream cf(cmvnPath);
        if (!cf) return false;
        for (int b = 0; b < NUM_BINS; ++b) {
            cf >> cmvnMean[b] >> cmvnScale[b];
        }
        return true;
    }

    static void rfft512Power(const float* inFrame, float* powerOut) {
        float re[FFT_SIZE];
        float im[FFT_SIZE];
        for (int i = 0; i < FFT_SIZE; ++i) {
            re[i] = inFrame[i];
            im[i] = 0.0f;
        }

        int j = 0;
        for (int i = 0; i < FFT_SIZE - 1; ++i) {
            if (i < j) {
                std::swap(re[i], re[j]);
                std::swap(im[i], im[j]);
            }
            int bit = FFT_SIZE >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
        }
        for (int len = 2; len <= FFT_SIZE; len <<= 1) {
            float ang = -6.28318530717958647692f / len;
            float wlenRe = std::cos(ang);
            float wlenIm = std::sin(ang);
            for (int i = 0; i < FFT_SIZE; i += len) {
                float wRe = 1.0f, wIm = 0.0f;
                for (int k = 0; k < len / 2; ++k) {
                    int u = i + k;
                    int v = i + k + len / 2;
                    float tRe = re[v] * wRe - im[v] * wIm;
                    float tIm = re[v] * wIm + im[v] * wRe;
                    re[v] = re[u] - tRe;
                    im[v] = im[u] - tIm;
                    re[u] += tRe;
                    im[u] += tIm;
                    float nextWRe = wRe * wlenRe - wIm * wlenIm;
                    wIm = wRe * wlenIm + wIm * wlenRe;
                    wRe = nextWRe;
                }
            }
        }
        for (int i = 0; i <= FFT_SIZE / 2; ++i) {
            powerOut[i] = re[i] * re[i] + im[i] * im[i];
        }
    }

    void computeFrame(const float* srcPcm16, float* dstBins, float preEmphasis = 0.97f) const {
        float frame[FFT_SIZE];
        float power[FFT_SIZE / 2 + 1];

        float sum = 0.0f;
        for (int i = 0; i < FRAME_LEN; ++i) sum += srcPcm16[i];
        float mean = sum / FRAME_LEN;
        for (int i = 0; i < FRAME_LEN; ++i) frame[i] = srcPcm16[i] - mean;

        for (int i = FRAME_LEN - 1; i > 0; --i) {
            frame[i] = (frame[i] - preEmphasis * frame[i - 1]) * poveyWindow[i];
        }
        frame[0] = (frame[0] * (1.0f - preEmphasis)) * poveyWindow[0];
        for (int i = FRAME_LEN; i < FFT_SIZE; ++i) frame[i] = 0.0f;

        rfft512Power(frame, power);

        for (int b = 0; b < NUM_BINS; ++b) {
            float melE = 0.0f;
            int idx = bins[b].firstIdx;
            for (float w : bins[b].weights) {
                melE += power[idx++] * w;
            }
            if (melE < 1.1920929e-7f) melE = 1.1920929e-7f;
            float logMel = std::log(melE);
            dstBins[b] = (logMel - cmvnMean[b]) * cmvnScale[b];
        }
    }
};

// ============================================================================
// 3. TextDecoder: Byte-Level BPE Detokenizer
// ============================================================================
struct TextDecoder {
    std::map<int, std::string> idToToken;
    std::map<uint32_t, uint8_t> unicodeToByte;

    bool init(const std::string& vocabPath) {
        std::vector<int> bs;
        for (int b = 33; b <= 126; ++b) bs.push_back(b);
        for (int b = 161; b <= 172; ++b) bs.push_back(b);
        for (int b = 174; b <= 255; ++b) bs.push_back(b);
        std::vector<int> cs = bs;
        int n = 0;
        for (int b = 0; b < 256; ++b) {
            if (std::find(bs.begin(), bs.end(), b) == bs.end()) {
                bs.push_back(b);
                cs.push_back(256 + n);
                n++;
            }
        }
        for (size_t i = 0; i < bs.size(); ++i) {
            unicodeToByte[static_cast<uint32_t>(cs[i])] = static_cast<uint8_t>(bs[i]);
        }

        std::ifstream vf(vocabPath);
        if (!vf) return false;
        std::string tokLine, idLine;
        while (std::getline(vf, tokLine) && std::getline(vf, idLine)) {
            if (!tokLine.empty() && tokLine.back() == '\r') tokLine.pop_back();
            if (!idLine.empty() && idLine.back() == '\r') idLine.pop_back();
            if (!idLine.empty()) {
                char* endPtr = nullptr;
                long id = std::strtol(idLine.c_str(), &endPtr, 10);
                if (endPtr != idLine.c_str()) {
                    idToToken[static_cast<int>(id)] = tokLine;
                }
            }
        }
        return !idToToken.empty();
    }

    std::string decode(const std::vector<int>& ids) const {
        std::string rawBytes;
        for (int id : ids) {
            auto it = idToToken.find(id);
            if (it == idToToken.end()) continue;
            const std::string& tok = it->second;
            if (tok.size() >= 2 && tok.front() == '[' && tok.back() == ']') continue;
            if (id < 512) {
                rawBytes += tok;
                continue;
            }
            size_t i = 0;
            while (i < tok.size()) {
                uint32_t cp = 0;
                uint8_t c = static_cast<uint8_t>(tok[i]);
                if (c < 0x80) {
                    cp = c;
                    i += 1;
                } else if ((c & 0xE0) == 0xC0 && i + 1 < tok.size()) {
                    cp = ((c & 0x1F) << 6) | (static_cast<uint8_t>(tok[i + 1]) & 0x3F);
                    i += 2;
                } else if ((c & 0xF0) == 0xE0 && i + 2 < tok.size()) {
                    cp = ((c & 0x0F) << 12) | ((static_cast<uint8_t>(tok[i + 1]) & 0x3F) << 6) | (static_cast<uint8_t>(tok[i + 2]) & 0x3F);
                    i += 3;
                } else {
                    i += 1;
                    continue;
                }
                auto bit = unicodeToByte.find(cp);
                if (bit != unicodeToByte.end()) {
                    rawBytes.push_back(static_cast<char>(bit->second));
                }
            }
        }
        return rawBytes;
    }
};

// ============================================================================
// 4. VadSegmenter: MelBank Feature & Neural VAD State Machine
// ============================================================================
struct MelBankFeature {
    static constexpr int SAMPLE_RATE = 16000;
    static constexpr int STFT_WIN = 320;
    static constexpr int STFT_SHIFT = 160;
    static constexpr int NUM_MEL_BINS = 84;
    static constexpr int FFT_BINS = 161; // 320 / 2 + 1

    float hannWindow[STFT_WIN];
    float cosTable[FFT_BINS][STFT_WIN];
    float sinTable[FFT_BINS][STFT_WIN];
    float melFilters[NUM_MEL_BINS][FFT_BINS];

    std::vector<float> wavBuf;

    static inline float hzToMel(float hz) {
        if (hz < 1000.0f) {
            return hz * 0.015f;
        }
        return 15.0f + std::log(hz * 0.001f) / (std::log(6.4f) / 27.0f);
    }

    static inline float melToHz(float mel) {
        if (mel < 15.0f) {
            return mel * (200.0f / 3.0f);
        }
        return 1000.0f * std::exp((mel - 15.0f) * (std::log(6.4f) / 27.0f));
    }

    MelBankFeature() {
        const float twoPi = 6.28318530717958647692f;
        for (int i = 0; i < STFT_WIN; ++i) {
            hannWindow[i] = 0.5f * (1.0f - std::cos(twoPi * static_cast<float>(i) / (STFT_WIN - 1)));
        }

        for (int k = 0; k < FFT_BINS; ++k) {
            for (int n = 0; n < STFT_WIN; ++n) {
                float angle = twoPi * static_cast<float>(k * n) / static_cast<float>(STFT_WIN);
                cosTable[k][n] = std::cos(angle);
                sinTable[k][n] = std::sin(angle);
            }
        }

        float minMel = hzToMel(0.0f);
        float maxMel = hzToMel(12000.0f);
        float deltaMel = (maxMel - minMel) / (NUM_MEL_BINS + 1);

        float hzPts[NUM_MEL_BINS + 2];
        for (int i = 0; i < NUM_MEL_BINS + 2; ++i) {
            hzPts[i] = melToHz(minMel + i * deltaMel);
        }

        std::memset(melFilters, 0, sizeof(melFilters));
        for (int b = 0; b < NUM_MEL_BINS; ++b) {
            float fL = hzPts[b];
            float fC = hzPts[b + 1];
            float fR = hzPts[b + 2];
            float norm = 2.0f / (fR - fL);

            for (int k = 0; k < FFT_BINS; ++k) {
                float freq = static_cast<float>(k) * 50.0f;
                if (freq > fL && freq <= fC) {
                    melFilters[b][k] = ((freq - fL) / (fC - fL)) * norm;
                } else if (freq > fC && freq < fR) {
                    melFilters[b][k] = ((fR - freq) / (fR - fC)) * norm;
                }
            }
        }

        reset();
    }

    void reset() {
        wavBuf.assign(STFT_WIN - STFT_SHIFT, 0.0f);
    }

    void computeFrame(const float* winAudio, float* outMel84) const {
        float re[FFT_BINS];
        float im[FFT_BINS];
        for (int k = 0; k < FFT_BINS; ++k) {
            float sumRe = 0.0f;
            float sumIm = 0.0f;
            for (int n = 0; n < STFT_WIN; ++n) {
                float x = winAudio[n] * hannWindow[n];
                sumRe += x * cosTable[k][n];
                sumIm -= x * sinTable[k][n];
            }
            re[k] = sumRe;
            im[k] = sumIm;
        }

        float power[FFT_BINS];
        for (int k = 0; k < FFT_BINS; ++k) {
            power[k] = re[k] * re[k] + im[k] * im[k];
        }

        for (int b = 0; b < NUM_MEL_BINS; ++b) {
            float energy = 0.0f;
            for (int k = 0; k < FFT_BINS; ++k) {
                energy += melFilters[b][k] * power[k];
            }
            if (energy < 1e-5f) energy = 1e-5f;
            outMel84[b] = 10.0f * std::log10(energy);
        }
    }
};

struct NeuralVadEncoder {
    std::vector<float> wConv;
    std::vector<float> bConv;
    std::vector<float> wWx[3];
    std::vector<float> wWh[3];
    std::vector<float> wB[3];
    std::vector<float> wBn1, bBn1, mBn1, vBn1;
    std::vector<float> wFc, bFc;
    std::vector<float> wBn2, bBn2, mBn2, vBn2;
    std::vector<float> wLin, bLin;

    float h[3][64];
    float c[3][64];

    static inline float sigmoidFast(float x) {
        if (x < -60.0f) return 0.0f;
        if (x > 60.0f) return 1.0f;
        return 1.0f / (1.0f + std::exp(-x));
    }
    static inline float tanhFast(float x) {
        if (x < -20.0f) return -1.0f;
        if (x > 20.0f) return 1.0f;
        return std::tanh(x);
    }

    void reset() {
        std::memset(h, 0, sizeof(h));
        std::memset(c, 0, sizeof(c));
    }

    bool init(const uint8_t* vadModelBuf, size_t size) {
        if (!vadModelBuf || size < 64) return false;
        const uint8_t* buf = vadModelBuf + 32;
        size_t bufSize = size - 32;

        uint32_t rootOffset = readU32LE(buf);
        if (rootOffset >= bufSize) return false;

        uint32_t rootVtPos;
        std::vector<uint16_t> rootSlots;
        getVtable(buf, rootOffset, rootVtPos, rootSlots);
        if (rootSlots.size() <= 2 || rootSlots[2] == 0) return false;

        uint32_t tVecField = rootOffset + rootSlots[2];
        uint32_t tVecRel = readU32LE(buf + tVecField);
        uint32_t tVecPos = tVecField + tVecRel;
        uint32_t nTensors = readU32LE(buf + tVecPos);

        for (uint32_t i = 0; i < nTensors; ++i) {
            uint32_t tp = tVecPos + 4 + 4 * i;
            uint32_t tPos = tp + readU32LE(buf + tp);
            uint32_t tVtPos;
            std::vector<uint16_t> tSlots;
            getVtable(buf, tPos, tVtPos, tSlots);

            if (tSlots.size() <= 0 || tSlots[0] == 0) continue;
            uint32_t nameField = tPos + tSlots[0];
            uint32_t namePos = nameField + readU32LE(buf + nameField);
            uint32_t nameLen = readU32LE(buf + namePos);
            std::string name(reinterpret_cast<const char*>(buf + namePos + 4), nameLen);

            int dt = 0;
            if (tSlots.size() > 1 && tSlots[1] != 0) {
                dt = readI32LE(buf + tPos + tSlots[1]);
            }
            if (dt != 1) continue;

            int dataSlot = -1;
            if (tSlots.size() > 15 && tSlots[15] != 0) dataSlot = 15;
            else if (tSlots.size() > 11 && tSlots[11] != 0) dataSlot = 11;
            if (dataSlot < 0) continue;

            uint32_t dataField = tPos + tSlots[dataSlot];
            uint32_t dataPos = dataField + readU32LE(buf + dataField);
            uint32_t dataCount = readU32LE(buf + dataPos);
            const float* srcFloats = reinterpret_cast<const float*>(buf + dataPos + 4);

            if (name == "141") wConv.assign(srcFloats, srcFloats + dataCount);
            else if (name == "142") bConv.assign(srcFloats, srcFloats + dataCount);
            else if (name == "160") wWx[0].assign(srcFloats, srcFloats + dataCount);
            else if (name == "161") wWh[0].assign(srcFloats, srcFloats + dataCount);
            else if (name == "162") wB[0].assign(srcFloats, srcFloats + dataCount);
            else if (name == "180") wWx[1].assign(srcFloats, srcFloats + dataCount);
            else if (name == "181") wWh[1].assign(srcFloats, srcFloats + dataCount);
            else if (name == "182") wB[1].assign(srcFloats, srcFloats + dataCount);
            else if (name == "200") wWx[2].assign(srcFloats, srcFloats + dataCount);
            else if (name == "201") wWh[2].assign(srcFloats, srcFloats + dataCount);
            else if (name == "202") wB[2].assign(srcFloats, srcFloats + dataCount);
            else if (name == "1.batch_norm.weight") wBn1.assign(srcFloats, srcFloats + dataCount);
            else if (name == "1.batch_norm.bias") bBn1.assign(srcFloats, srcFloats + dataCount);
            else if (name == "1.batch_norm.running_mean") mBn1.assign(srcFloats, srcFloats + dataCount);
            else if (name == "1.batch_norm.running_var") vBn1.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.fc.weight") wFc.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.fc.bias") bFc.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.batch_norm.weight") wBn2.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.batch_norm.bias") bBn2.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.batch_norm.running_mean") mBn2.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.batch_norm.running_var") vBn2.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.linear.weight") wLin.assign(srcFloats, srcFloats + dataCount);
            else if (name == "2.linear.bias") bLin.assign(srcFloats, srcFloats + dataCount);
        }

        reset();
        return !wConv.empty() && !wWx[0].empty() && !wLin.empty();
    }

    void slstmCell(int layer, const float* x, int inDim, float* hOut) {
        const float* Wx = wWx[layer].data();
        const float* Wh = wWh[layer].data();
        const float* B  = wB[layer].data();
        float* hPrev = h[layer];
        float* cPrev = c[layer];

        float gates[256];
        for (int g = 0; g < 256; ++g) {
            float val = B[g] + B[256 + g];
            const float* wxRow = Wx + g * inDim;
            for (int j = 0; j < inDim; ++j) {
                val += wxRow[j] * x[j];
            }
            const float* whRow = Wh + g * 64;
            for (int j = 0; j < 64; ++j) {
                val += whRow[j] * hPrev[j];
            }
            gates[g] = val;
        }

        for (int k = 0; k < 64; ++k) {
            float ig = sigmoidFast(gates[k]);
            float og = sigmoidFast(gates[64 + k]);
            float fg = sigmoidFast(gates[128 + k]);
            float cCand = tanhFast(gates[192 + k]);
            float cVal = fg * cPrev[k] + ig * cCand;
            float hVal = og * tanhFast(cVal);
            cPrev[k] = cVal;
            hPrev[k] = hVal;
            hOut[k] = hVal;
        }
    }

    float forwardFrame(const float* feat84) {
        float convOut[64][72];
        for (int ch = 0; ch < 64; ++ch) {
            const float* w = wConv.data() + ch * 13;
            float b = bConv[ch];
            for (int t = 0; t < 72; ++t) {
                float val = b;
                for (int k = 0; k < 13; ++k) {
                    val += w[k] * feat84[t + k];
                }
                convOut[ch][t] = (val > 0.0f) ? val : 0.0f;
            }
        }

        float flat768[768];
        int idx = 0;
        for (int ch = 0; ch < 64; ++ch) {
            for (int m = 0; m < 12; ++m) {
                float maxV = convOut[ch][m * 6];
                for (int j = 1; j < 6; ++j) {
                    float v = convOut[ch][m * 6 + j];
                    if (v > maxV) maxV = v;
                }
                flat768[idx++] = maxV;
            }
        }

        float y0[64], y1[64], y2[64];
        slstmCell(0, flat768, 768, y0);
        slstmCell(1, y0, 64, y1);
        slstmCell(2, y1, 64, y2);

        float bn1[64];
        for (int i = 0; i < 64; ++i) {
            float invStd = 1.0f / std::sqrt(vBn1[i] + 0.001f);
            bn1[i] = (y2[i] - mBn1[i]) * invStd * wBn1[i] + bBn1[i];
        }

        float fc[64];
        for (int i = 0; i < 64; ++i) {
            float val = bFc[i];
            const float* wRow = wFc.data() + i * 64;
            for (int j = 0; j < 64; ++j) {
                val += wRow[j] * bn1[j];
            }
            fc[i] = val;
        }

        float bn2[64];
        for (int i = 0; i < 64; ++i) {
            float invStd = 1.0f / std::sqrt(vBn2[i] + 0.001f);
            float y = (fc[i] - mBn2[i]) * invStd * wBn2[i] + bBn2[i];
            bn2[i] = (y > 0.0f) ? y : 0.0f;
        }

        float z = bLin[0];
        for (int j = 0; j < 64; ++j) {
            z += wLin[j] * bn2[j];
        }
        return sigmoidFast(z);
    }
};

struct VadDecoder {
    float threshold = 0.5f;
    float endSilenceProp = 0.925f; // End silence ratio (baseline: 0.925)
    int beginWindow = 48;         // Calculated from minSpeechDurationMs (baseline: 480ms -> 48 frames)
    float beginVoiceProp = 0.5f;
    int endWindow = 208;          // Calculated from maxPauseDurationMs (baseline: 2080ms -> 208 frames)

    bool inSpeech = false;
    int currentFrame = 0;
    std::vector<int8_t> beginQueue;
    int beginVoiceCount = 0;
    std::vector<int8_t> endQueue;
    int endVoiceCount = 0;

    struct SegmentEvent {
        enum Type { NONE, START, END };
        Type type = NONE;
        int frame = 0;
    };

    void applyConfig(const VadConfig& cfg) {
        threshold = cfg.speechProbThreshold;
        endSilenceProp = cfg.speechPauseThreshold;
        beginWindow = std::max(5, std::min(100, cfg.minSpeechDurationMs / 10));
        endWindow = std::max(20, std::min(300, cfg.maxPauseDurationMs / 10));
    }

    void reset() {
        inSpeech = false;
        currentFrame = 0;
        beginQueue.clear();
        beginVoiceCount = 0;
        endQueue.clear();
        endVoiceCount = 0;
    }

    SegmentEvent processFrame(float prob, bool isFinal) {
        SegmentEvent evt;
        int8_t isVoice = (prob >= threshold) ? 1 : 0;

        beginQueue.push_back(isVoice);
        beginVoiceCount += isVoice;
        if (static_cast<int>(beginQueue.size()) > beginWindow) {
            beginVoiceCount -= beginQueue.front();
            beginQueue.erase(beginQueue.begin());
        }

        endQueue.push_back(isVoice);
        endVoiceCount += isVoice;
        if (static_cast<int>(endQueue.size()) > endWindow) {
            endVoiceCount -= endQueue.front();
            endQueue.erase(endQueue.begin());
        }

        if (!inSpeech) {
            if (static_cast<int>(beginQueue.size()) == beginWindow &&
                beginVoiceCount >= static_cast<int>(beginWindow * beginVoiceProp)) {
                inSpeech = true;
                evt.type = SegmentEvent::START;
                evt.frame = std::max(0, currentFrame - beginWindow + 1);
                endQueue.clear();
                endVoiceCount = 0;
            }
        } else {
            int endWinSz = static_cast<int>(endQueue.size());
            if (endWinSz == endWindow &&
                (static_cast<float>(endWinSz - endVoiceCount) >= static_cast<float>(endWindow) * endSilenceProp)) {
                inSpeech = false;
                evt.type = SegmentEvent::END;
                evt.frame = currentFrame;
                beginQueue.clear();
                beginVoiceCount = 0;
                endQueue.clear();
                endVoiceCount = 0;
            }
        }

        if (isFinal && inSpeech) {
            inSpeech = false;
            evt.type = SegmentEvent::END;
            evt.frame = std::max(0, currentFrame - 1);
            beginQueue.clear();
            beginVoiceCount = 0;
            endQueue.clear();
            endVoiceCount = 0;
        }

        currentFrame++;
        return evt;
    }
};

struct TailVadProbe {
    float threshold = 0.5f;
    static constexpr int WINDOW = 10;

    bool inSpeech = false;
    std::vector<int8_t> voiceQueue;
    int voiceCount = 0;
    int state = 0; // 0=silence, 1=speech, 2=finish_speech

    void reset() {
        inSpeech = false;
        voiceQueue.clear();
        voiceCount = 0;
        state = 0;
    }

    int processFrame(float prob, bool isFinal) {
        int8_t isVoice = (prob >= threshold) ? 1 : 0;
        voiceQueue.push_back(isVoice);
        voiceCount += isVoice;
        if (static_cast<int>(voiceQueue.size()) > WINDOW) {
            voiceCount -= voiceQueue.front();
            voiceQueue.erase(voiceQueue.begin());
        }

        if (!inSpeech) {
            if (static_cast<int>(voiceQueue.size()) == WINDOW && voiceCount >= 5) {
                inSpeech = true;
                state = 1;
            } else {
                state = 0;
            }
        } else {
            int silCount = static_cast<int>(voiceQueue.size()) - voiceCount;
            if (static_cast<int>(voiceQueue.size()) == WINDOW && silCount >= 9) {
                inSpeech = false;
                state = 0;
            } else {
                state = 1;
            }
        }

        if (isFinal && state == 1) {
            state = 2;
        }
        return state;
    }
};

struct VadSegmenter {
    int maxSegmentSamples = 320000; // Baseline: 20.0s split @ 16kHz
    int curSegmentSamples = 0;

    void applyConfig(const VadConfig& cfg, int sampleRate = 16000) {
        int durSec = std::clamp(cfg.maxSegmentDurationSec, 3, 60);
        maxSegmentSamples = durSec * sampleRate;
    }

    void reset() {
        curSegmentSamples = 0;
    }

    void addSamples(int n) {
        if (n > 0) curSegmentSamples += n;
    }
};

// ============================================================================
// 5. Global StreamSpeechPipeline State
// ============================================================================
struct StreamSpeechPipeline {
    bool initialized = false;
    RuntimeConfig config;

    AudioPreprocessor fbank;
    TextDecoder detok;

    std::shared_ptr<Executor::RuntimeManager> baseRtmgr;
    std::shared_ptr<Executor::RuntimeManager> encStreamRtmgr;
    std::shared_ptr<Executor::RuntimeManager> streamDecRtmgr;
    std::shared_ptr<Executor::RuntimeManager> noStreamDecRtmgr;

    KVMeta encKvMeta;
    KVMeta streamDecKvMeta;
    KVMeta noStreamDecKvMeta;

    std::unique_ptr<Module> encBase;
    std::unique_ptr<Module> encStream;
    std::unique_ptr<Module> logitMod;
    std::unique_ptr<Module> logitLoraMod;
    std::unique_ptr<Module> streamEmbedMod;
    std::unique_ptr<Module> streamTopkMod;
    std::unique_ptr<Module> streamDecMod;

    std::unique_ptr<Module> noStreamEmbedMod;
    std::unique_ptr<Module> noStreamTopkMod;
    std::unique_ptr<Module> noStreamDecMod;

    // Streaming session state
    bool enablePostSmooth = true;
    std::vector<float> pcmQueue;
    std::vector<float> fbankQueue;
    int fbankFramesQueued = 0;
    std::vector<float> s0Buf;
    std::vector<float> s1Buf;
    int streamChunkIdx = 0;
    int streamDecPos = 0;
    int noStreamDecPos = 0;
    std::vector<int> streamTokens;

    std::string lastTranscript;
    int lastTokenCount = 0;
    double lastInferenceMs = 0.0;

    // Mode 3 & Mode 4 VAD session state
    bool vadInitialized = false;
    MelBankFeature vadFbank;
    std::unique_ptr<NeuralVadEncoder> vadEncoder;
    VadDecoder vadDecoder;
    TailVadProbe tailVadProbe;
    VadSegmenter vadSegmenter;
    std::vector<std::string> universalSegments;
    std::string universalTranscript;
    std::string liveUniversalTranscript;
    std::vector<float> curSentencePcm;
    std::vector<float> pendingRefinePcm;
    int pendingRefineSegIndex = -1;
    int tailVadState = 0;
    bool streamActive = false;
    std::vector<float> preRollPcm;
    static constexpr size_t MAX_PRE_ROLL_SAMPLES = 10240; // 640ms @ 16kHz (exactly 2 chunks of 32 frames)

    void rebuildUniversalTranscript() {
        universalTranscript.clear();
        for (size_t i = 0; i < universalSegments.size(); ++i) {
            if (i > 0 && !universalTranscript.empty() && universalTranscript.back() != ' ') {
                universalTranscript += " ";
            }
            universalTranscript += universalSegments[i];
        }
    }
};

static StreamSpeechPipeline gPipeline;

static std::string postProcessSmooth(const std::string& input, bool isStreamResultMode = false) {
    if (input.find("|A") == std::string::npos) {
        return input;
    }
    std::string out = input;
    size_t searchPos = 0;
    while (searchPos < out.size()) {
        size_t lt = out.find('<', searchPos);
        if (lt == std::string::npos) break;
        size_t gt = out.find('>', lt + 1);
        if (gt == std::string::npos) break;

        size_t lastPipe = std::string::npos;
        for (size_t i = lt + 1; i < gt; ++i) {
            if (out[i] == '|') lastPipe = i;
        }
        if (lastPipe == std::string::npos) {
            searchPos = lt + 1;
            continue;
        }

        if (!isStreamResultMode) {
            out.erase(lt, gt - lt + 1);
            searchPos = lt;
        } else {
            std::string inner = out.substr(lt + 1, lastPipe - (lt + 1));
            if (inner.rfind("F|", 0) == 0) {
                inner.erase(0, 2);
            }
            out.replace(lt, gt - lt + 1, inner);
            searchPos = lt + inner.size();
        }
    }
    return out;
}

static void scaleToKaldiPcm(const float* samples, int numSamples, std::vector<float>& dst) {
    float maxAbs = 0.0f;
    int checkCount = std::min(numSamples, 2000);
    for (int i = 0; i < checkCount; ++i) {
        float a = std::fabs(samples[i]);
        if (a > maxAbs) maxAbs = a;
    }
    float scale = (maxAbs <= 2.0f) ? 32768.0f : 1.0f;
    size_t oldSize = dst.size();
    dst.resize(oldSize + numSamples);
    for (int i = 0; i < numSamples; ++i) {
        dst[oldSize + i] = samples[i] * scale;
    }
}

static void scaleToNormalizedPcm(const float* samples, int numSamples, std::vector<float>& dst) {
    float maxAbs = 0.0f;
    int checkCount = std::min(numSamples, 2000);
    for (int i = 0; i < checkCount; ++i) {
        float a = std::fabs(samples[i]);
        if (a > maxAbs) maxAbs = a;
    }
    float scale = (maxAbs > 2.0f) ? (1.0f / 32768.0f) : 1.0f;
    size_t oldSize = dst.size();
    dst.resize(oldSize + numSamples);
    for (int i = 0; i < numSamples; ++i) {
        dst[oldSize + i] = samples[i] * scale;
    }
}

static void runOneStreamChunk(const float* chunkFramesPtr, int validFrames, bool isFinalChunk) {
    const int CHUNK_FRAMES = 32;
    auto t0 = std::chrono::high_resolution_clock::now();

    auto offset0 = _Input({3}, NCHW, halide_type_of<int>());
    offset0->writeMap<int>()[0] = 0;
    offset0->writeMap<int>()[1] = gPipeline.streamChunkIdx * 8;
    offset0->writeMap<int>()[2] = 0;

    auto s1 = _Input({1, 256, 1, 40}, NC4HW4, halide_type_of<float>());
    std::memcpy(s1->writeMap<float>(), gPipeline.s1Buf.data(), 256 * 40 * sizeof(float));

    auto s0 = _Input({1, 1, 1, 80}, NC4HW4, halide_type_of<float>());
    std::memcpy(s0->writeMap<float>(), gPipeline.s0Buf.data(), 320 * sizeof(float));

    auto chunkFeat = _Input({1, CHUNK_FRAMES, 80}, NCHW, halide_type_of<float>());
    float* featPtr = chunkFeat->writeMap<float>();
    std::memset(featPtr, 0, CHUNK_FRAMES * 80 * sizeof(float));
    std::memcpy(featPtr, chunkFramesPtr, validFrames * 80 * sizeof(float));

    auto chunkMask = _Input({1, CHUNK_FRAMES}, NCHW, halide_type_of<int>());
    int* maskPtr = chunkMask->writeMap<int>();
    for (int i = 0; i < CHUNK_FRAMES; ++i) {
        maskPtr[i] = (i < validFrames) ? 1 : 0;
    }

    if (gPipeline.streamChunkIdx == 0) {
        gPipeline.encKvMeta.remove = gPipeline.encKvMeta.previous;
    } else {
        gPipeline.encKvMeta.remove = 0;
    }
    gPipeline.encKvMeta.add = 8;
    auto encOuts = gPipeline.encStream->onForward({offset0, s1, s0, chunkFeat, chunkMask});
    gPipeline.encKvMeta.sync();

    VARP audioEmb = encOuts[0];
    std::memcpy(gPipeline.s0Buf.data(), encOuts[1]->readMap<float>(), 320 * sizeof(float));
    std::memcpy(gPipeline.s1Buf.data(), encOuts[2]->readMap<float>(), 256 * 40 * sizeof(float));
    gPipeline.streamChunkIdx++;

    int audioLen = audioEmb->getInfo()->dim[1];
    auto decMask = _Input({}, NCHW, halide_type_of<float>());
    decMask->writeMap<float>()[0] = 0.0f;

    auto posIds = _Input({1, audioLen}, NCHW, halide_type_of<int>());
    for (int i = 0; i < audioLen; ++i) posIds->writeMap<int>()[i] = gPipeline.streamDecPos++;

    if (gPipeline.streamDecPos == audioLen) {
        gPipeline.streamDecKvMeta.remove = gPipeline.streamDecKvMeta.previous;
    } else {
        gPipeline.streamDecKvMeta.remove = 0;
    }
    gPipeline.streamDecKvMeta.add = audioLen;
    VARP decOut = gPipeline.streamDecMod->onForward({audioEmb, decMask, posIds})[0];
    gPipeline.streamDecKvMeta.sync();

    auto lastHidden = _Input({1, 1, 768}, NCHW, halide_type_of<float>());
    std::memcpy(lastHidden->writeMap<float>(),
                decOut->readMap<float>() + (audioLen - 1) * 768,
                768 * sizeof(float));

    int maxTokens = gPipeline.config.decoder.maxTokenNum;
    int plhdId = gPipeline.config.decoder.placeholderTokenId;
    int eosId = gPipeline.config.decoder.eosId;
    int maxRepeat = gPipeline.config.decoder.maxRepeatTokens;
    int lastTok = gPipeline.streamTokens.empty() ? -1 : gPipeline.streamTokens.back();
    int repeatCount = 1;
    for (int step = 0; step < maxTokens; ++step) {
        if ((int)gPipeline.streamTokens.size() >= maxTokens) {
            break;
        }
        auto topkOut = gPipeline.streamTopkMod->onForward({lastHidden});
        int tokId = topkOut[0]->readMap<int>()[0];

        if (!isFinalChunk && tokId == plhdId) {
            // Synchronize decoder KV-cache and position with placeholder token to prevent RoPE context drift
            auto pv = _Input({1, 1}, NCHW, halide_type_of<int>());
            pv->writeMap<int>()[0] = tokId;
            VARP pe = gPipeline.streamEmbedMod->onForward({pv})[0];
            auto pp = _Input({1, 1}, NCHW, halide_type_of<int>());
            pp->writeMap<int>()[0] = gPipeline.streamDecPos++;
            gPipeline.streamDecKvMeta.remove = 0;
            gPipeline.streamDecKvMeta.add = 1;
            gPipeline.streamDecMod->onForward({pe, decMask, pp});
            gPipeline.streamDecKvMeta.sync();
            break;
        }
        if (tokId == eosId || (isFinalChunk && tokId == plhdId)) {
            break;
        }
        if (tokId == lastTok) {
            if (++repeatCount >= maxRepeat) break;
        } else {
            lastTok = tokId;
            repeatCount = 1;
        }
        gPipeline.streamTokens.push_back(tokId);

        auto nextIdVar = _Input({1, 1}, NCHW, halide_type_of<int>());
        nextIdVar->writeMap<int>()[0] = tokId;
        VARP nextEmb = gPipeline.streamEmbedMod->onForward({nextIdVar})[0];

        auto nextPosVar = _Input({1, 1}, NCHW, halide_type_of<int>());
        nextPosVar->writeMap<int>()[0] = gPipeline.streamDecPos++;

        gPipeline.streamDecKvMeta.remove = 0;
        gPipeline.streamDecKvMeta.add = 1;
        lastHidden = gPipeline.streamDecMod->onForward({nextEmb, decMask, nextPosVar})[0];
        gPipeline.streamDecKvMeta.sync();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    gPipeline.lastInferenceMs += std::chrono::duration<double, std::milli>(t1 - t0).count();
}

// ============================================================================
// 6. Exported C API (stream_asr_*)
// ============================================================================
extern "C" {

STREAM_ASR_EXPORT void stream_asr_reset_stream();
STREAM_ASR_EXPORT void stream_asr_reset_universal_stream();

STREAM_ASR_EXPORT int stream_asr_load_config_json(const char* jsonStr) {
    if (!jsonStr) return -1;
    parseConfigJson(std::string(jsonStr), gPipeline.config);
    gPipeline.enablePostSmooth = gPipeline.config.enablePostSmooth;
    if (gPipeline.vadInitialized) {
        gPipeline.vadDecoder.applyConfig(gPipeline.config.vad);
        gPipeline.vadSegmenter.applyConfig(gPipeline.config.vad, gPipeline.config.audio.sampleRate);
        gPipeline.tailVadProbe.threshold = gPipeline.config.vad.speechProbThreshold;
    }
    return 0;
}

STREAM_ASR_EXPORT int stream_asr_init(const char* rootDirCStr) {
    std::string rootDir = rootDirCStr ? rootDirCStr : "/model";
    std::string streamDir = rootDir + "/stream/";
    std::string noStreamDir = rootDir + "/no_stream/";

    // Symlink encoder_stream.mnn.weight -> encoder.mnn.weight so CPUExternalConst resolves precompute_posemb
    ::symlink((streamDir + "encoder.mnn.weight").c_str(), (streamDir + "encoder_stream.mnn.weight").c_str());

    if (!gPipeline.fbank.init(rootDir + "/cmvn.txt")) {
        std::cerr << "[StreamASR] Failed to load cmvn.txt" << std::endl;
        return -1;
    }
    if (!gPipeline.detok.init(rootDir + "/vocab.txt")) {
        std::cerr << "[StreamASR] Failed to load vocab.txt" << std::endl;
        return -2;
    }

    ScheduleConfig sConfig;
    sConfig.type = MNN_FORWARD_CPU;
    sConfig.numThread = std::clamp(gPipeline.config.numThreads, 1, 16);
    BackendConfig bConfig;
    bConfig.precision = BackendConfig::Precision_Low;
    bConfig.memory = BackendConfig::Memory_Low;
    sConfig.backendConfig = &bConfig;

    gPipeline.baseRtmgr.reset(Executor::RuntimeManager::createRuntimeManager(sConfig));
    gPipeline.baseRtmgr->setHint(Interpreter::DYNAMIC_QUANT_OPTIONS, 1);

    gPipeline.encStreamRtmgr.reset(Executor::RuntimeManager::createRuntimeManager(sConfig));
    gPipeline.encStreamRtmgr->setHint(Interpreter::DYNAMIC_QUANT_OPTIONS, 1);
    gPipeline.encStreamRtmgr->setHintPtr(Interpreter::KVCACHE_INFO, &gPipeline.encKvMeta);

    gPipeline.streamDecRtmgr.reset(Executor::RuntimeManager::createRuntimeManager(sConfig));
    gPipeline.streamDecRtmgr->setHint(Interpreter::DYNAMIC_QUANT_OPTIONS, 1);
    gPipeline.streamDecRtmgr->setHintPtr(Interpreter::KVCACHE_INFO, &gPipeline.streamDecKvMeta);

    gPipeline.noStreamDecRtmgr.reset(Executor::RuntimeManager::createRuntimeManager(sConfig));
    gPipeline.noStreamDecRtmgr->setHint(Interpreter::DYNAMIC_QUANT_OPTIONS, 1);
    gPipeline.noStreamDecRtmgr->setHintPtr(Interpreter::KVCACHE_INFO, &gPipeline.noStreamDecKvMeta);

    Module::Config mConfig;
    mConfig.shapeMutable = true;
    mConfig.rearrange = true;

    gPipeline.encBase.reset(Module::load({}, {}, (streamDir + "encoder.mnn").c_str(), gPipeline.baseRtmgr, &mConfig));
    if (!gPipeline.encBase) return -3;

    Module::Config encStreamConfig = mConfig;
    encStreamConfig.base = gPipeline.encBase.get();
    gPipeline.encStream.reset(Module::load(
        {"_offset_0", "_s_1", "_s_0", "fbank", "mask"},
        {"encoder_out", "Unsqueeze2___tr4audio_encoder.acoustic_front_end_module.conv.0.out_slice", "BinaryOp11___tr4audio_encoder.acoustic_front_end_module.conv.2.out_slice"},
        (streamDir + "encoder_stream.mnn").c_str(),
        gPipeline.encStreamRtmgr,
        &encStreamConfig
    ));
    if (!gPipeline.encStream) return -4;

    // Free weights from MEMFS to conserve memory
    ::unlink((streamDir + "encoder_stream.mnn.weight").c_str());
    ::unlink((streamDir + "encoder.mnn.weight").c_str());

    gPipeline.logitMod.reset(Module::load({}, {}, (streamDir + "logit.mnn").c_str(), gPipeline.baseRtmgr, &mConfig));
    if (!gPipeline.logitMod) return -5;
    ::unlink((streamDir + "logit.mnn.weight").c_str());

    Module::Config loraConfig = mConfig;
    loraConfig.base = gPipeline.logitMod.get();
    gPipeline.logitLoraMod.reset(Module::load({}, {}, (streamDir + "logit_lora.mnn").c_str(), gPipeline.baseRtmgr, &loraConfig));
    if (!gPipeline.logitLoraMod) return -6;
    ::unlink((streamDir + "logit_lora.mnn.weight").c_str());

    Module::Config streamSharedConfig = mConfig;
    streamSharedConfig.base = gPipeline.logitLoraMod.get();
    gPipeline.streamEmbedMod.reset(Module::load({}, {}, (streamDir + "embed.mnn").c_str(), gPipeline.baseRtmgr, &streamSharedConfig));
    gPipeline.streamTopkMod.reset(Module::load({}, {}, (streamDir + "logit_topkv_1.mnn").c_str(), gPipeline.baseRtmgr, &streamSharedConfig));
    if (!gPipeline.streamEmbedMod || !gPipeline.streamTopkMod) return -7;

    gPipeline.streamDecMod.reset(Module::load(
        {"input_embedding", "mask", "position_ids"},
        {"hidden_state"},
        (streamDir + "decoder.mnn").c_str(),
        gPipeline.streamDecRtmgr,
        &mConfig
    ));
    if (!gPipeline.streamDecMod) return -8;
    ::unlink((streamDir + "decoder.mnn.weight").c_str());

    // Optional no_stream modules
    std::ifstream nsCheck(noStreamDir + "decoder.mnn");
    if (nsCheck.good()) {
        nsCheck.close();
        Module::Config noStreamSharedConfig = mConfig;
        noStreamSharedConfig.base = gPipeline.logitMod.get();
        gPipeline.noStreamEmbedMod.reset(Module::load({}, {}, (noStreamDir + "embed.mnn").c_str(), gPipeline.baseRtmgr, &noStreamSharedConfig));
        gPipeline.noStreamTopkMod.reset(Module::load({}, {}, (noStreamDir + "logit_topkv_1.mnn").c_str(), gPipeline.baseRtmgr, &noStreamSharedConfig));
        gPipeline.noStreamDecMod.reset(Module::load(
            {"input_embedding", "mask", "position_ids"},
            {"hidden_state"},
            (noStreamDir + "decoder.mnn").c_str(),
            gPipeline.noStreamDecRtmgr,
            &mConfig
        ));
        ::unlink((noStreamDir + "decoder.mnn.weight").c_str());
    }

    std::string vadPath = rootDir + "/vad.mnn";
    std::ifstream vadFile(vadPath, std::ios::binary);
    if (vadFile) {
        vadFile.seekg(0, std::ios::end);
        size_t sz = vadFile.tellg();
        vadFile.seekg(0, std::ios::beg);
        std::vector<uint8_t> vadData(sz);
        vadFile.read(reinterpret_cast<char*>(vadData.data()), sz);
        vadFile.close();

        gPipeline.vadEncoder = std::make_unique<NeuralVadEncoder>();
        if (gPipeline.vadEncoder->init(vadData.data(), sz)) {
            gPipeline.vadInitialized = true;
            gPipeline.vadDecoder.applyConfig(gPipeline.config.vad);
            gPipeline.vadSegmenter.applyConfig(gPipeline.config.vad, gPipeline.config.audio.sampleRate);
            gPipeline.tailVadProbe.threshold = gPipeline.config.vad.speechProbThreshold;
            std::cout << "[StreamASR] VAD neural engine loaded (" << sz << " bytes)." << std::endl;
        }
    }

    gPipeline.initialized = true;
    stream_asr_reset_universal_stream();
    return 0;
}

STREAM_ASR_EXPORT void stream_asr_set_post_smooth(int enable) {
    gPipeline.enablePostSmooth = (enable != 0);
}

STREAM_ASR_EXPORT void stream_asr_set_two_pass(int enable) {
    gPipeline.config.enableTwoPass = (enable != 0);
    if (!gPipeline.config.enableTwoPass) {
        gPipeline.pendingRefinePcm.clear();
        gPipeline.pendingRefineSegIndex = -1;
    }
}

STREAM_ASR_EXPORT void stream_asr_reset_stream() {
    gPipeline.pcmQueue.clear();
    gPipeline.fbankQueue.clear();
    gPipeline.fbankFramesQueued = 0;
    gPipeline.s0Buf.assign(320, 0.0f);
    gPipeline.s1Buf.assign(256 * 40, 0.0f);
    gPipeline.streamChunkIdx = 0;
    gPipeline.streamDecPos = 0;
    gPipeline.noStreamDecPos = 0;
    gPipeline.streamTokens.clear();
    gPipeline.lastTranscript.clear();
    gPipeline.lastTokenCount = 0;
    gPipeline.lastInferenceMs = 0.0;

    gPipeline.encKvMeta.remove = gPipeline.encKvMeta.previous;
    gPipeline.encKvMeta.add = 0;
    gPipeline.streamDecKvMeta.remove = gPipeline.streamDecKvMeta.previous;
    gPipeline.streamDecKvMeta.add = 0;
    gPipeline.noStreamDecKvMeta.remove = gPipeline.noStreamDecKvMeta.previous;
    gPipeline.noStreamDecKvMeta.add = 0;
}

STREAM_ASR_EXPORT const char* stream_asr_accept_waveform(const float* samples, int numSamples, int isFinal) {
    if (!gPipeline.initialized) return "";
    if (samples && numSamples > 0) {
        scaleToKaldiPcm(samples, numSamples, gPipeline.pcmQueue);
    }

    const int CHUNK_FRAMES = 32;

    if (isFinal != 0) {
        int remSamples = static_cast<int>(gPipeline.pcmQueue.size());
        int extractableFrames = (remSamples >= AudioPreprocessor::FRAME_LEN)
            ? ((remSamples - AudioPreprocessor::FRAME_LEN) / AudioPreprocessor::FRAME_SHIFT + 1)
            : 0;
        int totalRemFrames = gPipeline.fbankFramesQueued + extractableFrames;
        // Add 1 extra flush chunk (32 frames / 320ms) upon isFinal to flush causal convolutional receptive field
        int targetFrames = ((totalRemFrames + CHUNK_FRAMES - 1) / CHUNK_FRAMES + 1) * CHUNK_FRAMES;
        int neededExtractFrames = targetFrames - gPipeline.fbankFramesQueued;
        if (neededExtractFrames > 0) {
            int neededSamples = (neededExtractFrames - 1) * AudioPreprocessor::FRAME_SHIFT + AudioPreprocessor::FRAME_LEN;
            if (neededSamples > remSamples) {
                gPipeline.pcmQueue.insert(gPipeline.pcmQueue.end(), neededSamples - remSamples, 0.0f);
            }
        }
    }

    while (static_cast<int>(gPipeline.pcmQueue.size()) >= AudioPreprocessor::FRAME_LEN) {
        size_t oldFbankFloats = gPipeline.fbankQueue.size();
        gPipeline.fbankQueue.resize(oldFbankFloats + AudioPreprocessor::NUM_BINS);
        gPipeline.fbank.computeFrame(gPipeline.pcmQueue.data(), gPipeline.fbankQueue.data() + oldFbankFloats, gPipeline.config.audio.preEmphasis);
        gPipeline.fbankFramesQueued++;
        gPipeline.pcmQueue.erase(gPipeline.pcmQueue.begin(), gPipeline.pcmQueue.begin() + AudioPreprocessor::FRAME_SHIFT);
    }

    while (gPipeline.fbankFramesQueued >= CHUNK_FRAMES) {
        bool finalChunk = (isFinal != 0) && (gPipeline.fbankFramesQueued == CHUNK_FRAMES);
        runOneStreamChunk(gPipeline.fbankQueue.data(), CHUNK_FRAMES, finalChunk);
        gPipeline.fbankQueue.erase(gPipeline.fbankQueue.begin(), gPipeline.fbankQueue.begin() + CHUNK_FRAMES * AudioPreprocessor::NUM_BINS);
        gPipeline.fbankFramesQueued -= CHUNK_FRAMES;
    }

    if (isFinal != 0 && gPipeline.fbankFramesQueued > 0) {
        runOneStreamChunk(gPipeline.fbankQueue.data(), gPipeline.fbankFramesQueued, true);
        gPipeline.fbankQueue.clear();
        gPipeline.fbankFramesQueued = 0;
    }

    gPipeline.lastTokenCount = static_cast<int>(gPipeline.streamTokens.size());
    std::string rawText = gPipeline.detok.decode(gPipeline.streamTokens);
    gPipeline.lastTranscript = gPipeline.enablePostSmooth ? postProcessSmooth(rawText, false) : rawText;
    return gPipeline.lastTranscript.c_str();
}

STREAM_ASR_EXPORT const char* stream_asr_decode_offline(const float* samples, int numSamples) {
    if (!gPipeline.initialized || !samples || numSamples <= 0) return "";
    if (!gPipeline.noStreamDecMod) {
        stream_asr_reset_stream();
        return stream_asr_accept_waveform(samples, numSamples, 1);
    }

    auto t0 = std::chrono::high_resolution_clock::now();
    std::vector<float> pcm;
    scaleToKaldiPcm(samples, numSamples, pcm);

    int rawSamples = static_cast<int>(pcm.size());
    int rawFrames = (rawSamples >= AudioPreprocessor::FRAME_LEN)
        ? (1 + (rawSamples - AudioPreprocessor::FRAME_LEN) / AudioPreprocessor::FRAME_SHIFT)
        : 0;
    int paddedFrames = (rawFrames == 0) ? 32 : ((rawFrames + 31) / 32) * 32;
    int neededSamples = (paddedFrames - 1) * AudioPreprocessor::FRAME_SHIFT + AudioPreprocessor::FRAME_LEN;
    if (neededSamples > rawSamples) {
        pcm.insert(pcm.end(), neededSamples - rawSamples, 0.0f);
    }

    std::vector<float> fbank(paddedFrames * AudioPreprocessor::NUM_BINS);
    for (int f = 0; f < paddedFrames; ++f) {
        gPipeline.fbank.computeFrame(pcm.data() + f * AudioPreprocessor::FRAME_SHIFT, fbank.data() + f * AudioPreprocessor::NUM_BINS, gPipeline.config.audio.preEmphasis);
    }

    auto featVar = _Input({1, paddedFrames, 80}, NCHW, halide_type_of<float>());
    float* featPtr = featVar->writeMap<float>();
    std::memcpy(featPtr, fbank.data(), paddedFrames * 80 * sizeof(float));

    auto maskVar = _Input({1, paddedFrames}, NCHW, halide_type_of<int>());
    int* maskPtr = maskVar->writeMap<int>();
    for (int i = 0; i < paddedFrames; ++i) maskPtr[i] = 1;

    VARP audioEmb = gPipeline.encBase->onForward({featVar, maskVar})[0];
    int audioLen = audioEmb->getInfo()->dim[1];

    auto prefixIds = _Input({1, 3}, NCHW, halide_type_of<int>());
    prefixIds->writeMap<int>()[0] = 529;
    prefixIds->writeMap<int>()[1] = 23641;
    prefixIds->writeMap<int>()[2] = 531;
    VARP prefixEmb = gPipeline.noStreamEmbedMod->onForward({prefixIds})[0];

    auto suffixIds = _Input({1, 3}, NCHW, halide_type_of<int>());
    suffixIds->writeMap<int>()[0] = 1912;
    suffixIds->writeMap<int>()[1] = 23641;
    suffixIds->writeMap<int>()[2] = 531;
    VARP suffixEmb = gPipeline.noStreamEmbedMod->onForward({suffixIds})[0];

    int totalPrefill = 3 + audioLen + 3;
    auto prefillEmb = _Input({1, totalPrefill, 768}, NCHW, halide_type_of<float>());
    float* dstEmb = prefillEmb->writeMap<float>();
    std::memcpy(dstEmb, prefixEmb->readMap<float>(), 3 * 768 * sizeof(float));
    std::memcpy(dstEmb + 3 * 768, audioEmb->readMap<float>(), audioLen * 768 * sizeof(float));
    std::memcpy(dstEmb + (3 + audioLen) * 768, suffixEmb->readMap<float>(), 3 * 768 * sizeof(float));

    auto decMask = _Input({}, NCHW, halide_type_of<float>());
    decMask->writeMap<float>()[0] = 0.0f;
    auto posIds = _Input({1, totalPrefill}, NCHW, halide_type_of<int>());
    for (int i = 0; i < totalPrefill; ++i) posIds->writeMap<int>()[i] = i;

    gPipeline.noStreamDecKvMeta.remove = gPipeline.noStreamDecKvMeta.previous;
    gPipeline.noStreamDecKvMeta.add = totalPrefill;
    VARP decOut = gPipeline.noStreamDecMod->onForward({prefillEmb, decMask, posIds})[0];
    gPipeline.noStreamDecKvMeta.sync();

    auto lastHidden = _Input({1, 1, 768}, NCHW, halide_type_of<float>());
    std::memcpy(lastHidden->writeMap<float>(),
                decOut->readMap<float>() + (totalPrefill - 1) * 768,
                768 * sizeof(float));

    int curPos = totalPrefill;
    std::vector<int> outTokens;
    int lastTok = -1;
    int repeatCount = 1;
    for (int step = 0; step < 1000; ++step) {
        auto topkOut = gPipeline.noStreamTopkMod->onForward({lastHidden});
        int tokId = topkOut[0]->readMap<int>()[0];
        if (tokId == 2) break;
        if (tokId == lastTok) {
            if (++repeatCount >= 15) break;
        } else {
            lastTok = tokId;
            repeatCount = 1;
        }
        outTokens.push_back(tokId);

        auto nextIdVar = _Input({1, 1}, NCHW, halide_type_of<int>());
        nextIdVar->writeMap<int>()[0] = tokId;
        VARP nextEmb = gPipeline.noStreamEmbedMod->onForward({nextIdVar})[0];

        auto nextPosVar = _Input({1, 1}, NCHW, halide_type_of<int>());
        nextPosVar->writeMap<int>()[0] = curPos++;

        gPipeline.noStreamDecKvMeta.remove = 0;
        gPipeline.noStreamDecKvMeta.add = 1;
        lastHidden = gPipeline.noStreamDecMod->onForward({nextEmb, decMask, nextPosVar})[0];
        gPipeline.noStreamDecKvMeta.sync();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    gPipeline.lastInferenceMs = std::chrono::duration<double, std::milli>(t1 - t0).count();
    gPipeline.lastTokenCount = static_cast<int>(outTokens.size());
    std::string rawOfflineText = gPipeline.detok.decode(outTokens);
    gPipeline.lastTranscript = gPipeline.enablePostSmooth ? postProcessSmooth(rawOfflineText, false) : rawOfflineText;
    return gPipeline.lastTranscript.c_str();
}

STREAM_ASR_EXPORT int stream_asr_get_decoded_token_count() {
    return gPipeline.lastTokenCount;
}

STREAM_ASR_EXPORT double stream_asr_get_last_inference_ms() {
    return gPipeline.lastInferenceMs;
}

STREAM_ASR_EXPORT void stream_asr_reset_universal_stream() {
    stream_asr_reset_stream();
    gPipeline.vadFbank.reset();
    if (gPipeline.vadEncoder) gPipeline.vadEncoder->reset();
    gPipeline.vadDecoder.reset();
    gPipeline.tailVadProbe.reset();
    gPipeline.vadSegmenter.reset();
    gPipeline.universalSegments.clear();
    gPipeline.universalTranscript.clear();
    gPipeline.liveUniversalTranscript.clear();
    gPipeline.curSentencePcm.clear();
    gPipeline.pendingRefinePcm.clear();
    gPipeline.pendingRefineSegIndex = -1;
    gPipeline.tailVadState = 0;
    gPipeline.streamActive = false;
    gPipeline.preRollPcm.clear();
}

STREAM_ASR_EXPORT const char* stream_asr_accept_waveform_universal(const float* samples, int numSamples, int isFinal) {
    if (!gPipeline.initialized) return "";

    if (!gPipeline.vadInitialized || !gPipeline.vadEncoder) {
        return stream_asr_accept_waveform(samples, numSamples, isFinal);
    }

    auto t0 = std::chrono::high_resolution_clock::now();

    if (samples && numSamples > 0) {
        std::vector<float> normPcm;
        scaleToNormalizedPcm(samples, numSamples, normPcm);
        gPipeline.vadFbank.wavBuf.insert(gPipeline.vadFbank.wavBuf.end(), normPcm.begin(), normPcm.end());
        gPipeline.vadSegmenter.addSamples(numSamples);
    }

    bool segmentStarted = false;
    bool segmentEnded = false;
    while (static_cast<int>(gPipeline.vadFbank.wavBuf.size()) >= MelBankFeature::STFT_WIN) {
        float mel84[MelBankFeature::NUM_MEL_BINS];
        gPipeline.vadFbank.computeFrame(gPipeline.vadFbank.wavBuf.data(), mel84);

        float prob = gPipeline.vadEncoder->forwardFrame(mel84);
        gPipeline.tailVadState = gPipeline.tailVadProbe.processFrame(prob, false);
        auto evt = gPipeline.vadDecoder.processFrame(prob, false);

        if (evt.type == VadDecoder::SegmentEvent::START) {
            segmentStarted = true;
        } else if (evt.type == VadDecoder::SegmentEvent::END ||
            gPipeline.vadSegmenter.curSegmentSamples >= gPipeline.vadSegmenter.maxSegmentSamples) {
            segmentEnded = true;
        }

        gPipeline.vadFbank.wavBuf.erase(gPipeline.vadFbank.wavBuf.begin(),
                                        gPipeline.vadFbank.wavBuf.begin() + MelBankFeature::STFT_SHIFT);
    }

    // Gated audio routing:
    // If not currently in active speech, buffer samples in preRollPcm until speech onset is confirmed.
    if (!gPipeline.streamActive) {
        if (segmentStarted || gPipeline.vadDecoder.inSpeech) {
            gPipeline.streamActive = true;
            gPipeline.vadSegmenter.reset();
            if (!gPipeline.preRollPcm.empty()) {
                if (gPipeline.config.enableTwoPass) {
                    const size_t MAX_TWO_PASS_BUF = static_cast<size_t>(gPipeline.vadSegmenter.maxSegmentSamples);
                    if (gPipeline.curSentencePcm.size() + gPipeline.preRollPcm.size() <= MAX_TWO_PASS_BUF) {
                        gPipeline.curSentencePcm.insert(gPipeline.curSentencePcm.end(),
                                                       gPipeline.preRollPcm.begin(), gPipeline.preRollPcm.end());
                    }
                }
                stream_asr_accept_waveform(gPipeline.preRollPcm.data(), static_cast<int>(gPipeline.preRollPcm.size()), 0);
                gPipeline.preRollPcm.clear();
            }
            if (samples && numSamples > 0) {
                if (gPipeline.config.enableTwoPass) {
                    const size_t MAX_TWO_PASS_BUF = static_cast<size_t>(gPipeline.vadSegmenter.maxSegmentSamples);
                    if (gPipeline.curSentencePcm.size() + numSamples <= MAX_TWO_PASS_BUF) {
                        gPipeline.curSentencePcm.insert(gPipeline.curSentencePcm.end(), samples, samples + numSamples);
                    }
                }
                stream_asr_accept_waveform(samples, numSamples, 0);
            }
        } else {
            // Still in IDLE silence: buffer samples into preRollPcm and DO NOT run heavy Transformer
            if (samples && numSamples > 0) {
                gPipeline.preRollPcm.insert(gPipeline.preRollPcm.end(), samples, samples + numSamples);
                if (gPipeline.preRollPcm.size() > StreamSpeechPipeline::MAX_PRE_ROLL_SAMPLES) {
                    size_t excess = gPipeline.preRollPcm.size() - StreamSpeechPipeline::MAX_PRE_ROLL_SAMPLES;
                    gPipeline.preRollPcm.erase(gPipeline.preRollPcm.begin(), gPipeline.preRollPcm.begin() + excess);
                }
            }
        }
    } else {
        // Speech stream is active: feed audio directly to maintain continuous causal KV-cache & RoPE timing
        if (samples && numSamples > 0) {
            if (gPipeline.config.enableTwoPass) {
                const size_t MAX_TWO_PASS_BUF = static_cast<size_t>(gPipeline.vadSegmenter.maxSegmentSamples);
                if (gPipeline.curSentencePcm.size() + numSamples <= MAX_TWO_PASS_BUF) {
                    gPipeline.curSentencePcm.insert(gPipeline.curSentencePcm.end(), samples, samples + numSamples);
                }
            }
            stream_asr_accept_waveform(samples, numSamples, 0);
        }
    }

    if (segmentEnded) {
        if (gPipeline.streamActive) {
            stream_asr_accept_waveform(nullptr, 0, 1);
            std::string segText = gPipeline.lastTranscript;
            if (!segText.empty()) {
                int segIdx = static_cast<int>(gPipeline.universalSegments.size());
                gPipeline.universalSegments.push_back(segText);
                gPipeline.rebuildUniversalTranscript();

                // Prepare asynchronous refinement buffer (non-blocking)
                if (gPipeline.config.enableTwoPass && gPipeline.noStreamDecMod && !gPipeline.curSentencePcm.empty()) {
                    gPipeline.pendingRefinePcm = std::move(gPipeline.curSentencePcm);
                    gPipeline.pendingRefineSegIndex = segIdx;
                }
            }
            gPipeline.curSentencePcm.clear();
            stream_asr_reset_stream();
            gPipeline.streamActive = false;
        }
        gPipeline.preRollPcm.clear();
        gPipeline.vadSegmenter.reset();
        gPipeline.vadDecoder.reset();
    }

    if (isFinal != 0) {
        if (static_cast<int>(gPipeline.vadFbank.wavBuf.size()) > MelBankFeature::STFT_SHIFT) {
            int pad = MelBankFeature::STFT_WIN - static_cast<int>(gPipeline.vadFbank.wavBuf.size());
            if (pad > 0) gPipeline.vadFbank.wavBuf.insert(gPipeline.vadFbank.wavBuf.end(), pad, 0.0f);
            float mel84[MelBankFeature::NUM_MEL_BINS];
            gPipeline.vadFbank.computeFrame(gPipeline.vadFbank.wavBuf.data(), mel84);
            float prob = gPipeline.vadEncoder->forwardFrame(mel84);
            gPipeline.tailVadState = gPipeline.tailVadProbe.processFrame(prob, true);
            gPipeline.vadDecoder.processFrame(prob, true);
        } else {
            gPipeline.tailVadState = gPipeline.tailVadProbe.processFrame(0.0f, true);
            gPipeline.vadDecoder.processFrame(0.0f, true);
        }

        // If audio ended before beginWindow filled (e.g. short audio clip), flush preRoll buffer if voice detected
        if (!gPipeline.streamActive && !gPipeline.preRollPcm.empty() && (gPipeline.tailVadProbe.voiceCount > 0 || gPipeline.vadDecoder.inSpeech)) {
            gPipeline.streamActive = true;
            stream_asr_accept_waveform(gPipeline.preRollPcm.data(), static_cast<int>(gPipeline.preRollPcm.size()), 0);
            gPipeline.preRollPcm.clear();
        }

        if (gPipeline.streamActive) {
            stream_asr_accept_waveform(nullptr, 0, 1);
            std::string finalSeg = gPipeline.lastTranscript;
            if (!finalSeg.empty()) {
                int segIdx = static_cast<int>(gPipeline.universalSegments.size());
                gPipeline.universalSegments.push_back(finalSeg);
                gPipeline.rebuildUniversalTranscript();

                // Prepare asynchronous refinement buffer (non-blocking)
                if (gPipeline.config.enableTwoPass && gPipeline.noStreamDecMod && !gPipeline.curSentencePcm.empty()) {
                    gPipeline.pendingRefinePcm = std::move(gPipeline.curSentencePcm);
                    gPipeline.pendingRefineSegIndex = segIdx;
                }
            }
            gPipeline.curSentencePcm.clear();
            stream_asr_reset_stream();
            gPipeline.streamActive = false;
        }
        gPipeline.preRollPcm.clear();
        gPipeline.vadSegmenter.reset();
        gPipeline.vadDecoder.reset();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    gPipeline.lastInferenceMs = std::chrono::duration<double, std::milli>(t1 - t0).count();

    gPipeline.liveUniversalTranscript = gPipeline.universalTranscript;
    if (!gPipeline.lastTranscript.empty()) {
        if (!gPipeline.liveUniversalTranscript.empty() && gPipeline.liveUniversalTranscript.back() != ' ') {
            gPipeline.liveUniversalTranscript += " ";
        }
        gPipeline.liveUniversalTranscript += gPipeline.lastTranscript;
    }
    return gPipeline.liveUniversalTranscript.c_str();
}

STREAM_ASR_EXPORT int stream_asr_has_pending_refine() {
    return (gPipeline.config.enableTwoPass && !gPipeline.pendingRefinePcm.empty() && gPipeline.pendingRefineSegIndex >= 0) ? 1 : 0;
}

STREAM_ASR_EXPORT const char* stream_asr_run_pending_refine() {
    if (!gPipeline.initialized || !gPipeline.noStreamDecMod || gPipeline.pendingRefinePcm.empty() || gPipeline.pendingRefineSegIndex < 0) {
        return gPipeline.liveUniversalTranscript.c_str();
    }

    auto t0 = std::chrono::high_resolution_clock::now();
    int segIdx = gPipeline.pendingRefineSegIndex;
    std::vector<float> pcmToDecode = std::move(gPipeline.pendingRefinePcm);
    gPipeline.pendingRefinePcm.clear();
    gPipeline.pendingRefineSegIndex = -1;

    std::string refinedText = stream_asr_decode_offline(pcmToDecode.data(), static_cast<int>(pcmToDecode.size()));
    if (!refinedText.empty() && segIdx >= 0 && segIdx < static_cast<int>(gPipeline.universalSegments.size())) {
        gPipeline.universalSegments[segIdx] = refinedText;
        gPipeline.rebuildUniversalTranscript();
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    gPipeline.lastInferenceMs = std::chrono::duration<double, std::milli>(t1 - t0).count();

    gPipeline.lastTranscript.clear();
    gPipeline.liveUniversalTranscript = gPipeline.universalTranscript;
    return gPipeline.liveUniversalTranscript.c_str();
}

STREAM_ASR_EXPORT void stream_asr_cancel_pending_refine() {
    gPipeline.pendingRefinePcm.clear();
    gPipeline.pendingRefineSegIndex = -1;
}

STREAM_ASR_EXPORT const char* stream_asr_decode_universal(const float* samples, int numSamples) {
    if (!gPipeline.initialized || !samples || numSamples <= 0) return "";

    if (!gPipeline.vadInitialized || !gPipeline.vadEncoder) {
        return stream_asr_decode_offline(samples, numSamples);
    }

    auto t0 = std::chrono::high_resolution_clock::now();

    stream_asr_reset_universal_stream();

    std::vector<float> normPcm;
    scaleToNormalizedPcm(samples, numSamples, normPcm);

    std::vector<float> vadBuf;
    vadBuf.assign(MelBankFeature::STFT_WIN - MelBankFeature::STFT_SHIFT, 0.0f);
    vadBuf.insert(vadBuf.end(), normPcm.begin(), normPcm.end());

    int numVadFrames = (static_cast<int>(vadBuf.size()) >= MelBankFeature::STFT_WIN)
        ? (1 + (static_cast<int>(vadBuf.size()) - MelBankFeature::STFT_WIN) / MelBankFeature::STFT_SHIFT)
        : 0;

    if (static_cast<int>(vadBuf.size()) != (numVadFrames - 1) * MelBankFeature::STFT_SHIFT + MelBankFeature::STFT_WIN) {
        int needed = numVadFrames * MelBankFeature::STFT_SHIFT + MelBankFeature::STFT_WIN;
        if (needed > static_cast<int>(vadBuf.size())) {
            vadBuf.insert(vadBuf.end(), needed - vadBuf.size(), 0.0f);
            numVadFrames += 1;
        }
    }

    struct SegmentSpan {
        int startSample;
        int endSample;
    };
    std::vector<SegmentSpan> spans;
    int curStartSample = -1;

    for (int f = 0; f < numVadFrames; ++f) {
        bool isFinalFrame = (f == numVadFrames - 1);
        float mel84[MelBankFeature::NUM_MEL_BINS];
        gPipeline.vadFbank.computeFrame(vadBuf.data() + f * MelBankFeature::STFT_SHIFT, mel84);

        float prob = gPipeline.vadEncoder->forwardFrame(mel84);
        gPipeline.tailVadState = gPipeline.tailVadProbe.processFrame(prob, isFinalFrame);
        auto evt = gPipeline.vadDecoder.processFrame(prob, isFinalFrame);

        if (evt.type == VadDecoder::SegmentEvent::START) {
            curStartSample = std::max(0, evt.frame * MelBankFeature::STFT_SHIFT);
        } else if (evt.type == VadDecoder::SegmentEvent::END && curStartSample >= 0) {
            int endSample = std::min(numSamples, (evt.frame + 1) * MelBankFeature::STFT_SHIFT);
            if (endSample > curStartSample + 160) {
                spans.push_back({curStartSample, endSample});
            }
            curStartSample = -1;
        }
    }

    if (curStartSample >= 0 && curStartSample < numSamples) {
        spans.push_back({curStartSample, numSamples});
    }

    if (spans.empty()) {
        spans.push_back({0, numSamples});
    }

    gPipeline.universalTranscript.clear();
    int totalTokens = 0;

    for (const auto& span : spans) {
        int spanLen = span.endSample - span.startSample;
        if (spanLen <= 0) continue;

        int pos = span.startSample;
        while (pos < span.endSample) {
            int chunkLen = std::min(span.endSample - pos, gPipeline.vadSegmenter.maxSegmentSamples);
            std::string text = stream_asr_decode_offline(samples + pos, chunkLen);
            totalTokens += gPipeline.lastTokenCount;
            if (!text.empty()) {
                if (!gPipeline.universalTranscript.empty()) gPipeline.universalTranscript += " ";
                gPipeline.universalTranscript += text;
            }
            pos += chunkLen;
        }
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    gPipeline.lastInferenceMs = std::chrono::duration<double, std::milli>(t1 - t0).count();
    gPipeline.lastTokenCount = totalTokens;
    return gPipeline.universalTranscript.c_str();
}

STREAM_ASR_EXPORT int stream_asr_get_tail_vad_state() {
    return gPipeline.tailVadState;
}

STREAM_ASR_EXPORT int stream_asr_is_speech_active() {
    return gPipeline.vadDecoder.inSpeech ? 1 : 0;
}

} // extern "C"
