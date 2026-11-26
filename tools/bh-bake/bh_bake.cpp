#include "bh_physics.hpp"
#include "bh_sky_turb.hpp"
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace fs = std::filesystem;

static void write_bhl1_half(
    const std::string& path,
    uint32_t w,
    uint32_t h,
    uint32_t d,
    uint32_t channels,
    const std::vector<uint16_t>& data) {
  std::ofstream out(path, std::ios::binary);
  uint32_t hdr[4] = {0x314C4842u, w, h, (d << 8) | channels};
  out.write(reinterpret_cast<const char*>(hdr), sizeof(hdr));
  out.write(reinterpret_cast<const char*>(data.data()), data.size() * sizeof(uint16_t));
}

static void bake_deflection_lut(const std::string& out_path) {
  const int W = bh_cfg::DEFLECTION_WIDTH;
  std::vector<uint16_t> data(W * 4);
  for (int i = 0; i < W; ++i) {
    double s = (i + 0.5) / static_cast<double>(W);
    double b = bh_phys::lut_u_to_b(s);
    auto res = bh_phys::integrate_schwarzschild(
        b, 1e6, 8.0 * bh_phys::PI,
        [](double, double, const bh_phys::GeodesicState&, const bh_phys::GeodesicState&) {});

    double phi_inf = res.phi_end;
    double alpha = res.escaped ? std::max(0.0, phi_inf - bh_phys::PI) : 0.0;
    double cap_flag = res.escaped ? 1.0 : 0.0;
    // Photon ring glow envelope concentrated smoothly near b_c
    double db = std::abs(b - bh_cfg::SHADOW_RADIUS_BC);
    double ring_w = std::exp(-db * 26.0);

    data[i * 4 + 0] = bh_phys::float_to_half(static_cast<float>(phi_inf));
    data[i * 4 + 1] = bh_phys::float_to_half(static_cast<float>(alpha));
    data[i * 4 + 2] = bh_phys::float_to_half(static_cast<float>(cap_flag));
    data[i * 4 + 3] = bh_phys::float_to_half(static_cast<float>(ring_w));
  }
  write_bhl1_half(out_path, W, 1, 1, 4, data);
}

static void bake_transfer_lut(const std::string& out_path) {
  const int NB = bh_cfg::TRANSFER_B;
  const int NPHI = bh_cfg::TRANSFER_PHI;
  const int NS = bh_cfg::TRANSFER_SLICES;
  std::vector<uint16_t> data(static_cast<size_t>(NB) * NPHI * NS * 2);

  unsigned int n_threads = std::max(2u, std::thread::hardware_concurrency());
  for (int slice = 0; slice < NS; ++slice) {
    double r_obs = bh_cfg::OBSERVER_RADII[slice];
    std::vector<std::thread> pool;
    for (unsigned int tid = 0; tid < n_threads; ++tid) {
      pool.emplace_back([&, slice, r_obs, tid]() {
        int b0 = static_cast<int>((static_cast<size_t>(NB) * tid) / n_threads);
        int b1 = static_cast<int>((static_cast<size_t>(NB) * (tid + 1)) / n_threads);

        for (int ib = b0; ib < b1; ++ib) {
          double sb = (ib + 0.5) / static_cast<double>(NB);
          double b = bh_phys::lut_u_to_b(sb);

          std::vector<double> u_grid(NPHI, 0.0);
          std::vector<double> du_grid(NPHI, 0.0);
          int next_phi_idx = 0;

          double max_sample_phi = bh_cfg::PHI_MAX;
          auto res = bh_phys::integrate_schwarzschild(
              b, r_obs, max_sample_phi,
              [&](double phi_s, double h, const bh_phys::GeodesicState& y0, const bh_phys::GeodesicState& y1) {
                while (next_phi_idx < NPHI) {
                  double phi_q = ((next_phi_idx + 0.5) / static_cast<double>(NPHI)) * max_sample_phi;
                  if (phi_q > phi_s + h) break;
                  if (phi_q >= phi_s - 1e-12) {
                    double uq, duq;
                    bh_phys::eval_hermite(phi_s, h, y0, y1, phi_q, uq, duq);
                    u_grid[next_phi_idx] = std::max(0.0, uq);
                    du_grid[next_phi_idx] = std::abs(duq);
                  }
                  ++next_phi_idx;
                }
              });

          // Fill post-capture or post-escape tail
          for (int ip = next_phi_idx; ip < NPHI; ++ip) {
            if (!res.escaped) {
              u_grid[ip] = 1.05; // sentinel: captured inside horizon
              du_grid[ip] = 0.0;
            } else {
              u_grid[ip] = 0.0;
              du_grid[ip] = 0.0;
            }
          }

          size_t row_off = (static_cast<size_t>(slice) * NPHI * NB + 0) * 2;
          for (int ip = 0; ip < NPHI; ++ip) {
            size_t idx = (static_cast<size_t>(slice) * NPHI * NB + static_cast<size_t>(ip) * NB + ib) * 2;
            data[idx + 0] = bh_phys::float_to_half(static_cast<float>(u_grid[ip]));
            data[idx + 1] = bh_phys::float_to_half(static_cast<float>(du_grid[ip]));
          }
          (void)row_off;
        }
      });
    }
    for (auto& t : pool) t.join();
  }

  write_bhl1_half(out_path, NB, NPHI, NS, 2, data);
}

