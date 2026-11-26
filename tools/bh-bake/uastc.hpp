#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace bh_uastc {

inline void write_bits(uint8_t* buf, int bit_pos, int width, uint32_t val) {
  for (int i = 0; i < width; ++i) {
    if ((val >> i) & 1u) {
      int b = bit_pos + i;
      buf[b >> 3] |= static_cast<uint8_t>(1u << (b & 7));
    }
  }
}

// Encodes one 4x4 RGBA8 block (row-major, 16 pixels x 4 bytes) using UASTC Mode 5
// (1 subset, 8-bit RGB endpoints, 3-bit weights, 2-bit anchor weight w0).
inline void encode_block_mode5(const uint8_t px[16][4], uint8_t out_block[16]) {
  std::memset(out_block, 0, 16);

  uint8_t min_c[3] = {255, 255, 255};
  uint8_t max_c[3] = {0, 0, 0};
  float mean[3] = {0.0f, 0.0f, 0.0f};
  for (int i = 0; i < 16; ++i) {
    for (int c = 0; c < 3; ++c) {
      min_c[c] = std::min(min_c[c], px[i][c]);
      max_c[c] = std::max(max_c[c], px[i][c]);
      mean[c] += static_cast<float>(px[i][c]);
    }
  }
  mean[0] *= 1.0f / 16.0f;
  mean[1] *= 1.0f / 16.0f;
  mean[2] *= 1.0f / 16.0f;

  // Covariance-aligned principal direction via 4 power iterations from diagonal vector
  float cov[6] = {0, 0, 0, 0, 0, 0}; // xx, xy, xz, yy, yz, zz
  for (int i = 0; i < 16; ++i) {
    float dx = static_cast<float>(px[i][0]) - mean[0];
    float dy = static_cast<float>(px[i][1]) - mean[1];
    float dz = static_cast<float>(px[i][2]) - mean[2];
    cov[0] += dx * dx;
    cov[1] += dx * dy;
    cov[2] += dx * dz;
    cov[3] += dy * dy;
    cov[4] += dy * dz;
    cov[5] += dz * dz;
  }

  float axis[3] = {
      static_cast<float>(max_c[0] - min_c[0]) + 1e-3f,
      static_cast<float>(max_c[1] - min_c[1]) + 1e-3f,
      static_cast<float>(max_c[2] - min_c[2]) + 1e-3f};
  for (int it = 0; it < 6; ++it) {
    float nx = cov[0] * axis[0] + cov[1] * axis[1] + cov[2] * axis[2];
    float ny = cov[1] * axis[0] + cov[3] * axis[1] + cov[4] * axis[2];
    float nz = cov[2] * axis[0] + cov[4] * axis[1] + cov[5] * axis[2];
    float len = std::sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-6f) {
      axis[0] = nx / len;
      axis[1] = ny / len;
      axis[2] = nz / len;
    }
  }
  float alen = std::sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
  if (alen > 1e-6f) {
    axis[0] /= alen;
    axis[1] /= alen;
    axis[2] /= alen;
  }

  float min_t = 1e9f;
  float max_t = -1e9f;
  float t_vals[16];
  for (int i = 0; i < 16; ++i) {
    float dx = static_cast<float>(px[i][0]) - mean[0];
    float dy = static_cast<float>(px[i][1]) - mean[1];
    float dz = static_cast<float>(px[i][2]) - mean[2];
    float t = dx * axis[0] + dy * axis[1] + dz * axis[2];
    t_vals[i] = t;
    min_t = std::min(min_t, t);
    max_t = std::max(max_t, t);
  }

  float e0f[3], e1f[3];
  for (int c = 0; c < 3; ++c) {
    e0f[c] = std::clamp(mean[c] + axis[c] * min_t, 0.0f, 255.0f);
    e1f[c] = std::clamp(mean[c] + axis[c] * max_t, 0.0f, 255.0f);
  }

  // Compute initial 3-bit weights (0..7)
  uint8_t w[16];
  float span = max_t - min_t;
  if (span < 1e-4f) {
    std::fill(w, w + 16, uint8_t(0));
  } else {
    float inv_span = 1.0f / span;
    for (int i = 0; i < 16; ++i) {
      float u = (t_vals[i] - min_t) * inv_span;
      int qi = static_cast<int>(std::lround(u * 7.0f));
      w[i] = static_cast<uint8_t>(std::clamp(qi, 0, 7));
    }

    // 1-step least-squares endpoint refinement holding quantized weights fixed
    double sum_a2 = 0.0, sum_b2 = 0.0, sum_ab = 0.0;
    double rhs0[3] = {0.0, 0.0, 0.0};
    double rhs1[3] = {0.0, 0.0, 0.0};
    for (int i = 0; i < 16; ++i) {
      double b = static_cast<double>(w[i]) / 7.0;
      double a = 1.0 - b;
      sum_a2 += a * a;
      sum_b2 += b * b;
      sum_ab += a * b;
      for (int c = 0; c < 3; ++c) {
        double y = static_cast<double>(px[i][c]);
        rhs0[c] += a * y;
        rhs1[c] += b * y;
      }
    }
    double det = sum_a2 * sum_b2 - sum_ab * sum_ab;
    if (det > 1e-6) {
      for (int c = 0; c < 3; ++c) {
        double v0 = (rhs0[c] * sum_b2 - rhs1[c] * sum_ab) / det;
        double v1 = (sum_a2 * rhs1[c] - sum_ab * rhs0[c]) / det;
        e0f[c] = static_cast<float>(std::clamp(v0, 0.0, 255.0));
        e1f[c] = static_cast<float>(std::clamp(v1, 0.0, 255.0));
      }
      // Re-quantize weights against refined endpoints
      float d[3] = {e1f[0] - e0f[0], e1f[1] - e0f[1], e1f[2] - e0f[2]};
      float d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      if (d2 > 1e-4f) {
        for (int i = 0; i < 16; ++i) {
          float dotp = (px[i][0] - e0f[0]) * d[0] + (px[i][1] - e0f[1]) * d[1] +
                       (px[i][2] - e0f[2]) * d[2];
          int qi = static_cast<int>(std::lround((dotp / d2) * 7.0f));
          w[i] = static_cast<uint8_t>(std::clamp(qi, 0, 7));
        }
      }
    }
  }

  uint8_t e0[3] = {
      static_cast<uint8_t>(std::lround(e0f[0])),
      static_cast<uint8_t>(std::lround(e0f[1])),
      static_cast<uint8_t>(std::lround(e0f[2]))};
  uint8_t e1[3] = {
      static_cast<uint8_t>(std::lround(e1f[0])),
      static_cast<uint8_t>(std::lround(e1f[1])),
      static_cast<uint8_t>(std::lround(e1f[2]))};

  // Anchor constraint on pixel 0: w[0] must fit in 2 bits (<= 3)
  if (w[0] >= 4) {
    for (int c = 0; c < 3; ++c) std::swap(e0[c], e1[c]);
    for (int i = 0; i < 16; ++i) w[i] = static_cast<uint8_t>(7 - w[i]);
  }

  // Mode 5 = 0b01011 (11) in 5 bits, 15 hint bits = 0, 6x8-bit endpoints at bit 20..67,
  // 2-bit w[0] at bit 68..69, 15x3-bit w[1..15] at bit 70..114.
  write_bits(out_block, 0, 5, 11u);
  write_bits(out_block, 20, 8, e0[0]);
  write_bits(out_block, 28, 8, e1[0]);
  write_bits(out_block, 36, 8, e0[1]);
  write_bits(out_block, 44, 8, e1[1]);
  write_bits(out_block, 52, 8, e0[2]);
  write_bits(out_block, 60, 8, e1[2]);
  write_bits(out_block, 68, 2, w[0]);
  for (int i = 1; i < 16; ++i) {
    write_bits(out_block, 70 + (i - 1) * 3, 3, w[i]);
  }
}

inline void encode_image_rgba8(
    int width,
    int height,
    const uint8_t* rgba,
    std::vector<uint8_t>& out_blocks) {
  int bx = (width + 3) / 4;
  int by = (height + 3) / 4;
  out_blocks.resize(static_cast<size_t>(bx) * by * 16);
  for (int ty = 0; ty < by; ++ty) {
    for (int tx = 0; tx < bx; ++tx) {
      uint8_t block_px[16][4];
      for (int py = 0; py < 4; ++py) {
        int sy = std::min(height - 1, ty * 4 + py);
        for (int px_i = 0; px_i < 4; ++px_i) {
          int sx = std::min(width - 1, tx * 4 + px_i);
          const uint8_t* src = rgba + (static_cast<size_t>(sy) * width + sx) * 4;
          int idx = py * 4 + px_i;
          block_px[idx][0] = src[0];
          block_px[idx][1] = src[1];
          block_px[idx][2] = src[2];
          block_px[idx][3] = 255;
        }
      }
      encode_block_mode5(block_px, out_blocks.data() + (static_cast<size_t>(ty) * bx + tx) * 16);
    }
  }
}

} // namespace bh_uastc
