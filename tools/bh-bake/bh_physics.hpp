#pragma once
#include "bh_constants_gen.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace bh_phys {

constexpr double PI = 3.14159265358979323846;

inline uint16_t float_to_half(float f) {
  uint32_t x;
  std::memcpy(&x, &f, 4);
  uint32_t sign = (x >> 16) & 0x8000u;
  int32_t exp = static_cast<int32_t>((x >> 23) & 0xFFu) - 127 + 15;
  uint32_t mant = x & 0x7FFFFFu;
  if (((x >> 23) & 0xFFu) == 0xFFu) {
    return static_cast<uint16_t>(sign | 0x7C00u | (mant ? 1u : 0u));
  }
  if (exp <= 0) {
    if (exp < -10) return static_cast<uint16_t>(sign);
    mant = (mant | 0x800000u) >> (1 - exp);
    return static_cast<uint16_t>(sign | ((mant + 0x1000u) >> 13));
  }
  if (exp >= 31) {
    return static_cast<uint16_t>(sign | 0x7BFFu); // clamp finite max 65504
  }
  uint32_t rounded = mant + 0x1000u;
  if (rounded & 0x800000u) {
    rounded = 0;
    ++exp;
    if (exp >= 31) return static_cast<uint16_t>(sign | 0x7BFFu);
  }
  return static_cast<uint16_t>(sign | (static_cast<uint32_t>(exp) << 10) | (rounded >> 13));
}

inline float half_to_float(uint16_t h) {
  uint32_t sign = (h & 0x8000u) << 16;
  uint32_t exp = (h >> 10) & 0x1Fu;
  uint32_t mant = h & 0x03FFu;
  uint32_t out;
  if (exp == 0) {
    if (mant == 0) {
      out = sign;
    } else {
      exp = 1;
      while ((mant & 0x0400u) == 0) {
        mant <<= 1;
        --exp;
      }
      mant &= 0x03FFu;
      out = sign | ((exp + 127 - 15) << 23) | (mant << 13);
    }
  } else if (exp == 31) {
    out = sign | 0x7F800000u | (mant << 13);
  } else {
    out = sign | ((exp + 127 - 15) << 23) | (mant << 13);
  }
  float f;
  std::memcpy(&f, &out, 4);
  return f;
}

inline double b_to_lut_u(double b) {
  double bc = bh_cfg::SHADOW_RADIUS_BC;
  double cb = std::clamp(b, 0.0, bh_cfg::B_MAX);
  if (cb <= bc) return bh_cfg::B_SPLIT_CAP * (cb / bc);
  double db = cb - bc;
  if (db <= bh_cfg::B_STRONG_SPAN) {
    double t = std::log((db + bh_cfg::B_STRONG_EPS) / bh_cfg::B_STRONG_EPS) /
               std::log((bh_cfg::B_STRONG_SPAN + bh_cfg::B_STRONG_EPS) / bh_cfg::B_STRONG_EPS);
    return bh_cfg::B_SPLIT_CAP + (bh_cfg::B_SPLIT_STRONG - bh_cfg::B_SPLIT_CAP) * t;
  }
  double t = std::sqrt((cb - (bc + bh_cfg::B_STRONG_SPAN)) /
                       (bh_cfg::B_MAX - (bc + bh_cfg::B_STRONG_SPAN)));
  return bh_cfg::B_SPLIT_STRONG + (1.0 - bh_cfg::B_SPLIT_STRONG) * t;
}

inline double lut_u_to_b(double s) {
  double cs = std::clamp(s, 0.0, 1.0);
  double bc = bh_cfg::SHADOW_RADIUS_BC;
  if (cs <= bh_cfg::B_SPLIT_CAP) return bc * (cs / bh_cfg::B_SPLIT_CAP);
  if (cs <= bh_cfg::B_SPLIT_STRONG) {
    double t = (cs - bh_cfg::B_SPLIT_CAP) / (bh_cfg::B_SPLIT_STRONG - bh_cfg::B_SPLIT_CAP);
    return bc + bh_cfg::B_STRONG_EPS *
                    (std::pow((bh_cfg::B_STRONG_SPAN + bh_cfg::B_STRONG_EPS) / bh_cfg::B_STRONG_EPS, t) - 1.0);
  }
  double t = (cs - bh_cfg::B_SPLIT_STRONG) / (1.0 - bh_cfg::B_SPLIT_STRONG);
  return bc + bh_cfg::B_STRONG_SPAN + (bh_cfg::B_MAX - (bc + bh_cfg::B_STRONG_SPAN)) * t * t;
}