static void bake_kerr_lut(const std::string& out_path) {
  const int NB = bh_cfg::KERR_B;
  const int NPHI = bh_cfg::KERR_PHI;
  const int NS = bh_cfg::KERR_SLICES; // slice 0 = prograde (b>0), slice 1 = retrograde (b<0)
  std::vector<uint16_t> data(static_cast<size_t>(NB) * NPHI * NS * 4);

  for (int slice = 0; slice < NS; ++slice) {
    double sign_b = slice == 0 ? 1.0 : -1.0;
    for (int ib = 0; ib < NB; ++ib) {
      double b_mag = 0.3 + (ib / static_cast<double>(NB - 1)) * 16.0;
      std::vector<std::pair<double, double>> trace;
      auto res = bh_phys::integrate_kerr_equatorial(sign_b * b_mag, 36.0, bh_cfg::PHI_MAX, &trace);

      for (int ip = 0; ip < NPHI; ++ip) {
        double phi_q = (ip / static_cast<double>(NPHI - 1)) * bh_cfg::PHI_MAX;
        double u_val = res.escaped ? 0.0 : 1.05;
        if (!trace.empty() && phi_q <= trace.back().first) {
          auto it = std::lower_bound(
              trace.begin(), trace.end(), phi_q,
              [](const std::pair<double, double>& p, double val) { return p.first < val; });
          if (it != trace.end()) u_val = it->second;
        }
        size_t idx = (static_cast<size_t>(slice) * NPHI * NB + static_cast<size_t>(ip) * NB + ib) * 4;
        data[idx + 0] = bh_phys::float_to_half(static_cast<float>(u_val));
        data[idx + 1] = bh_phys::float_to_half(static_cast<float>(res.escaped ? 1.0 : 0.0));
        data[idx + 2] = bh_phys::float_to_half(static_cast<float>(res.deflection));
        data[idx + 3] = bh_phys::float_to_half(1.0f);
      }
    }
  }
  write_bhl1_half(out_path, NB, NPHI, NS, 4, data);
}

static void bake_blackbody_lut(const std::string& out_path) {
  const int W = bh_cfg::BLACKBODY_WIDTH;
  std::vector<uint16_t> data(W * 4);
  for (int i = 0; i < W; ++i) {
    double t = i / static_cast<double>(W - 1);
    // Log-spaced temperature from 1000K to 40000K for smooth resolution in 1500K-12000K disk range
    double temp = bh_cfg::TEMP_MIN_K * std::pow(bh_cfg::TEMP_MAX_K / bh_cfg::TEMP_MIN_K, t);
    float rgb[3];
    bh_phys::planck_rgb_linear(temp, rgb);
    data[i * 4 + 0] = bh_phys::float_to_half(rgb[0]);
    data[i * 4 + 1] = bh_phys::float_to_half(rgb[1]);
    data[i * 4 + 2] = bh_phys::float_to_half(rgb[2]);
    data[i * 4 + 3] = bh_phys::float_to_half(static_cast<float>(temp / 10000.0));
  }
  write_bhl1_half(out_path, W, 1, 1, 4, data);
}

