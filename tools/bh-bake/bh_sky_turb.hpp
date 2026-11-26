#pragma once
#include "bh_physics.hpp"
#include "uastc.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <random>
#include <thread>
#include <vector>

namespace bh_bake_tex {

inline uint32_t hash_u32(uint32_t x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

inline double grad3(int ix, int iy, int iz, double fx, double fy, double fz) {
  uint32_t h = hash_u32(static_cast<uint32_t>(ix * 374761393 + iy * 668265263 + iz * 2147483647)) & 15u;
  double u = h < 8 ? fx : fy;
  double v = h < 4 ? fy : (h == 12 || h == 14 ? fx : fz);
  return ((h & 1u) ? -u : u) + ((h & 2u) ? -v : v);
}

inline double noise3(double x, double y, double z) {
  int ix = static_cast<int>(std::floor(x));
  int iy = static_cast<int>(std::floor(y));
  int iz = static_cast<int>(std::floor(z));
  double fx = x - ix;
  double fy = y - iy;
  double fz = z - iz;
  auto fade = [](double t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); };
  double u = fade(fx), v = fade(fy), w = fade(fz);
  auto lerp = [](double a, double b, double t) { return a + (b - a) * t; };

  double n000 = grad3(ix, iy, iz, fx, fy, fz);
  double n100 = grad3(ix + 1, iy, iz, fx - 1, fy, fz);
  double n010 = grad3(ix, iy + 1, iz, fx, fy - 1, fz);
  double n110 = grad3(ix + 1, iy + 1, iz, fx - 1, fy - 1, fz);
  double n001 = grad3(ix, iy, iz + 1, fx, fy, fz - 1);
  double n101 = grad3(ix + 1, iy, iz + 1, fx - 1, fy, fz - 1);
  double n011 = grad3(ix, iy + 1, iz + 1, fx, fy - 1, fz - 1);
  double n111 = grad3(ix + 1, iy + 1, iz + 1, fx - 1, fy - 1, fz - 1);

  return lerp(
      lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
      lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
      w);
}

inline double fbm3(double x, double y, double z, int octaves = 5) {
  double sum = 0.0;
  double amp = 0.5;
  double freq = 1.0;
  for (int i = 0; i < octaves; ++i) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// Writes UASTC mip container: [uint32 width, uint32 height, uint32 faces, uint32 mipCount, ... (w, h, byteLen, blocks)]
inline void write_uastc_bundle(
    const std::string& path,
    int width,
    int height,
    int faces,
    const std::vector<std::vector<std::vector<uint8_t>>>& face_mips) {
  std::ofstream out(path, std::ios::binary);
  uint32_t mip_count = static_cast<uint32_t>(face_mips[0].size());
  uint32_t hdr[4] = {
      static_cast<uint32_t>(width),
      static_cast<uint32_t>(height),
      static_cast<uint32_t>(faces),
      mip_count};
  out.write(reinterpret_cast<const char*>(hdr), sizeof(hdr));
  for (uint32_t m = 0; m < mip_count; ++m) {
    uint32_t mw = std::max(1u, static_cast<uint32_t>(width) >> m);
    uint32_t mh = std::max(1u, static_cast<uint32_t>(height) >> m);
    uint32_t blen = static_cast<uint32_t>(face_mips[0][m].size());
    uint32_t mhdr[3] = {mw, mh, blen};
    out.write(reinterpret_cast<const char*>(mhdr), sizeof(mhdr));
    for (int f = 0; f < faces; ++f) {
      out.write(reinterpret_cast<const char*>(face_mips[f][m].data()), blen);
    }
  }
}

inline void downsample_rgba8_2x(
    int w,
    int h,
    const std::vector<uint8_t>& src,
    std::vector<uint8_t>& dst) {
  int nw = std::max(1, w >> 1);
  int nh = std::max(1, h >> 1);
  dst.resize(static_cast<size_t>(nw) * nh * 4);
  for (int y = 0; y < nh; ++y) {
    int y0 = std::min(h - 1, y * 2);
    int y1 = std::min(h - 1, y * 2 + 1);
    for (int x = 0; x < nw; ++x) {
      int x0 = std::min(w - 1, x * 2);
      int x1 = std::min(w - 1, x * 2 + 1);
      for (int c = 0; c < 4; ++c) {
        int s = src[(y0 * w + x0) * 4 + c] + src[(y0 * w + x1) * 4 + c] +
                src[(y1 * w + x0) * 4 + c] + src[(y1 * w + x1) * 4 + c];
        dst[(y * nw + x) * 4 + c] = static_cast<uint8_t>((s + 2) >> 2);
      }
    }
  }
}

inline void downsample_hdr_2x(
    int w,
    int h,
    const std::vector<float>& src,
    std::vector<float>& dst) {
  int nw = std::max(1, w >> 1);
  int nh = std::max(1, h >> 1);
  dst.resize(static_cast<size_t>(nw) * nh * 3);
  for (int y = 0; y < nh; ++y) {
    int y0 = std::min(h - 1, y * 2);
    int y1 = std::min(h - 1, y * 2 + 1);
    for (int x = 0; x < nw; ++x) {
      int x0 = std::min(w - 1, x * 2);
      int x1 = std::min(w - 1, x * 2 + 1);
      for (int c = 0; c < 3; ++c) {
        dst[(y * nw + x) * 3 + c] = 0.25f * (
            src[(y0 * w + x0) * 3 + c] + src[(y0 * w + x1) * 3 + c] +
            src[(y1 * w + x0) * 3 + c] + src[(y1 * w + x1) * 3 + c]);
      }
    }
  }
}

inline void encode_hdr_sky_to_rgba8(
    int w,
    int h,
    const std::vector<float>& hdr,
    std::vector<uint8_t>& rgba) {
  rgba.resize(static_cast<size_t>(w) * h * 4);
  constexpr float inv_scale = 1.0f / static_cast<float>(bh_cfg::SKY_HDR_SCALE);
  constexpr float inv_gamma = 1.0f / 2.2f;
  for (size_t i = 0; i < static_cast<size_t>(w) * h; ++i) {
    for (int c = 0; c < 3; ++c) {
      float v = std::max(0.0f, hdr[i * 3 + c] * inv_scale);
      float enc = std::clamp(std::pow(v, inv_gamma), 0.0f, 1.0f);
      // Clean dark-sky floor below 1/255 so UASTC + Zstd compresses empty sky compactly
      uint8_t q = static_cast<uint8_t>(std::lround(enc * 255.0f));
      rgba[i * 4 + c] = q;
    }
    rgba[i * 4 + 3] = 255;
  }
}

inline void bake_disk_turbulence(const std::string& raw_out_path) {
  const int W = bh_cfg::TURB_WIDTH;   // 2048 (phi, periodic)
  const int H = bh_cfg::TURB_HEIGHT;  // 512 (log r)
  std::vector<uint8_t> base(static_cast<size_t>(W) * H * 4);

  unsigned int n_threads = std::max(2u, std::thread::hardware_concurrency());
  std::vector<std::thread> pool;
  for (unsigned int tid = 0; tid < n_threads; ++tid) {
    pool.emplace_back([&, tid]() {
      int y0 = static_cast<int>((static_cast<size_t>(H) * tid) / n_threads);
      int y1 = static_cast<int>((static_cast<size_t>(H) * (tid + 1)) / n_threads);
      double log_r0 = std::log(bh_cfg::DISK_R_IN);
      double log_r1 = std::log(bh_cfg::DISK_R_TAPER);

      for (int y = y0; y < y1; ++y) {
        double v = (y + 0.5) / static_cast<double>(H);
        double log_r = log_r0 + v * (log_r1 - log_r0);
        double r = std::exp(log_r);
        // Spiral shear twist proportional to Keplerian differential rotation
        double shear_angle = 8.5 * std::pow(bh_cfg::DISK_R_IN / r, 0.85) + 4.2 * v;
        double ring_harmonic = 0.5 + 0.5 * std::sin(v * 34.0 * bh_phys::PI);

        for (int x = 0; x < W; ++x) {
          double phi = (x + 0.5) / static_cast<double>(W) * 2.0 * bh_phys::PI;
          double ang = phi + shear_angle;

          // Periodic 3D cylindrical coordinates in phi for seamless wrap
          double rad_ring = 2.4 + 3.8 * v;
          double px = std::cos(ang) * rad_ring;
          double py = std::sin(ang) * rad_ring;
          double pz = v * 9.5;

          // Curl-like domain warp
          double wx = fbm3(px * 1.1 + 3.1, py * 1.1 - 1.7, pz * 1.1, 3);
          double wy = fbm3(px * 1.1 - 5.3, py * 1.1 + 2.9, pz * 1.1 + 4.2, 3);
          double coarse = fbm3(px * 1.6 + wx * 1.8, py * 1.6 + wy * 1.8, pz * 1.5, 5);

          double fine_ang = phi * 2.0 + shear_angle * 1.65;
          double fine = fbm3(
              std::cos(fine_ang) * (3.8 + 4.5 * v),
              std::sin(fine_ang) * (3.8 + 4.5 * v),
              v * 18.0 + coarse * 2.1,
              4);

          double filament = std::clamp(0.54 + 0.72 * coarse + 0.34 * fine, 0.0, 1.0);
          double wisp = std::clamp(0.50 + 0.88 * fine + 0.20 * (ring_harmonic - 0.5), 0.0, 1.0);
          double dust_raw = fbm3(px * 0.9 - wy * 1.2, py * 0.9 + wx * 1.2, pz * 1.2 + 11.7, 4);
          double dust = std::clamp((dust_raw + 0.05) * 1.5 + 0.32, 0.0, 1.0);

          size_t idx = (static_cast<size_t>(y) * W + x) * 4;
          base[idx + 0] = static_cast<uint8_t>(std::lround(filament * 255.0));
          base[idx + 1] = static_cast<uint8_t>(std::lround(wisp * 255.0));
          base[idx + 2] = static_cast<uint8_t>(std::lround(dust * 255.0));
          base[idx + 3] = 255;
        }
      }
    });
  }
  for (auto& t : pool) t.join();

  // Build mip chain down to 4x1 (10 mips) and UASTC-encode each mip
  std::vector<std::vector<std::vector<uint8_t>>> face_mips(1);
  int mw = W, mh = H;
  std::vector<uint8_t> cur = std::move(base);
  while (mw >= 4 && mh >= 4) {
    std::vector<uint8_t> blocks;
    bh_uastc::encode_image_rgba8(mw, mh, cur.data(), blocks);
    face_mips[0].push_back(std::move(blocks));
    if (mw == 4 || mh == 4) break;
    std::vector<uint8_t> next;
    downsample_rgba8_2x(mw, mh, cur, next);
    cur = std::move(next);
    mw >>= 1;
    mh >>= 1;
  }
  write_uastc_bundle(raw_out_path, W, H, 1, face_mips);
}

// Cubemap face direction matching OpenGL / Three.js CubeTexture convention (+X,-X,+Y,-Y,+Z,-Z)
inline void cubemap_dir(int face, double u, double v, double& dx, double& dy, double& dz) {
  // u, v in [-1, 1]
  switch (face) {
    case 0: dx = 1.0;  dy = -v; dz = -u; break; // +X
    case 1: dx = -1.0; dy = -v; dz = u;  break; // -X
    case 2: dx = u;    dy = 1.0; dz = v; break; // +Y
    case 3: dx = u;    dy = -1.0; dz = -v; break; // -Y
    case 4: dx = u;    dy = -v; dz = 1.0; break; // +Z
    default: dx = -u;  dy = -v; dz = -1.0; break; // -Z
  }
  double inv = 1.0 / std::sqrt(dx * dx + dy * dy + dz * dz);
  dx *= inv;
  dy *= inv;
  dz *= inv;
}

inline void dir_to_cubemap_uv(double dx, double dy, double dz, int& face, double& u, double& v) {
  double ax = std::abs(dx), ay = std::abs(dy), az = std::abs(dz);
  if (ax >= ay && ax >= az) {
    if (dx > 0) { face = 0; u = -dz / ax; v = -dy / ax; }
    else        { face = 1; u =  dz / ax; v = -dy / ax; }
  } else if (ay >= ax && ay >= az) {
    if (dy > 0) { face = 2; u = dx / ay; v =  dz / ay; }
    else        { face = 3; u = dx / ay; v = -dz / ay; }
  } else {
    if (dz > 0) { face = 4; u =  dx / az; v = -dy / az; }
    else        { face = 5; u = -dx / az; v = -dy / az; }
  }
}

struct BrightStar {
  float dx, dy, dz, flux, temp_norm;
};

inline void bake_galaxy_sky_cubemaps(
    const std::string& raw_high_path,
    const std::string& raw_mid_path,
    const std::string& raw_low_path,
    const std::string& bright_stars_path) {
  const int S = bh_cfg::CUBE_HIGH; // 2048
  std::vector<std::vector<float>> faces_hdr(6, std::vector<float>(static_cast<size_t>(S) * S * 3, 0.0f));

  // Tilt galactic plane ~58 deg diagonally across the sky so the Milky Way band frames the black hole
  const double tilt_x = 0.92;
  const double tilt_z = -0.44;
  const double cx = std::cos(tilt_x), sx = std::sin(tilt_x);
  const double cz = std::cos(tilt_z), sz = std::sin(tilt_z);
  auto to_gal_frame = [&](double dx, double dy, double dz, double& gx, double& gy, double& gz) {
    // Rotate around Z then X
    double x1 = dx * cz + dy * sz;
    double y1 = -dx * sz + dy * cz;
    double z1 = dz;
    gx = x1;
    gy = y1 * cx + z1 * sx;
    gz = -y1 * sx + z1 * cx;
  };

  unsigned int n_threads = std::max(2u, std::thread::hardware_concurrency());
  // 1. Ray-march continuous galactic disk + bulge + spiral arms + absorbing dust lanes
  for (int face = 0; face < 6; ++face) {
    std::vector<std::thread> pool;
    for (unsigned int tid = 0; tid < n_threads; ++tid) {
      pool.emplace_back([&, face, tid]() {
        int y0 = static_cast<int>((static_cast<size_t>(S) * tid) / n_threads);
        int y1 = static_cast<int>((static_cast<size_t>(S) * (tid + 1)) / n_threads);
        for (int py = y0; py < y1; ++py) {
          double v = ((py + 0.5) / S) * 2.0 - 1.0;
          for (int px_i = 0; px_i < S; ++px_i) {
            double u = ((px_i + 0.5) / S) * 2.0 - 1.0;
            double dx, dy, dz;
            cubemap_dir(face, u, v, dx, dy, dz);
            double gx, gy, gz;
            to_gal_frame(dx, dy, dz, gx, gy, gz);

            // Observer sits at galactocentric R_sun = 2.4 Rd in galactic plane (gx = -2.4, gz = 0)
            double accum_r = 0.0, accum_g = 0.0, accum_b = 0.0;
            double tau_dust = 0.0;
            const double Rd = 1.0;
            const double hz = 0.068;
            const int STEPS = 18;
            const double ds = 0.34;
            for (int st = 0; st < STEPS; ++st) {
              double t = (st + 0.5) * ds;
              double wx = -2.35 + gx * t;
              double wy = gy * t;
              double wz = gz * t;
              double R = std::sqrt(wx * wx + wz * wz);
              double r_sph = std::sqrt(R * R + wy * wy * 2.2);

              double exp_disk = std::exp(-R / Rd) * std::exp(-std::abs(wy) / hz);
              double bulge = 1.65 * std::pow(1.0 + (r_sph * r_sph) / (0.34 * 0.34), -2.2);

              double phi_g = std::atan2(wz, wx);
              double spiral_arg = 2.0 * (phi_g - 2.4 * std::log(std::max(0.25, R) / 0.45));
              double arm = 0.45 + 0.55 * std::pow(0.5 + 0.5 * std::cos(spiral_arg), 2.2);
              double sec_arm = 0.28 * std::pow(0.5 + 0.5 * std::cos(spiral_arg + bh_phys::PI), 2.5);

              double clump = 0.65 + 0.45 * fbm3(wx * 2.3, wy * 5.2, wz * 2.3, 3);
              double dust_n = std::max(0.0, 0.35 + fbm3(wx * 3.1 + 7.1, wy * 8.0, wz * 3.1 - 3.4, 3));
              double dust_rho = exp_disk * (0.35 + 0.85 * arm) * dust_n * std::exp(-std::abs(wy) / 0.026);
              tau_dust += dust_rho * ds * 0.85;
              double ext = std::exp(-tau_dust);

              double star_light = (exp_disk * (0.32 + 0.95 * (arm + sec_arm)) * clump + bulge) * ext;
              // Warm golden-ivory bulge + cool blue-white spiral arms + scarce --accent-abyss nebula knots
              double bulge_mix = bulge / std::max(1e-5, bulge + exp_disk);
              double nebula = std::max(0.0, fbm3(wx * 4.5 + 19.0, wy * 10.0, wz * 4.5, 3) - 0.16) * arm * exp_disk * ext;

              double cr = star_light * (0.58 + 0.42 * bulge_mix) + nebula * 0.36;
              double cg = star_light * (0.64 + 0.18 * bulge_mix) + nebula * 0.06;
              double cb = star_light * (0.94 - 0.34 * bulge_mix) + nebula * 0.42;

              accum_r += cr * ds * 0.095;
              accum_g += cg * ds * 0.095;
              accum_b += cb * ds * 0.095;
            }

            // Subtle --bg #0B0910 deep sky floor + clamped galactic band
            size_t idx = (static_cast<size_t>(py) * S + px_i) * 3;
            faces_hdr[face][idx + 0] = static_cast<float>(0.0022 + accum_r);
            faces_hdr[face][idx + 1] = static_cast<float>(0.0018 + accum_g);
            faces_hdr[face][idx + 2] = static_cast<float>(0.0038 + accum_b);
          }
        }
      });
    }
    for (auto& t : pool) t.join();
  }

  // 2. Flux-conserving Gaussian PSF stars (power-law magnitude distribution + blackbody colors)
  std::mt19937_64 rng(20261126ULL);
  std::uniform_real_distribution<double> u01(0.0, 1.0);
  const int TOTAL_STARS = 140000;
  std::vector<BrightStar> top_stars;
  top_stars.reserve(TOTAL_STARS);

  const double d_pix = 2.0 / static_cast<double>(S);
  for (int i = 0; i < TOTAL_STARS; ++i) {
    // Concentrate 55% of stars toward galactic plane, 45% isotropic
    double gx, gy, gz;
    double phi = u01(rng) * 2.0 * bh_phys::PI;
    if (i % 10 < 6) {
      double lat = (u01(rng) - 0.5) * 0.32 + (u01(rng) - 0.5) * 0.14;
      double cl = std::cos(lat);
      gx = cl * std::cos(phi);
      gy = std::sin(lat);
      gz = cl * std::sin(phi);
    } else {
      double z = u01(rng) * 2.0 - 1.0;
      double r_xy = std::sqrt(std::max(0.0, 1.0 - z * z));
      gx = r_xy * std::cos(phi);
      gy = z;
      gz = r_xy * std::sin(phi);
    }

    // Transform back from galactic frame to world frame (transpose rotation)
    double y1 = gy * cx - gz * sx;
    double z1 = gy * sx + gz * cx;
    double x1 = gx;
    double dx = x1 * cz - y1 * sz;
    double dy = x1 * sz + y1 * cz;
    double dz = z1;

    // Power-law flux (many faint, few bright)
    double u_mag = std::max(1e-5, u01(rng));
    double flux = 0.004 * std::pow(u_mag, -0.78);
    flux = std::min(flux, 4.5);

    double temp_k = 2800.0 + std::pow(u01(rng), 1.65) * 26000.0;
    float col[3];
    bh_phys::planck_rgb_linear(temp_k, col);
    double col_scale = 1.0 / std::max(0.1, 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]);

    BrightStar bs{
        static_cast<float>(dx),
        static_cast<float>(dy),
        static_cast<float>(dz),
        static_cast<float>(flux),
        static_cast<float>((temp_k - bh_cfg::TEMP_MIN_K) / (bh_cfg::TEMP_MAX_K - bh_cfg::TEMP_MIN_K))};
    top_stars.push_back(bs);

    // Splat into cubemap face with flux-conserving Gaussian PSF (sigma = 0.72 texel)
    int face;
    double cu, cv;
    dir_to_cubemap_uv(dx, dy, dz, face, cu, cv);
    double px_f = (cu * 0.5 + 0.5) * S - 0.5;
    double py_f = (cv * 0.5 + 0.5) * S - 0.5;
    int ix = static_cast<int>(std::floor(px_f));
    int iy = static_cast<int>(std::floor(py_f));
    const double sigma = 0.72;
    const double inv_2s2 = 1.0 / (2.0 * sigma * sigma);
    double weights[9];
    double wsum = 0.0;
    int k = 0;
    for (int oy = 0; oy <= 2; ++oy) {
      for (int ox = 0; ox <= 2; ++ox) {
        int tx = ix + ox - 1;
        int ty = iy + oy - 1;
        double ddx = (tx - px_f);
        double ddy = (ty - py_f);
        double w = std::exp(-(ddx * ddx + ddy * ddy) * inv_2s2);
        weights[k++] = w;
        wsum += w;
      }
    }
    double norm_flux = flux / std::max(1e-8, wsum);
    k = 0;
    for (int oy = 0; oy <= 2; ++oy) {
      for (int ox = 0; ox <= 2; ++ox) {
        int tx = std::clamp(ix + ox - 1, 0, S - 1);
        int ty = std::clamp(iy + oy - 1, 0, S - 1);
        float add = static_cast<float>(norm_flux * weights[k++] * col_scale);
        size_t idx = (static_cast<size_t>(ty) * S + tx) * 3;
        faces_hdr[face][idx + 0] += col[0] * add;
        faces_hdr[face][idx + 1] += col[1] * add;
        faces_hdr[face][idx + 2] += col[2] * add;
      }
    }
    (void)d_pix;
  }

  // Export top BRIGHT_STAR_COUNT brightest stars
  std::partial_sort(
      top_stars.begin(),
      top_stars.begin() + bh_cfg::BRIGHT_STAR_COUNT,
      top_stars.end(),
      [](const BrightStar& a, const BrightStar& b) { return a.flux > b.flux; });
  {
    std::ofstream bs_out(bright_stars_path, std::ios::binary);
    uint32_t hdr[4] = {0x314C4842u, static_cast<uint32_t>(bh_cfg::BRIGHT_STAR_COUNT), 5, 0}; // BHL1
    bs_out.write(reinterpret_cast<const char*>(hdr), sizeof(hdr));
    bs_out.write(reinterpret_cast<const char*>(top_stars.data()), bh_cfg::BRIGHT_STAR_COUNT * sizeof(BrightStar));
  }

  // 3. Generate flux-conserving HDR mip chain (2048 -> 1024 -> 512 -> ... -> 1) and encode all 3 sky tiers
  std::vector<std::vector<std::vector<uint8_t>>> mips_high(6);
  std::vector<std::vector<std::vector<uint8_t>>> mips_mid(6);
  std::vector<std::vector<std::vector<uint8_t>>> mips_low(6);

  std::vector<std::thread> enc_pool;
  for (int face = 0; face < 6; ++face) {
    enc_pool.emplace_back([&, face]() {
      int mw = S;
      std::vector<float> cur_hdr = std::move(faces_hdr[face]);
      while (mw >= 1) {
        std::vector<uint8_t> rgba;
        encode_hdr_sky_to_rgba8(mw, mw, cur_hdr, rgba);
        std::vector<uint8_t> blocks;
        bh_uastc::encode_image_rgba8(mw, mw, rgba.data(), blocks);

        mips_high[face].push_back(blocks);
        if (mw <= bh_cfg::CUBE_MID) mips_mid[face].push_back(blocks);
        if (mw <= bh_cfg::CUBE_LOW) mips_low[face].push_back(std::move(blocks));

        if (mw == 1) break;
        std::vector<float> next_hdr;
        downsample_hdr_2x(mw, mw, cur_hdr, next_hdr);
        cur_hdr = std::move(next_hdr);
        mw >>= 1;
      }
    });
  }
  for (auto& t : enc_pool) t.join();

  write_uastc_bundle(raw_high_path, bh_cfg::CUBE_HIGH, bh_cfg::CUBE_HIGH, 6, mips_high);
  write_uastc_bundle(raw_mid_path, bh_cfg::CUBE_MID, bh_cfg::CUBE_MID, 6, mips_mid);
  write_uastc_bundle(raw_low_path, bh_cfg::CUBE_LOW, bh_cfg::CUBE_LOW, 6, mips_low);
}

// 64x64 toroidal Void-and-Cluster blue-noise tile (2 independent decorrelated channels)
inline void bake_blue_noise_64(const std::string& out_path) {
  const int N = bh_cfg::BLUE_NOISE_SIZE; // 64
  const int TOTAL = N * N;

  auto build_channel = [&](uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<uint8_t> mask(TOTAL, 0);
    std::vector<double> energy(TOTAL, 0.0);
    std::vector<int> rank(TOTAL, 0);

    // Precompute toroidal Gaussian kernel sigma = 1.5
    const int K = 6;
    double kern[13][13];
    for (int dy = -K; dy <= K; ++dy) {
      for (int dx = -K; dx <= K; ++dx) {
        kern[dy + K][dx + K] = std::exp(-(dx * dx + dy * dy) / (2.0 * 1.5 * 1.5));
      }
    }
    auto splat = [&](int px, int py, double sign) {
      for (int dy = -K; dy <= K; ++dy) {
        int y = (py + dy + N) & (N - 1);
        for (int dx = -K; dx <= K; ++dx) {
          int x = (px + dx + N) & (N - 1);
          energy[y * N + x] += sign * kern[dy + K][dx + K];
        }
      }
    };

    const int SEED_COUNT = TOTAL / 10;
    for (int i = 0; i < SEED_COUNT; ++i) {
      int p;
      do { p = static_cast<int>(rng() % TOTAL); } while (mask[p]);
      mask[p] = 1;
      splat(p % N, p / N, 1.0);
    }

    // Relax initial binary pattern by swapping tightest cluster with largest void
    for (int relax = 0; relax < 400; ++relax) {
      int max_one = -1;
      double max_e = -1e9;
      for (int i = 0; i < TOTAL; ++i) {
        if (mask[i] && energy[i] > max_e) { max_e = energy[i]; max_one = i; }
      }
      mask[max_one] = 0;
      splat(max_one % N, max_one / N, -1.0);
      int min_zero = -1;
      double min_e = 1e9;
      for (int i = 0; i < TOTAL; ++i) {
        if (!mask[i] && energy[i] < min_e) { min_e = energy[i]; min_zero = i; }
      }
      if (min_zero == max_one) {
        mask[max_one] = 1;
        splat(max_one % N, max_one / N, 1.0);
        break;
      }
      mask[min_zero] = 1;
      splat(min_zero % N, min_zero / N, 1.0);
    }

    // Phase 1: remove ones from tightest clusters down to 0
    std::vector<uint8_t> work_mask = mask;
    std::vector<double> work_e = energy;
    auto work_splat = [&](int px, int py, double sign) {
      for (int dy = -K; dy <= K; ++dy) {
        int y = (py + dy + N) & (N - 1);
        for (int dx = -K; dx <= K; ++dx) {
          int x = (px + dx + N) & (N - 1);
          work_e[y * N + x] += sign * kern[dy + K][dx + K];
        }
      }
    };
    for (int r = SEED_COUNT - 1; r >= 0; --r) {
      int best = -1;
      double best_e = -1e9;
      for (int i = 0; i < TOTAL; ++i) {
        if (work_mask[i] && work_e[i] > best_e) { best_e = work_e[i]; best = i; }
      }
      work_mask[best] = 0;
      work_splat(best % N, best / N, -1.0);
      rank[best] = r;
    }

    // Phase 2: add ones into largest voids from SEED_COUNT to TOTAL-1
    for (int r = SEED_COUNT; r < TOTAL; ++r) {
      int best = -1;
      double best_e = 1e9;
      for (int i = 0; i < TOTAL; ++i) {
        if (!mask[i] && energy[i] < best_e) { best_e = energy[i]; best = i; }
      }
      mask[best] = 1;
      splat(best % N, best / N, 1.0);
      rank[best] = r;
    }
    return rank;
  };

  auto r0 = build_channel(104729ULL);
  auto r1 = build_channel(791923ULL);
  std::vector<uint8_t> rg(TOTAL * 2);
  for (int i = 0; i < TOTAL; ++i) {
    rg[i * 2 + 0] = static_cast<uint8_t>(std::lround((r0[i] / static_cast<double>(TOTAL - 1)) * 255.0));
    rg[i * 2 + 1] = static_cast<uint8_t>(std::lround((r1[i] / static_cast<double>(TOTAL - 1)) * 255.0));
  }

  std::ofstream out(out_path, std::ios::binary);
  uint32_t hdr[4] = {0x314C4842u, static_cast<uint32_t>(N), static_cast<uint32_t>(N), 2};
  out.write(reinterpret_cast<const char*>(hdr), sizeof(hdr));
  out.write(reinterpret_cast<const char*>(rg.data()), rg.size());
}

// Initial conditions for 32,768 base particles (tiled/perturbed to 262,144 on GPU):
// radial log-uniform, vertical flared Gaussian h/r in [0.022, 0.056], Keplerian velocity + small ecc scatter.
inline void bake_particles_init(const std::string& out_path) {
  const int COUNT = 32768;
  std::mt19937_64 rng(9917342ULL);
  std::uniform_real_distribution<double> u01(0.0, 1.0);
  std::normal_distribution<double> norm01(0.0, 1.0);

  // float32[4] per particle = 524,288 bytes (512 KiB): (r0, phi0, z0, ecc_rand)
  std::vector<float> buf(COUNT * 4);
  double log_in = std::log(bh_cfg::DISK_R_IN);
  double log_out = std::log(bh_cfg::DISK_R_OUT);

  for (int i = 0; i < COUNT; ++i) {
    // Log-uniform radial power-law density (1/r)
    double r = std::exp(log_in + u01(rng) * (log_out - log_in));
    double phi = u01(rng) * 2.0 * bh_phys::PI;
    double rt = std::clamp((r - bh_cfg::DISK_R_IN) / (bh_cfg::DISK_R_OUT - bh_cfg::DISK_R_IN), 0.0, 1.0);
    double h_over_r = bh_cfg::DISK_H_OVER_R_MIN +
                      (bh_cfg::DISK_H_OVER_R_MAX - bh_cfg::DISK_H_OVER_R_MIN) * std::sqrt(rt);
    double z = norm01(rng) * (r * h_over_r);
    double ecc_scatter = std::clamp(std::abs(norm01(rng)) * 0.035, 0.0, 0.14);
    double packed_seed = std::floor(ecc_scatter * 1000.0) + u01(rng) * 0.99;

    buf[i * 4 + 0] = static_cast<float>(r);
    buf[i * 4 + 1] = static_cast<float>(phi);
    buf[i * 4 + 2] = static_cast<float>(z);
    buf[i * 4 + 3] = static_cast<float>(packed_seed);
  }

  std::ofstream out(out_path, std::ios::binary);
  uint32_t hdr[4] = {0x314C4842u, static_cast<uint32_t>(COUNT), 4, 0};
  out.write(reinterpret_cast<const char*>(hdr), sizeof(hdr));
  out.write(reinterpret_cast<const char*>(buf.data()), buf.size() * sizeof(float));
}

} // namespace bh_bake_tex