struct GeodesicState {
  double u;
  double du;
};

inline GeodesicState rhs_schwarzschild(const GeodesicState& s) {
  // d^2u / dphi^2 + u = 3 M u^2
  return {s.du, 3.0 * bh_cfg::M * s.u * s.u - s.u};
}

struct GeodesicResult {
  bool escaped;
  double phi_end;
  double deflection;
  double u_max;
};

// Hermite cubic evaluation on [phi0, phi0 + h]
inline void eval_hermite(
    double phi0,
    double h,
    const GeodesicState& y0,
    const GeodesicState& y1,
    double phi,
    double& out_u,
    double& out_du) {
  double t = (phi - phi0) / h;
  double t2 = t * t;
  double t3 = t2 * t;
  double h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
  double h10 = t3 - 2.0 * t2 + t;
  double h01 = -2.0 * t3 + 3.0 * t2;
  double h11 = t3 - t2;
  double dh00 = (6.0 * t2 - 6.0 * t) / h;
  double dh10 = 3.0 * t2 - 4.0 * t + 1.0;
  double dh01 = (-6.0 * t2 + 6.0 * t) / h;
  double dh11 = 3.0 * t2 - 2.0 * t;
  out_u = h00 * y0.u + h10 * h * y0.du + h01 * y1.u + h11 * h * y1.du;
  out_du = dh00 * y0.u + dh10 * h * y0.du + dh01 * y1.u + dh11 * h * y1.du;
}

