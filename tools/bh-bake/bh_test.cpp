#include "bh_physics.hpp"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <limits>

static void expect_close(const char* name, double actual, double expected, double tol) {
  double err = std::abs(actual - expected);
  if (err > tol || !std::isfinite(actual)) {
    std::fprintf(stderr, "FAIL %s: actual=%.12f expected=%.12f err=%.3e tol=%.3e\n",
                 name, actual, expected, err, tol);
    std::exit(1);
  }
  std::printf("PASS %-36s actual=%.10f expected=%.10f err=%.3e\n", name, actual, expected, err);
}

int main() {
  // 1. Exact Schwarzschild radii
  expect_close("photon_sphere = 3M = 1.5 rs", bh_cfg::PHOTON_SPHERE_R, 3.0 * bh_cfg::M, 1e-12);
  expect_close("shadow_bc = 3*sqrt(3)*M", bh_cfg::SHADOW_RADIUS_BC, 3.0 * std::sqrt(3.0) * bh_cfg::M, 1e-12);
  expect_close("isco = 6M = 3.0 rs", bh_cfg::ISCO_R, 6.0 * bh_cfg::M, 1e-12);

  // 2. Capture threshold around b_c = 3*sqrt(3)*M
  double bc = bh_cfg::SHADOW_RADIUS_BC;
  const double inf = std::numeric_limits<double>::infinity();
  auto cap = bh_phys::integrate_schwarzschild(bc - 1e-4, inf, 25.0, [](double, double, const bh_phys::GeodesicState&, const bh_phys::GeodesicState&) {});
  auto esc = bh_phys::integrate_schwarzschild(bc + 1e-4, inf, 25.0, [](double, double, const bh_phys::GeodesicState&, const bh_phys::GeodesicState&) {});
  if (cap.escaped || !esc.escaped) {
    std::fprintf(stderr, "FAIL capture threshold: cap.escaped=%d esc.escaped=%d\n", cap.escaped, esc.escaped);
    return 1;
  }
  std::printf("PASS capture_threshold                    b_c-1e-4 captured, b_c+1e-4 escaped (phi=%.4f)\n", esc.phi_end);

  // 3. Weak-field deflection -> 4M/b + 15*pi*M^2/(4*b^2) + (128/3)*(M/b)^3 at large b
  for (double b_test : {50.0, 200.0}) {
    auto wf = bh_phys::integrate_schwarzschild(b_test, inf, 5.0, [](double, double, const bh_phys::GeodesicState&, const bh_phys::GeodesicState&) {});
    double mb = bh_cfg::M / b_test;
    double analytic_1st = 4.0 * mb;
    double analytic_3rd = analytic_1st + (15.0 * bh_phys::PI / 4.0) * mb * mb + (128.0 / 3.0) * mb * mb * mb;
    expect_close(b_test > 100.0 ? "weak_field b=200 vs 4M/b" : "weak_field b=50 vs 4M/b", wf.deflection, analytic_1st, b_test > 100.0 ? 1e-4 : 1.5e-3);
    expect_close(b_test > 100.0 ? "weak_field b=200 3rd-order" : "weak_field b=50 3rd-order", wf.deflection, analytic_3rd, 1e-5);
  }

  // 4. Novikov-Thorne peak at (49/36) * r_in
  expect_close("novikov_thorne_peak_at_1.3611_rin", bh_phys::novikov_thorne_temp_norm((49.0 / 36.0) * bh_cfg::DISK_R_IN), 1.0, 1e-12);
  if (bh_phys::novikov_thorne_temp_norm(bh_cfg::DISK_R_IN * 1.1) >= 1.0 ||
      bh_phys::novikov_thorne_temp_norm(bh_cfg::DISK_R_IN * 2.0) >= 1.0) {
    std::fprintf(stderr, "FAIL Novikov-Thorne monotonicity around peak\n");
    return 1;
  }

  // 5. LUT b <-> u invertibility
  for (double b_val : {0.0, 1.0, bc, bc + 0.002, 5.5, 42.0}) {
    double u = bh_phys::b_to_lut_u(b_val);
    expect_close("lut_roundtrip", bh_phys::lut_u_to_b(u), b_val, 1e-9);
  }

  // 6. Blackbody color order: 30000K blue > red, 2000K red > blue
  float c_hot[3], c_cool[3];
  bh_phys::planck_rgb_linear(30000.0, c_hot);
  bh_phys::planck_rgb_linear(2000.0, c_cool);
  if (!(c_hot[2] > c_hot[0] && c_cool[0] > c_cool[2])) {
    std::fprintf(stderr, "FAIL Planck color ordering\n");
    return 1;
  }
  std::printf("PASS planck_color_balance                 30000K=(%.2f,%.2f,%.2f) 2000K=(%.2f,%.2f,%.2f)\n",
               c_hot[0], c_hot[1], c_hot[2], c_cool[0], c_cool[1], c_cool[2]);

  // 7. Kerr equatorial prograde photon orbit tighter than retrograde
  auto kerr_pro = bh_phys::integrate_kerr_equatorial(1.6, 40.0, 8.0);
  auto kerr_ret = bh_phys::integrate_kerr_equatorial(-3.1, 40.0, 8.0);
  if (!kerr_pro.escaped || kerr_ret.escaped) {
    std::fprintf(stderr, "FAIL Kerr asymmetric capture: pro=%d ret=%d\n", kerr_pro.escaped, kerr_ret.escaped);
    return 1;
  }
  std::printf("PASS kerr_asymmetric_shadow               b=+1.6 escaped (prograde), b=-3.1 captured (retrograde)\n");

  return 0;
}