// Reads "b r_obs max_phi" lines from stdin and prints reference "escaped phi_end deflection u_max"
static int run_eval_rays() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.empty()) continue;
    std::istringstream iss(line);
    double b, r_obs, max_phi;
    if (!(iss >> b >> r_obs >> max_phi)) continue;
    auto res = bh_phys::integrate_schwarzschild(
        b, r_obs, max_phi,
        [](double, double, const bh_phys::GeodesicState&, const bh_phys::GeodesicState&) {});
    // Also evaluate u at 3 disk crossing candidate angles if passed
    double p0 = -1, p1 = -1, p2 = -1;
    double u0 = 0, u1 = 0, u2 = 0;
    if (iss >> p0 >> p1 >> p2) {
      auto sample_at = [&](double target_phi) -> double {
        if (target_phi <= 0.0 || target_phi > res.phi_end) return res.escaped ? 0.0 : 1.05;
        double found_u = 0.0;
        bh_phys::integrate_schwarzschild(
            b, r_obs, target_phi + 0.01,
            [&](double phi_s, double h, const bh_phys::GeodesicState& y0, const bh_phys::GeodesicState& y1) {
              if (target_phi >= phi_s && target_phi <= phi_s + h) {
                double duq;
                bh_phys::eval_hermite(phi_s, h, y0, y1, target_phi, found_u, duq);
              }
            });
        return std::max(0.0, found_u);
      };
      u0 = sample_at(p0);
      u1 = sample_at(p1);
      u2 = sample_at(p2);
    }
    std::printf("%d %.10f %.10f %.10f %.10f %.10f\n",
                res.escaped ? 1 : 0, res.phi_end, res.deflection, u0, u1, u2);
  }
  return 0;
}

int main(int argc, char** argv) {
  if (argc >= 2 && std::string(argv[1]) == "--eval-rays") {
    return run_eval_rays();
  }

  bool luts_only = (argc >= 2 && std::string(argv[1]) == "--luts-only");
  int arg_off = luts_only ? 1 : 0;
  fs::path out_dir = (argc >= 2 + arg_off) ? fs::path(argv[1 + arg_off]) : fs::path("public/bh");
  fs::path scratch_dir = (argc >= 3 + arg_off) ? fs::path(argv[2 + arg_off]) : fs::path("tools/bh-bake");
  fs::create_directories(out_dir);
  fs::create_directories(scratch_dir);

  std::printf("Baking black hole LUTs -> %s\n", out_dir.string().c_str());
  bake_deflection_lut((out_dir / "deflection_lut.bin").string());
  bake_transfer_lut((out_dir / "transfer_lut.bin").string());
  bake_kerr_lut((out_dir / "kerr_lut.bin").string());
  bake_blackbody_lut((out_dir / "blackbody_lut.bin").string());
  bh_bake_tex::bake_blue_noise_64((out_dir / "blue_noise_64.bin").string());
  bh_bake_tex::bake_particles_init((out_dir / "particles_init.bin").string());

  if (!luts_only) {
    bh_bake_tex::bake_disk_turbulence((scratch_dir / "disk_turbulence.raw_uastc").string());
    bh_bake_tex::bake_galaxy_sky_cubemaps(
        (scratch_dir / "sky_high.raw_uastc").string(),
        (scratch_dir / "sky_mid.raw_uastc").string(),
        (scratch_dir / "sky_low.raw_uastc").string(),
        (out_dir / "bright_stars.bin").string());
  }

  std::printf("C++ offline bake complete.\n");
  return 0;
}