// Dormand-Prince RK45 adaptive geodesic integrator on [0, max_phi].
// Optional dense sampler receives (phi, u, du) on uniform grid or callback.
template <typename SampleFn>
inline GeodesicResult integrate_schwarzschild(
    double b,
    double r_obs,
    double max_phi,
    SampleFn&& on_step) {
  if (b <= 1e-9) {
    return {false, 0.0, 0.0, 1.0 / bh_cfg::RS};
  }
  double u0 = std::isfinite(r_obs) ? (1.0 / r_obs) : 1e-6;
  double radicand = (1.0 / (b * b)) - u0 * u0 * (1.0 - bh_cfg::RS * u0);
  double du0 = std::sqrt(std::max(0.0, radicand));
  double phi0_start = std::isfinite(r_obs) ? 0.0 : std::asin(std::clamp(b * u0, 0.0, 1.0));

  GeodesicState y{u0, du0};
  double phi = phi0_start;
  double h = 0.025;
  double u_max = u0;

  constexpr double a21 = 1.0 / 5.0;
  constexpr double a31 = 3.0 / 40.0, a32 = 9.0 / 40.0;
  constexpr double a41 = 44.0 / 45.0, a42 = -56.0 / 15.0, a43 = 32.0 / 9.0;
  constexpr double a51 = 19372.0 / 6561.0, a52 = -25360.0 / 2187.0, a53 = 64448.0 / 6561.0, a54 = -212.0 / 729.0;
  constexpr double a61 = 9017.0 / 3168.0, a62 = -355.0 / 33.0, a63 = 46732.0 / 5247.0, a64 = 49.0 / 176.0, a65 = -5103.0 / 18656.0;
  constexpr double a71 = 35.0 / 384.0, a73 = 500.0 / 1113.0, a74 = 125.0 / 192.0, a75 = -2187.0 / 6784.0, a76 = 11.0 / 84.0;
  constexpr double e1 = 71.0 / 57600.0, e3 = -71.0 / 16695.0, e4 = 71.0 / 1920.0, e5 = -17253.0 / 339200.0, e6 = 22.0 / 525.0, e7 = -1.0 / 40.0;

  const double rtol = 1e-11;
  const double atol = 1e-13;
  const double u_horizon = 1.0 / bh_cfg::RS;

  for (int iter = 0; iter < 50000; ++iter) {
    if (phi >= max_phi) break;
    if (phi + h > max_phi) h = max_phi - phi;

    auto k1 = rhs_schwarzschild(y);
    GeodesicState y2{y.u + h * a21 * k1.u, y.du + h * a21 * k1.du};
    auto k2 = rhs_schwarzschild(y2);
    GeodesicState y3{y.u + h * (a31 * k1.u + a32 * k2.u), y.du + h * (a31 * k1.du + a32 * k2.du)};
    auto k3 = rhs_schwarzschild(y3);
    GeodesicState y4{
        y.u + h * (a41 * k1.u + a42 * k2.u + a43 * k3.u),
        y.du + h * (a41 * k1.du + a42 * k2.du + a43 * k3.du)};
    auto k4 = rhs_schwarzschild(y4);
    GeodesicState y5{
        y.u + h * (a51 * k1.u + a52 * k2.u + a53 * k3.u + a54 * k4.u),
        y.du + h * (a51 * k1.du + a52 * k2.du + a53 * k3.du + a54 * k4.du)};
    auto k5 = rhs_schwarzschild(y5);
    GeodesicState y6{
        y.u + h * (a61 * k1.u + a62 * k2.u + a63 * k3.u + a64 * k4.u + a65 * k5.u),
        y.du + h * (a61 * k1.du + a62 * k2.du + a63 * k3.du + a64 * k4.du + a65 * k5.du)};
    auto k6 = rhs_schwarzschild(y6);

    GeodesicState yn{
        y.u + h * (a71 * k1.u + a73 * k3.u + a74 * k4.u + a75 * k5.u + a76 * k6.u),
        y.du + h * (a71 * k1.du + a73 * k3.du + a74 * k4.du + a75 * k5.du + a76 * k6.du)};
    auto k7 = rhs_schwarzschild(yn);

    double err_u = h * (e1 * k1.u + e3 * k3.u + e4 * k4.u + e5 * k5.u + e6 * k6.u + e7 * k7.u);
    double err_du = h * (e1 * k1.du + e3 * k3.du + e4 * k4.du + e5 * k5.du + e6 * k6.du + e7 * k7.du);
    double sc_u = atol + rtol * std::max(std::abs(y.u), std::abs(yn.u));
    double sc_du = atol + rtol * std::max(std::abs(y.du), std::abs(yn.du));
    double err = std::sqrt(0.5 * ((err_u / sc_u) * (err_u / sc_u) + (err_du / sc_du) * (err_du / sc_du)));

    if (err <= 1.0) {
      double next_phi = phi + h;
      on_step(phi, h, y, yn);
      u_max = std::max(u_max, yn.u);

      if (yn.u >= u_horizon) {
        // Linear/Hermite refine crossing at u = u_horizon
        double t_lo = 0.0, t_hi = 1.0;
        for (int b_it = 0; b_it < 24; ++b_it) {
          double tm = 0.5 * (t_lo + t_hi);
          double uq, duq;
          eval_hermite(phi, h, y, yn, phi + tm * h, uq, duq);
          if (uq < u_horizon) t_lo = tm;
          else t_hi = tm;
        }
        double phi_hit = phi + 0.5 * (t_lo + t_hi) * h;
        return {false, phi_hit, 0.0, u_horizon};
      }

      if (yn.u <= 0.0 && yn.du < 0.0 && next_phi > phi0_start + 0.1) {
        double t_lo = 0.0, t_hi = 1.0;
        for (int b_it = 0; b_it < 24; ++b_it) {
          double tm = 0.5 * (t_lo + t_hi);
          double uq, duq;
          eval_hermite(phi, h, y, yn, phi + tm * h, uq, duq);
          if (uq > 0.0) t_lo = tm;
          else t_hi = tm;
        }
        double phi_esc = phi + 0.5 * (t_lo + t_hi) * h;
        return {true, phi_esc, phi_esc - PI, u_max};
      }

      y = yn;
      phi = next_phi;
      double fac = (err < 1e-16) ? 3.0 : std::min(3.0, 0.9 * std::pow(err, -0.2));
      h = std::min(0.18, h * std::max(0.2, fac));
    } else {
      double fac = std::max(0.1, 0.9 * std::pow(err, -0.25));
      h = std::max(1e-7, h * fac);
    }
  }

  // If ray did not escape before max_phi (ultra-grazing b ≈ bc), classify by u_max vs photon sphere
  return {b >= bh_cfg::SHADOW_RADIUS_BC, phi, phi - PI, u_max};
}

// Equatorial Kerr null geodesic integrator (a = BH_KERR_SPIN_A, theta = pi/2)
// Returns (r_at_phi, delta_phi_frame_drag) using Mino-time RK4 on Boyer-Lindquist equations.
inline GeodesicResult integrate_kerr_equatorial(
    double impact_b_signed,
    double r_obs,
    double max_phi,
    std::vector<std::pair<double, double>>* trace_r_dphi_fd = nullptr) {
  double a = bh_cfg::KERR_SPIN_A;
  double M = bh_cfg::M;
  double Lz = impact_b_signed;
  double E = 1.0;

  // Radial effective potential R(r) = [(r^2 + a^2)E - a Lz]^2 - Delta*(Lz - a E)^2
  // Use dr/dlambda = -sqrt(R(r)), dphi/dlambda = (a*(r^2+a^2)*E - a^2*Lz)/Delta + (Lz - a*E)
  auto eval_rhs = [&](double r, double dir_sign, double& dr, double& dphi, double& dfd) {
    double r2 = r * r;
    double a2 = a * a;
    double delta = r2 - 2.0 * M * r + a2;
    if (delta <= 1e-8) {
      dr = 0.0;
      dphi = 0.0;
      dfd = 0.0;
      return false;
    }
    double p = (r2 + a2) * E - a * Lz;
    double q = (Lz - a * E);
    double R = p * p - delta * q * q;
    if (R < 0.0) {
      dr = 0.0;
    } else {
      dr = dir_sign * std::sqrt(R);
    }
    // Total dphi/dlambda = [a * p / delta + q] -> note standard dphi/dlambda = (2MarE + (r-2M)Lz) / (r*Delta)
    dphi = (2.0 * M * a * r * E + (r - 2.0 * M) * Lz) / (r * delta);
    // Frame dragging component beyond Schwarzschild angular rate
    dfd = (2.0 * M * a * r * E) / (r * delta);
    return true;
  };

  double r = r_obs;
  double dir_sign = -1.0; // ingoing
  double phi_abs = 0.0;
  double r_horizon = M + std::sqrt(std::max(0.0, M * M - a * a));
  double dl = 0.03;

  for (int step = 0; step < 30000; ++step) {
    double r2 = r * r;
    double a2 = a * a;
    double delta = r2 - 2.0 * M * r + a2;
    double p = (r2 + a2) * E - a * Lz;
    double q = (Lz - a * E);
    double R = p * p - delta * q * q;
    if (R <= 0.0 && dir_sign < 0.0) {
      dir_sign = 1.0; // periapsis reflection
      r += 1e-5;
    }

    double h = std::min(dl, 0.04 * std::max(0.25, r - r_horizon));
    double dr1, dp1, df1;
    if (!eval_rhs(r, dir_sign, dr1, dp1, df1)) break;
    double r_mid = std::max(r_horizon + 1e-5, r + 0.5 * h * dr1);
    double dr2, dp2, df2;
    if (!eval_rhs(r_mid, dir_sign, dr2, dp2, df2)) break;
    double r_end = std::max(r_horizon + 1e-5, r + h * dr2);
    double dr3, dp3, df3;
    if (!eval_rhs(r_end, dir_sign, dr3, dp3, df3)) break;

    double r_next = r + h * (dr1 + 4.0 * dr2 + dr3) / 6.0;
    double dphi_step = h * (dp1 + 4.0 * dp2 + dp3) / 6.0;
    double dfd_step = h * (df1 + 4.0 * df2 + df3) / 6.0;

    if (r_next <= r_horizon + 1e-4) {
      return {false, phi_abs, 0.0, 1.0 / r_horizon};
    }
    if (dir_sign > 0.0 && r_next > r_obs * 2.5) {
      return {true, phi_abs, phi_abs - PI, 1.0 / r};
    }

    r = r_next;
    phi_abs += std::abs(dphi_step);
    (void)dfd_step;
    if (trace_r_dphi_fd) {
      trace_r_dphi_fd->push_back({phi_abs, 1.0 / r});
    }
    if (phi_abs >= max_phi) break;
  }

  return {r > r_horizon + 0.02, phi_abs, phi_abs - PI, 1.0 / r};
}

// CIE 1931 2-deg CMF (380nm..780nm in 10nm steps, 41 samples) -> accurate Planckian sRGB
inline void planck_rgb_linear(double temp_k, float out_rgb[3]) {
  static constexpr double cie_x[41] = {
      0.0014, 0.0042, 0.0143, 0.0435, 0.1344, 0.2839, 0.3483, 0.3362, 0.2908, 0.1954, 0.0956,
      0.0320, 0.0049, 0.0093, 0.0633, 0.1655, 0.2904, 0.4334, 0.5945, 0.7621, 0.9163, 1.0263,
      1.0622, 1.0026, 0.8544, 0.6424, 0.4479, 0.2835, 0.1649, 0.0874, 0.0468, 0.0227, 0.0114,
      0.0058, 0.0029, 0.0014, 0.0007, 0.0003, 0.0002, 0.0001, 0.0000};
  static constexpr double cie_y[41] = {
      0.0000, 0.0001, 0.0004, 0.0012, 0.0040, 0.0116, 0.0230, 0.0380, 0.0600, 0.0910, 0.1390,
      0.2080, 0.3230, 0.5030, 0.7100, 0.8620, 0.9540, 0.9950, 0.9950, 0.9520, 0.8700, 0.7570,
      0.6310, 0.5030, 0.3810, 0.2650, 0.1750, 0.1070, 0.0610, 0.0320, 0.0170, 0.0082, 0.0041,
      0.0021, 0.0010, 0.0005, 0.0002, 0.0001, 0.0001, 0.0000, 0.0000};
  static constexpr double cie_z[41] = {
      0.0065, 0.0201, 0.0679, 0.2074, 0.6456, 1.3856, 1.7471, 1.7721, 1.6692, 1.2876, 0.8130,
      0.4652, 0.2720, 0.1582, 0.0782, 0.0422, 0.0203, 0.0087, 0.0039, 0.0021, 0.0017, 0.0011,
      0.0008, 0.0003, 0.0002, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000,
      0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000};

  // hc / k_B = 0.0143877735 m*K
  constexpr double c2 = 0.0143877735;
  double X = 0.0, Y = 0.0, Z = 0.0;
  for (int i = 0; i < 41; ++i) {
    double lam = (380.0 + 10.0 * i) * 1e-9;
    double l5 = lam * lam * lam * lam * lam;
    double expo = std::min(700.0, c2 / (lam * temp_k));
    double b_lam = 1.0 / (l5 * (std::exp(expo) - 1.0));
    X += b_lam * cie_x[i];
    Y += b_lam * cie_y[i];
    Z += b_lam * cie_z[i];
  }

  // Normalize chromaticity at constant luminance Y=1, then scale by physical T^4 luminance factor
  if (Y <= 1e-30) {
    out_rgb[0] = out_rgb[1] = out_rgb[2] = 0.0f;
    return;
  }
  double x_n = X / Y;
  double y_n = 1.0;
  double z_n = Z / Y;

  // XYZ -> linear sRGB/BT.709 (D65)
  double r = 3.2406 * x_n - 1.5372 * y_n - 0.4986 * z_n;
  double g = -0.9689 * x_n + 1.8758 * y_n + 0.0415 * z_n;
  double b = 0.0557 * x_n - 0.2040 * y_n + 1.0570 * z_n;

  // White-balance subtly toward 7800K so hottest inner ring reads blue-white, 7800K pure neutral, <4000K amber-crimson
  r = std::max(0.0, r * 0.94);
  g = std::max(0.0, g * 1.00);
  b = std::max(0.0, b * 1.12);

  double lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum > 1e-8) {
    r /= lum;
    g /= lum;
    b /= lum;
  }

  // Smooth HDR intensity curve anchored at 6500K = 1.0 (avoiding 40000K blowing out by 1000x while preserving physical contrast)
  double t_rel = temp_k / 6500.0;
  double intensity = std::pow(t_rel, 1.85);
  out_rgb[0] = static_cast<float>(r * intensity);
  out_rgb[1] = static_cast<float>(g * intensity);
  out_rgb[2] = static_cast<float>(b * intensity);
}

inline double novikov_thorne_temp_norm(double r, double r_in = bh_cfg::DISK_R_IN) {
  if (r <= r_in) return 0.0;
  auto f = [r_in](double rad) {
    double q = std::sqrt(r_in / rad);
    return std::pow(std::max(0.0, (1.0 - q) / (rad * rad * rad)), 0.25);
  };
  double peak = f((49.0 / 36.0) * r_in);
  return peak > 0.0 ? f(r) / peak : 0.0;
}

inline double observed_g_factor(
    double r,
    double b,
    double sin_theta0,
    double sin_psi,
    double spin_sense = 1.0,
    double r_obs = 1e12) {
  double safe_r = std::max(bh_cfg::PHOTON_SPHERE_R + 1e-4, r);
  double g_grav = std::sqrt(std::max(1e-5, 1.0 - 3.0 * bh_cfg::M / safe_r));
  double omega = std::sqrt(bh_cfg::M / (safe_r * safe_r * safe_r));
  double obs_lapse = (r_obs < 1e9) ? std::sqrt(1.0 - bh_cfg::RS / r_obs) : 1.0;
  double denom = std::max(0.22, 1.0 + spin_sense * omega * b * sin_theta0 * sin_psi);
  return (g_grav / obs_lapse) / denom;
}

} // namespace bh_phys
